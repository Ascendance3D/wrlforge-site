// Deterministic tests for the release data layer and download UI.
// Run: node --test test/
//
// The Worker's GitHub API call is replaced with a stub, so these tests need no
// network and no token. The fixture is the official
// GET /repos/Ascendance3D/wrlforge/releases?per_page=15 response, captured on
// 2026-10-09 when v1.4.0 was the newest release, trimmed to the fields the
// Worker reads plus each asset's content_type, state and digest. All nine asset URLs
// were checked to return HTTP 200 with the listed sizes, and the digests match
// SHA256SUMS-1.4.0.txt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../worker.js";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/github-releases-v1.4.0.json", import.meta.url), "utf8"));
const RELEASES_PAGE = "https://github.com/Ascendance3D/wrlforge/releases";
const DL = "https://github.com/Ascendance3D/wrlforge/releases/download/v1.4.0/";

const json = (body, status = 200, headers = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function render(stub) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return stub(url, init); };
  try {
    const res = await worker.fetch(new Request("https://wrlforge.com/"), {}, {});
    return { res, html: await res.text(), calls };
  } finally {
    globalThis.fetch = orig;
  }
}

const tiles = html => [...html.matchAll(/<a href="([^"]+)" class="plat"(?: aria-label="([^"]+)")?>/g)].map(m => ({ href: m[1], label: m[2] || null }));
const rows = html => [...html.matchAll(/<li class="dl-row"><a href="([^"]+)">[\s\S]*?<span class="dl-os">[\s\S]*?<span>([^<]+)<\/span><\/span>\s*<span class="dl-kind">([^<]+)<\/span>\s*<span class="dl-name">([^<]+)<\/span>\s*<span class="dl-size">([^<]*)<\/span>/g)]
  .map(m => ({ href: m[1], os: m[2], kind: m[3], name: m[4], size: m[5] }));
const checksums = html => (html.match(/<a href="([^"]+)">SHA-256 checksums<\/a>/) || [])[1] || null;

function assertFallback(html, res) {
  assert.equal(res.status, 200);
  const t = tiles(html);
  assert.equal(t.length, 3);
  for (const x of t) { assert.equal(x.href, RELEASES_PAGE); assert.equal(x.label, null); }
  assert.equal((html.match(/See all releases →/g) || []).length, 3);
  assert.equal(rows(html).length, 0);
  assert.equal(checksums(html), null);
  assert.ok(html.includes("Release history is on GitHub"));
  assert.ok(html.includes(`href="${RELEASES_PAGE}/latest"`), "release notes link falls back to /latest");
  assert.ok(!html.includes("Stable"), "an unresolved release must not be labeled Stable");
}

test("calls the public releases API once, without credentials", async () => {
  const { calls } = await render(() => json(FIXTURE));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.github.com/repos/Ascendance3D/wrlforge/releases?per_page=15");
  const h = calls[0].init.headers;
  assert.equal(h["Accept"], "application/vnd.github+json");
  assert.ok(!Object.keys(h).some(k => k.toLowerCase() === "authorization"));
});

test("v1.4.0: platform tiles link straight to the policy artifacts", async () => {
  const { html } = await render(() => json(FIXTURE));
  assert.deepEqual(tiles(html), [
    { href: DL + "WRL-Forge-Setup-1.4.0-x64.exe", label: "Download for Windows (Windows · x64): Installer (Setup), 106 MB" },
    { href: DL + "WRL-Forge-1.4.0-mac-arm64.dmg", label: "Download for macOS (macOS · Apple Silicon): Disk Image, 122 MB" },
    { href: DL + "WRL-Forge-1.4.0-linux-x64.AppImage", label: "Download for Linux (Linux · x64): AppImage, 128 MB" },
  ]);
});

test("v1.4.0: all eight artifacts are listed with platform, kind and size", async () => {
  const { html } = await render(() => json(FIXTURE));
  assert.deepEqual(rows(html), [
    { os: "Windows", kind: "Portable (zip)", name: "WRL-Forge-1.4.0-windows-x64.zip", size: "155 MB" },
    { os: "Windows", kind: "MSI installer", name: "WRL-Forge-1.4.0-x64.msi", size: "121 MB" },
    { os: "Windows", kind: "Portable (exe)", name: "WRL-Forge-Portable-1.4.0-x64.exe", size: "106 MB" },
    { os: "Windows", kind: "Installer (Setup)", name: "WRL-Forge-Setup-1.4.0-x64.exe", size: "106 MB" },
    { os: "macOS", kind: "Disk Image", name: "WRL-Forge-1.4.0-mac-arm64.dmg", size: "122 MB" },
    { os: "macOS", kind: "Portable (zip)", name: "WRL-Forge-1.4.0-mac-arm64.zip", size: "122 MB" },
    { os: "Linux", kind: "AppImage", name: "WRL-Forge-1.4.0-linux-x64.AppImage", size: "128 MB" },
    { os: "Linux", kind: "Portable (tar.gz)", name: "WRL-Forge-1.4.0-linux-x64.tar.gz", size: "122 MB" },
  ].map(r => ({ href: DL + r.name, ...r })));
  assert.ok(html.includes("All files &amp; sizes <span class=\"dim\">(8)</span>"));
});

test("v1.4.0: every rendered artifact URL comes from the API response", async () => {
  const { html } = await render(() => json(FIXTURE));
  const fromApi = new Set(FIXTURE[0].assets.map(a => a.browser_download_url));
  const rendered = [...html.matchAll(/href="(https:\/\/github\.com\/[^"]+\/releases\/download\/[^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(rendered).size, 9);
  for (const u of rendered) assert.ok(fromApi.has(u), u);
  // architectures: Windows/Linux x64, macOS Apple Silicon only
  for (const r of rows(html)) assert.match(r.name, r.os === "macOS" ? /-arm64\./ : /-x64[.-]/);
});

test("v1.4.0: checksum manifest, release notes, version and history", async () => {
  const { html } = await render(() => json(FIXTURE));
  assert.equal(checksums(html), DL + "SHA256SUMS-1.4.0.txt");
  assert.ok(html.includes(`href="${RELEASES_PAGE}/tag/v1.4.0"`));
  assert.ok(html.includes('<span class="ver">v1.4.0</span><span class="tag dev">Beta (pre-release)</span><span class="label">Released 2026-09-22</span>'));
  const hist = [...html.matchAll(/<span class="t(?: latest)?">([^<]+)<\/span>[\s\S]*?<span class="dt">([^<]*)<\/span>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(hist, [["v1.4.0", "2026-09-22"], ["v1.3.0-beta.5", "2026-08-31"], ["v1.3.0-beta.3", "2026-07-25"], ["v1.3.0-beta.2", "2026-07-14"]]);
});

test("missing platform asset: that tile falls back, the others stay direct", async () => {
  const rel = structuredClone(FIXTURE);
  rel[0].assets = rel[0].assets.filter(a => !/mac-arm64/.test(a.name));
  const { html } = await render(() => json(rel));
  const t = tiles(html);
  assert.equal(t[0].href, DL + "WRL-Forge-Setup-1.4.0-x64.exe");
  assert.deepEqual(t[1], { href: RELEASES_PAGE, label: null });
  assert.equal(t[2].href, DL + "WRL-Forge-1.4.0-linux-x64.AppImage");
  assert.equal(rows(html).length, 6);
});

test("missing preferred kind: the next preferred artifact is used", async () => {
  const rel = structuredClone(FIXTURE);
  rel[0].assets = rel[0].assets.filter(a => !/Setup|\.dmg$|AppImage/.test(a.name));
  const t = tiles((await render(() => json(rel))).html).map(x => x.href);
  assert.deepEqual(t, [DL + "WRL-Forge-1.4.0-x64.msi", DL + "WRL-Forge-1.4.0-mac-arm64.zip", DL + "WRL-Forge-1.4.0-linux-x64.tar.gz"]);
});

test("release with no assets: version shown, every tile falls back", async () => {
  const rel = structuredClone(FIXTURE);
  rel[0].assets = [];
  const { html } = await render(() => json(rel));
  assert.ok(tiles(html).every(x => x.href === RELEASES_PAGE));
  assert.equal(rows(html).length, 0);
  assert.equal(checksums(html), null);
  assert.ok(html.includes('<span class="ver">v1.4.0</span>'));
});

test("drafts are skipped", async () => {
  const draft = { ...structuredClone(FIXTURE[0]), tag_name: "v9.9.9", draft: true };
  const { html } = await render(() => json([draft, ...FIXTURE]));
  assert.ok(!html.includes("v9.9.9"));
  assert.ok(html.includes('<span class="ver">v1.4.0</span>'));
});

const RATE_LIMIT = { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1791600000" };
const failures = {
  "HTTP 403 rate limit": () => json({ message: "API rate limit exceeded for 0.0.0.0." }, 403, RATE_LIMIT),
  "HTTP 429 secondary rate limit": () => json({ message: "You have exceeded a secondary rate limit." }, 429, { "retry-after": "60" }),
  "HTTP 500": () => json({ message: "Server Error" }, 500),
  "HTTP 404": () => json({ message: "Not Found" }, 404),
  "invalid JSON body": () => new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } }),
  "non-array JSON": () => json({ message: "unexpected" }),
  "empty release list": () => json([]),
  "only drafts": () => json(FIXTURE.map(r => ({ ...r, draft: true }))),
  "network error": () => { throw new TypeError("fetch failed"); },
};
for (const [name, stub] of Object.entries(failures)) {
  test(`fallback: ${name}`, async () => {
    const { res, html } = await render(stub);
    assertFallback(html, res);
  });
}

test("asset names from the API are HTML-escaped", async () => {
  const rel = structuredClone(FIXTURE);
  rel[0].assets.push({ name: 'x"><script>alert(1)</script>-linux.deb', size: 1, browser_download_url: DL + "x.deb" });
  const { html } = await render(() => json(rel));
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("x&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;-linux.deb"));
});
