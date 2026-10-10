// WRL Forge site — release data layer.
// Resolves the newest GitHub release of the product (prereleases INCLUDED) for
// the Worker in worker.js. Kept in its own module so tests can import these
// functions: the Workers runtime rejects non-handler named exports from the
// main module ("Incorrect type for map entry").

// The product repo lives at a single canonical location. (The owner migration
// is complete; the temporary old-owner fallback has been retired.)
const CANONICAL_REPO = "Ascendance3D/wrlforge";

function repoLinks(repo) {
  return {
    repo: `https://github.com/${repo}`,
    releases: `https://github.com/${repo}/releases`,
    rawMain: `https://raw.githubusercontent.com/${repo}/main`,
  };
}

// Fetch the release list from the canonical product repo.
// Returns { repo, releases }, or { repo: CANONICAL_REPO, releases: null } when
// the repo has no releases (404). Throws on any other API failure so a real
// GitHub outage is surfaced rather than hidden.
async function fetchReleases(fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.github.com/repos/${CANONICAL_REPO}/releases?per_page=15`, {
    headers: { "User-Agent": "WRLForge-Site-Worker", "Accept": "application/vnd.github+json" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (res.ok) return { repo: CANONICAL_REPO, releases: await res.json() };
  if (res.status === 404) return { repo: CANONICAL_REPO, releases: null };
  throw new Error(`GitHub releases API returned ${res.status} for ${CANONICAL_REPO}`);
}

// ---- release data layer ----------------------------------------------------

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  if (mb >= 100) return Math.round(mb) + " MB";
  return mb.toFixed(1) + " MB";
}

// Classify a release asset by filename into platform + human-friendly kind.
function classifyAsset(asset) {
  const n = asset.name.toLowerCase();
  const base = { platform: "other", os: "", kind: "Download", ext: "" };

  if (n.endsWith(".appimage")) return { ...base, platform: "linux", os: "Linux", kind: "AppImage", ext: "AppImage" };
  if (n.endsWith(".tar.gz"))   return { ...base, platform: "linux", os: "Linux", kind: "Portable (tar.gz)", ext: "tar.gz" };
  if (n.endsWith(".deb"))      return { ...base, platform: "linux", os: "Linux", kind: "Debian package", ext: "deb" };

  // macOS MUST be decided before the generic Windows .zip fallback below,
  // otherwise WRL-Forge-<v>-mac-arm64.zip is mislabelled as a Windows build.
  if (n.endsWith(".dmg")) return { ...base, platform: "mac", os: "macOS", kind: "Disk Image", ext: "dmg" };
  if (n.endsWith(".zip") && /(^|[-_.])(mac|macos|osx|darwin)([-_.]|$)/.test(n.slice(0, -4)))
    return { ...base, platform: "mac", os: "macOS", kind: "Portable (zip)", ext: "zip" };

  if (n.endsWith(".msi"))                            return { ...base, platform: "windows", os: "Windows", kind: "MSI installer", ext: "msi" };
  if (n.endsWith(".zip"))                            return { ...base, platform: "windows", os: "Windows", kind: "Portable (zip)", ext: "zip" };
  if (n.includes("portable") && n.endsWith(".exe")) return { ...base, platform: "windows", os: "Windows", kind: "Portable (exe)", ext: "exe" };
  if (n.endsWith(".exe"))                            return { ...base, platform: "windows", os: "Windows", kind: "Installer (Setup)", ext: "exe" };

  if (n.startsWith("sha256") || n.includes("sha256sums")) return { ...base, platform: "checksums", kind: "SHA-256 checksums", ext: "txt" };

  return base;
}

async function resolveReleaseModel(fetchImpl = fetch) {
  const model = {
    repo: CANONICAL_REPO,
    links: repoLinks(CANONICAL_REPO),
    version: "latest",
    releaseUrl: repoLinks(CANONICAL_REPO).releases + "/latest",
    prerelease: null, // unknown until a release resolves; never guess "Stable"
    assets: [],
    checksumsUrl: null,
    heroWindows: null,
    heroMac: null,
    heroLinux: null,
    publishedAt: null,
    history: [],
  };

  try {
    const { repo, releases } = await fetchReleases(fetchImpl);
    model.repo = repo;
    model.links = repoLinks(repo);
    model.releaseUrl = model.links.releases + "/latest";
    if (!releases) return model;

    const rel = Array.isArray(releases) ? releases.find(r => r && !r.draft) : null;
    if (!rel) return model;

    model.version = rel.tag_name || model.version;
    model.releaseUrl = rel.html_url || model.releaseUrl;
    model.prerelease = !!rel.prerelease;
    model.publishedAt = rel.published_at || null;

    // Release history for the "Development" section — straight from GitHub,
    // never hand-maintained, so dates and names can't drift.
    model.history = releases.filter(r => r && !r.draft).slice(0, 6).map(r => ({
      tag: r.tag_name || "",
      name: r.name || r.tag_name || "",
      url: r.html_url || model.links.releases,
      date: (r.published_at || "").slice(0, 10),
      prerelease: !!r.prerelease,
    }));

    const classified = (rel.assets || []).map(a => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
      sizeLabel: formatBytes(a.size),
      ...classifyAsset(a),
    }));

    for (const a of classified) {
      if (a.platform === "checksums") { model.checksumsUrl = a.url; continue; }
      if (a.platform === "windows" || a.platform === "mac" || a.platform === "linux") model.assets.push(a);
    }

    const byKind = (arr, kinds) => kinds.map(k => arr.find(a => a.kind === k)).find(Boolean);
    const win = model.assets.filter(a => a.platform === "windows");
    const mac = model.assets.filter(a => a.platform === "mac");
    const lin = model.assets.filter(a => a.platform === "linux");
    model.heroWindows = byKind(win, ["Installer (Setup)", "MSI installer", "Portable (exe)", "Portable (zip)"]) || win[0] || null;
    model.heroMac     = byKind(mac, ["Disk Image", "Portable (zip)"]) || mac[0] || null;
    model.heroLinux   = byKind(lin, ["AppImage", "Portable (tar.gz)", "Debian package"]) || lin[0] || null;

    const order = { windows: 0, mac: 1, linux: 2 };
    model.assets.sort((a, b) => (order[a.platform] - order[b.platform]) || a.name.localeCompare(b.name));
  } catch (e) {
    // Real API/network failure: keep the page up with default links, but
    // surface the error in Worker logs rather than hiding it.
    console.error("release lookup failed:", e && e.message ? e.message : e);
  }

  return model;
}

export { CANONICAL_REPO, repoLinks, fetchReleases, formatBytes, classifyAsset, resolveReleaseModel };
