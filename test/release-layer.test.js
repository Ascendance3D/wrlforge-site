// Repository-migration compatibility tests for the release data layer.
// Simulates GitHub API responses so no network is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_REPO, FALLBACK_REPO, repoLinks, fetchReleases,
  classifyAsset, resolveReleaseModel, renderPage,
} from "../worker.js";

const NEW_API = `https://api.github.com/repos/${CANONICAL_REPO}/releases?per_page=15`;
const OLD_API = `https://api.github.com/repos/${FALLBACK_REPO}/releases?per_page=15`;

// Real v1.4.0 asset names as published on GitHub (captured 2026-09-26).
const ASSET_NAMES = [
  "SHA256SUMS-1.4.0.txt",
  "WRL-Forge-1.4.0-linux-x64.AppImage",
  "WRL-Forge-1.4.0-linux-x64.tar.gz",
  "WRL-Forge-1.4.0-mac-arm64.dmg",
  "WRL-Forge-1.4.0-mac-arm64.zip",
  "WRL-Forge-1.4.0-windows-x64.zip",
  "WRL-Forge-1.4.0-x64.msi",
  "WRL-Forge-Portable-1.4.0-x64.exe",
  "WRL-Forge-Setup-1.4.0-x64.exe",
];

function release(repo, tag = "v1.4.0", prerelease = true) {
  return {
    tag_name: tag, draft: false, prerelease,
    html_url: `https://github.com/${repo}/releases/tag/${tag}`,
    assets: ASSET_NAMES.map((name, i) => ({
      name, size: 10_000_000 + i,
      browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${name}`,
    })),
  };
}

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const mockFetch = (table) => {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const r = table[url];
    if (!r) throw new Error("unexpected URL " + url);
    return typeof r === "function" ? r() : r;
  };
  fn.calls = calls;
  return fn;
};

test("STATE A: new repo 404 + old repo success -> release data comes from old repo", async () => {
  const f = mockFetch({ [NEW_API]: json(404, { message: "Not Found" }), [OLD_API]: json(200, [release(FALLBACK_REPO)]) });
  const m = await resolveReleaseModel(f);
  assert.deepEqual(f.calls, [NEW_API, OLD_API]);
  assert.equal(m.repo, FALLBACK_REPO);
  assert.equal(m.version, "v1.4.0");
  assert.equal(m.links.releases, `https://github.com/${FALLBACK_REPO}/releases`);
  assert.equal(m.assets.length, 8);
  assert.ok(m.heroWindows && m.heroMac && m.heroLinux);
});

test("STATE B: new repo success -> new repo authoritative, old repo never queried", async () => {
  const f = mockFetch({ [NEW_API]: json(200, [release(CANONICAL_REPO)]), [OLD_API]: () => { throw new Error("must not be called"); } });
  const m = await resolveReleaseModel(f);
  assert.deepEqual(f.calls, [NEW_API]);
  assert.equal(m.repo, CANONICAL_REPO);
  assert.equal(m.version, "v1.4.0");
  assert.equal(m.links.releases, `https://github.com/${CANONICAL_REPO}/releases`);
  assert.match(m.heroWindows.url, new RegExp(`^https://github.com/${CANONICAL_REPO}/`));
});

test("non-404 error on new repo is NOT a fallback trigger and is surfaced", async () => {
  const f = mockFetch({ [NEW_API]: json(500, {}), [OLD_API]: () => { throw new Error("must not be called"); } });
  await assert.rejects(fetchReleases(f), /500/);
  // resolveReleaseModel still keeps the page up with canonical default links.
  const m = await resolveReleaseModel(f);
  assert.equal(m.version, "latest");
  assert.equal(m.links.releases, `https://github.com/${CANONICAL_REPO}/releases`);
  assert.deepEqual(f.calls, [NEW_API, NEW_API]);
});

test("both repos 404 -> defaults with canonical links, no throw", async () => {
  const f = mockFetch({ [NEW_API]: json(404, {}), [OLD_API]: json(404, {}) });
  const m = await resolveReleaseModel(f);
  assert.equal(m.version, "latest");
  assert.equal(m.repo, CANONICAL_REPO);
  assert.equal(m.assets.length, 0);
});

test("asset classification unchanged for v1.4.0 asset set", () => {
  const got = Object.fromEntries(ASSET_NAMES.map(n => [n, classifyAsset({ name: n })]).map(([n, c]) => [n, `${c.platform}/${c.kind}`]));
  assert.deepEqual(got, {
    "SHA256SUMS-1.4.0.txt": "checksums/SHA-256 checksums",
    "WRL-Forge-1.4.0-linux-x64.AppImage": "linux/AppImage",
    "WRL-Forge-1.4.0-linux-x64.tar.gz": "linux/Portable (tar.gz)",
    "WRL-Forge-1.4.0-mac-arm64.dmg": "mac/Disk Image",
    "WRL-Forge-1.4.0-mac-arm64.zip": "mac/Portable (zip)",
    "WRL-Forge-1.4.0-windows-x64.zip": "windows/Portable (zip)",
    "WRL-Forge-1.4.0-x64.msi": "windows/MSI installer",
    "WRL-Forge-Portable-1.4.0-x64.exe": "windows/Portable (exe)",
    "WRL-Forge-Setup-1.4.0-x64.exe": "windows/Installer (Setup)",
  });
});

for (const [label, repo, table] of [
  ["pre-transfer", FALLBACK_REPO, () => ({ [NEW_API]: json(404, {}), [OLD_API]: json(200, [release(FALLBACK_REPO)]) })],
  ["post-transfer", CANONICAL_REPO, () => ({ [NEW_API]: json(200, [release(CANONICAL_REPO)]) })],
]) {
  test(`${label}: Windows/macOS/Linux hero downloads, prerelease flag, checksums`, async () => {
    const m = await resolveReleaseModel(mockFetch(table()));
    const dl = `https://github.com/${repo}/releases/download/v1.4.0/`;
    assert.equal(m.heroWindows.url, dl + "WRL-Forge-Setup-1.4.0-x64.exe");
    assert.equal(m.heroMac.url, dl + "WRL-Forge-1.4.0-mac-arm64.dmg");
    assert.equal(m.heroLinux.url, dl + "WRL-Forge-1.4.0-linux-x64.AppImage");
    assert.equal(m.assets.filter(a => a.platform === "windows").length, 4);
    assert.equal(m.assets.filter(a => a.platform === "mac").length, 2);
    assert.equal(m.assets.filter(a => a.platform === "linux").length, 2);
    assert.equal(m.prerelease, true);
    assert.equal(m.checksumsUrl, dl + "SHA256SUMS-1.4.0.txt");
    const html = renderPage(m);
    assert.ok(html.includes("PRE-RELEASE BETA"));
    assert.ok(html.includes(m.checksumsUrl));
    assert.ok(html.includes(`href="https://github.com/${repo}" target="_blank" rel="noopener">App Repository`));
    assert.ok(html.includes(`https://raw.githubusercontent.com/${repo}/main/assets/generated/icons/runtime/icon.png`));
    assert.ok(!html.includes("undefined"));
  });
}

test("stable (non-prerelease) release still supported", async () => {
  const m = await resolveReleaseModel(mockFetch({ [NEW_API]: json(200, [release(CANONICAL_REPO, "v2.0.0", false)]) }));
  assert.equal(m.prerelease, false);
  assert.ok(renderPage(m).includes("STABLE"));
});

test("repoLinks shape", () => {
  assert.deepEqual(repoLinks("X/y"), { repo: "https://github.com/X/y", releases: "https://github.com/X/y/releases", rawMain: "https://raw.githubusercontent.com/X/y/main" });
});
