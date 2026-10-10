// WRL Forge marketing site — Cloudflare Worker.
// Renders the landing page server-side and resolves the newest GitHub release
// (prereleases INCLUDED — the product currently ships beta prereleases, which
// the /releases/latest endpoint deliberately hides).

const REPO = "Ascendance3D/wrlforge";
const RELEASES_PAGE = "https://github.com/Ascendance3D/wrlforge/releases";

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

async function resolveReleaseModel() {
  const model = {
    version: "latest",
    releaseUrl: RELEASES_PAGE + "/latest",
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
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=15`, {
      headers: { "User-Agent": "WRLForge-Site-Worker", "Accept": "application/vnd.github+json" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!res.ok) return model;

    const releases = await res.json();
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
      url: r.html_url || RELEASES_PAGE,
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
    // Silent fallback to defaults above.
  }

  return model;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ---- scene + glyph generators (pure SVG, no assets) ------------------------

// Wireframe VRML primitives — used as capability marks and in the fallback.
// Stroke colors come from CSS (currentColor / .v vertex class) so they follow
// the light/dark theme.
function primitiveIcon(kind) {
  const s = `class="prim-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false"`;
  const stroke = `fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"`;
  const back = `fill="none" stroke="currentColor" stroke-width="1" opacity="0.35"`;
  const dot = (x, y) => `<rect class="v" x="${x - 2}" y="${y - 2}" width="4" height="4"/>`;
  switch (kind) {
    case "Box":
      return `<svg ${s}><g ${back}><polyline points="14,44 30,36 50,44"/><line x1="30" y1="36" x2="30" y2="16"/></g>
        <g ${stroke}><polygon points="14,24 34,16 50,24 30,32"/><polyline points="14,24 14,44 30,52 30,32"/>
        <polyline points="50,24 50,44 30,52"/></g>${dot(14,24)}${dot(50,24)}${dot(30,52)}${dot(34,16)}</svg>`;
    case "Transform":
      return `<svg ${s}><g ${stroke}><line x1="32" y1="32" x2="54" y2="32"/><polyline points="48,27 54,32 48,37"/>
        <line x1="32" y1="32" x2="32" y2="10"/><polyline points="27,16 32,10 37,16"/>
        <line x1="32" y1="32" x2="14" y2="48"/><polyline points="15,41 14,48 21,47"/></g>${dot(32,32)}</svg>`;
    case "Group":
      return `<svg ${s}><g ${stroke}><rect x="10" y="10" width="20" height="20"/><rect x="34" y="34" width="20" height="20"/>
        <path d="M20 30 V44 H34 M30 20 H44 V34"/></g>${dot(20,30)}${dot(44,34)}</svg>`;
    case "Material":
      return `<svg ${s}><g ${stroke}><circle cx="32" cy="32" r="20"/><path d="M18 22 A20 20 0 0 1 42 14"/></g>
        <g ${back}><ellipse cx="32" cy="32" rx="20" ry="7"/></g>${dot(24,22)}</svg>`;
    case "Route":
      return `<svg ${s}><g ${stroke}><rect x="6" y="22" width="16" height="20"/><rect x="42" y="22" width="16" height="20"/>
        <path d="M22 32 H40"/><polyline points="35,27 41,32 35,37"/></g>${dot(22,32)}${dot(42,32)}</svg>`;
    default:
      return `<svg ${s}><circle cx="32" cy="32" r="18" ${stroke}/></svg>`;
  }
}

// Static hero fallback (no WebGL / reduced motion / small screens): a framed
// wireframe Box with an RGB axis gizmo, drawn like an editor viewport.
function heroFallback() {
  return `<svg class="hero-fallback" viewBox="0 0 400 400" role="img" aria-label="Wireframe preview of a VRML Box node">
    <g fill="none" stroke="currentColor" stroke-linejoin="round">
      <g opacity="0.3" stroke-width="1"><polyline points="110,250 200,295 300,250"/><line x1="200" y1="295" x2="200" y2="145"/></g>
      <g stroke-width="2"><polygon points="110,150 200,105 300,150 210,195"/><polyline points="110,150 110,250 210,295 210,195"/>
      <polyline points="300,150 300,250 210,295"/></g>
    </g>
    <g class="v">${[[110,150],[200,105],[300,150],[210,195],[110,250],[210,295],[300,250]]
      .map(([x, y]) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8"/>`).join("")}</g>
    <g stroke-width="2" stroke-linecap="square">
      <line x1="40" y1="360" x2="88" y2="360" stroke="#e5534b"/>
      <line x1="40" y1="360" x2="40" y2="312" stroke="#46b450"/>
      <line x1="40" y1="360" x2="18" y2="382" stroke="#4a8fe0"/>
    </g>
  </svg>`;
}

// ---- download UI -----------------------------------------------------------

// Self-hosted OS marks (house rule: no CDN). Purely decorative — the platform
// name is always present as adjacent text, so the icons carry alt="" and are
// hidden from assistive tech rather than repeating the label.
const OS_ICONS = {
  windows: "icons8-windows-11",
  mac:     "icons8-mac-client",
  linux:   "icons8-linux",
};

function osIcon(platform, px, cls) {
  const stem = OS_ICONS[platform];
  if (!stem) return "";
  return `<img class="${cls}" src="/os-icons/${stem}-30.png"` +
    ` srcset="/os-icons/${stem}-30.png 1x, /os-icons/${stem}-60.png 2x, /os-icons/${stem}-90.png 3x"` +
    ` width="${px}" height="${px}" alt="" aria-hidden="true" decoding="async">`;
}

// One platform tile in the download band. Arch is stated from the owner's
// platform policy (docs/RELEASES.md): Windows x64, macOS Apple Silicon, Linux x64.
function platformTile(asset, platform, os, arch) {
  const mark = osIcon(platform, 26, "btn-ico");
  if (!asset) {
    return `<a href="${RELEASES_PAGE}" class="plat">
      <span class="p-os">${esc(arch)}</span>
      <span class="p-title">${mark}<span>${esc(os)}</span></span>
      <span class="p-sub">See all releases →</span></a>`;
  }
  return `<a href="${esc(asset.url)}" class="plat" aria-label="Download for ${esc(os)} (${esc(arch)}): ${esc(asset.kind)}, ${esc(asset.sizeLabel)}">
    <span class="p-os">${esc(arch)}</span>
    <span class="p-title">${mark}<span>${esc(os)}</span></span>
    <span class="p-sub">${esc(asset.kind)} · ${esc(asset.sizeLabel)} ↓</span></a>`;
}

function downloadsList(model) {
  if (!model.assets.length) return "";
  const rows = model.assets.map(a => `
    <li class="dl-row"><a href="${esc(a.url)}">
      <span class="dl-os">${osIcon(a.platform, 16, "dl-ico")}<span>${esc(a.os)}</span></span>
      <span class="dl-kind">${esc(a.kind)}</span>
      <span class="dl-name">${esc(a.name)}</span>
      <span class="dl-size">${esc(a.sizeLabel)}</span></a></li>`).join("");
  return `<details class="all-downloads">
    <summary><span class="tw" aria-hidden="true">+</span> All files &amp; sizes <span class="dim">(${model.assets.length})</span></summary>
    <ul class="dl-list">${rows}</ul></details>`;
}

// ---- page content ----------------------------------------------------------

const APP = "https://github.com/Ascendance3D/wrlforge";
const DOC = APP + "/blob/main/";
const LINKS = {
  repo: APP,
  docs: APP + "#readme",
  usage: DOC + "docs/SCREENSHOTS_AND_USAGE.md",
  install: DOC + "docs/INSTALLATION.md",
  troubleshooting: DOC + "docs/TROUBLESHOOTING.md",
  releasesDoc: DOC + "docs/RELEASES.md",
  changelog: DOC + "CHANGELOG.md",
  roadmap: DOC + "docs/WRL_FORGE_ROADMAP.md",
  support: DOC + "SUPPORT.md",
  discussions: APP + "/discussions",
  issues: APP + "/issues/new/choose",
  security: DOC + "SECURITY.md",
  license: DOC + "LICENSE",
  credits: APP + "#credits-and-historical-inspiration",
  notices: DOC + "THIRD_PARTY_NOTICES.md",
  siteRepo: "https://github.com/Ascendance3D/wrlforge-site",
  siteLicense: "https://github.com/Ascendance3D/wrlforge-site/blob/master/LICENSE",
};

// Feature states are verified against the application repository, never
// guessed: ok = shipped in the current release, dev = merged/active but not
// released, plan = roadmap only. Re-verify before changing a state.
const STATE = { ok: "Available", dev: "In development", plan: "Planned" };
const tag = s => `<span class="tag ${s}">${STATE[s]}</span>`;

const CAPS = [
  { k: "Model", icon: "Box", items: [
    ["Add Box and Sphere, duplicate, delete", "dev"],
    ["Click to select in the viewport", "dev"],
    ["Typed position, rotation and size", "dev"],
    ["Transform gizmos", "plan"],
    ["Snapping", "plan"],
  ]},
  { k: "Structure", icon: "Group", items: [
    ["Scene tree (read-only)", "ok"],
    ["DEF/USE resolution in the tree", "ok"],
    ["Grouping and reparenting", "plan"],
    ["PROTO visual workflow", "plan"],
  ]},
  { k: "Appearance", icon: "Material", items: [
    ["Texture scanning and packaging", "ok"],
    ["Object color", "dev"],
    ["Materials and textures editing", "plan"],
    ["Transparency and presets", "plan"],
  ]},
  { k: "Behavior", icon: "Route", items: [
    ["ROUTEs shown in the scene tree", "ok"],
    ["ROUTE editor", "plan"],
    ["Sensors", "plan"],
    ["Scripts in preview", "plan"],
    ["Animation", "plan"],
  ]},
];

const WORKSPACES = [
  { id: "code", name: "Code", state: "ok", title: "Code",
    body: "The shipping editor: CodeMirror 6 with VRML highlighting, a live outline, find and replace, five themes including High Contrast, backup-first saves and crash recovery.",
    shot: { src: "/screens/code-editor.webp", w: 1200, h: 791,
      alt: "WRL Forge editor on item.wrl with syntax highlighting, an outline of the node tree, and zero diagnostics.",
      cap: "Screenshot · shipped since v1.3.0-beta.2" } },
  { id: "model", name: "Model", state: "dev", title: "Model",
    body: "A beginner-friendly visual mode: add a Box or Sphere, select it in the viewport, set position, size and color with typed fields. Every change is a small patch to your source, and one action is one Undo. Merged to the main branch, not in a release yet.",
    concept: ["Scene", "Viewport", "Inspector"] },
  { id: "behavior", name: "Behavior", state: "plan", title: "Behavior",
    body: "Direction: wire ROUTEs, sensors and scripts visually while the source stays readable. The scene tree already lists ROUTEs; authoring them is on the roadmap.",
    concept: ["Nodes", "ROUTE graph", "Fields"] },
  { id: "animation", name: "Animation", state: "plan", title: "Animation",
    body: "Direction: TimeSensors and interpolators edited on a timeline, written back as ordinary VRML. Roadmap only, with no release target.",
    concept: ["Clips", "Timeline", "Keys"] },
  { id: "mall", name: "Cybertown Mall", state: "ok", title: "Mall item",
    body: "Original and Cybertown Fit previews with ground, center, Z-limit and 10 m guides. The fit is preview-only and never written into your file.",
    shot: { src: "/screens/mall-preview.webp", w: 1280, h: 831,
      alt: "Split view: VRML source on the left, live X_ITE preview in Original mode, fit guides and Cybertown Fit measurements below.",
      cap: "Screenshot · shipped since v1.3.0-beta.2" } },
  { id: "debug", name: "Validation", state: "ok", title: "Validation",
    body: "Live syntax diagnostics with codes and jump-to-line, plus advisories that advise and never block a save. If an edit breaks the scene, the preview keeps the last valid version.",
    shot: { src: "/screens/code-diagnostics.webp", w: 1200, h: 791,
      alt: "Editor showing six syntax diagnostics for an unclosed Box, each with a line and column.",
      cap: "Screenshot · shipped since v1.3.0-beta.2" } },
];

const FAQ = [
  ["What is WRL Forge?",
   `<p>A free, open-source desktop application for authoring VRML97 worlds and objects. It began as a source editor and validator for Cybertown Mall items, and it is growing into a visual authoring environment where the exact source text stays the document.</p>`],
  ["Is it a visual 3D editor?",
   `<p>It is becoming one. The current release (beta) has a live 3D preview, a read-only scene tree and inspector. Visual editing (adding objects, selecting them in the viewport, typed field editing) is merged into the main branch but not yet released. Gizmos, snapping, appearance and behavior editing are planned.</p>`],
  ["Does it preserve my original VRML source?",
   `<p>Yes. WRL Forge never re-prints your file. Comments, formatting and spacing survive, and a visual change becomes a small patch to the exact characters it affects. Saves create a backup first.</p>`],
  ["Does it support VRML97 and X3D?",
   `<p>VRML97 (<code>.wrl</code>, including gzip-compressed files) is supported today. X3D is the standards direction the project is designed around, but opening and saving X3D files (<code>.x3d</code>, <code>.x3dv</code>) is not available yet.</p>`],
  ["Is it only for Cybertown?",
   `<p>No. Cybertown Mall is a specialized profile, with placement previews, size checks and gzip packaging. World Projects and general VRML97 editing work without any Cybertown rules. WRL Forge is an independent community project and is not affiliated with, endorsed by, or officially connected to Cybertown.</p>`],
  ["Can it open compressed WRL files?",
   `<p>Yes. Gzip-compressed <code>.wrl</code> and <code>.wrz</code> files are detected by their content, edited as text, and recompressed on save.</p>`],
  ["Does it require an internet connection?",
   `<p>No. Everything runs locally, including the renderer. Remote URLs inside a scene are blocked rather than fetched, and there is no telemetry, analytics, auto-update or crash upload.</p>`],
  ["What rendering engine does it use?",
   `<p><a href="https://create3000.github.io/x_ite/" rel="noopener">X_ITE</a>, an open-source VRML/X3D browser, bundled with the app. It is the only renderer. WRL Forge does not ship a homemade one. The model at the top of this page is rendered by the same engine.</p>`],
  ["Is it free and open source?",
   `<p>Yes, under the GNU GPL version 3 or later. The source is on <a href="${APP}" rel="noopener">GitHub</a>. Contributions use a DCO sign-off, with no CLA.</p>`],
  ["What features are still under development?",
   `<p>Released today: source editing, validation, live preview, Mall and World Project tools, read-only scene tree and inspector. On the main branch, unreleased: typed inspector editing, adding Box and Sphere, the Code/Model workspace switch, viewport selection. Planned: gizmos, snapping, grouping, materials and textures, ROUTE and animation editing, PROTO workflows and X3D files. The <a href="${LINKS.roadmap}" rel="noopener">roadmap</a> describes direction, not dates.</p>`],
];

// The hero source panel shows the real structure of /hero-harley.wrl (the
// scene X_ITE is rendering above it). data-node marks lines the visitor can
// hover to light up the matching node in the viewport.
const HERO_SRC = [
  [`<span class="c">#VRML V2.0 utf8</span>`],
  [`<span class="k">Background</span> { transparency <span class="n">1</span> }`, "Background"],
  [`<span class="k">DEF</span> <span class="d">Spin</span> <span class="k">Transform</span> {`, "Transform · DEF Spin"],
  [`  children [ <span class="k">Transform</span> {`, "Transform · re-center"],
  [`    translation <span class="n">1.6052 1.0778 0</span>`, "Transform · re-center"],
  [`    children [ <span class="k">Inline</span> { url <span class="s">"harley.wrl"</span> } ]`, "Inline · harley.wrl"],
  [`  } ]`],
  [`}`],
  [`<span class="k">DEF</span> <span class="d">Clock</span> <span class="k">TimeSensor</span> { cycleInterval <span class="n">20</span> loop <span class="k">TRUE</span> }`, "TimeSensor · DEF Clock"],
  [`<span class="k">DEF</span> <span class="d">Turn</span> <span class="k">OrientationInterpolator</span> { … }`, "OrientationInterpolator · DEF Turn"],
  [`<span class="k">ROUTE</span> <span class="d">Clock</span>.fraction_changed <span class="k">TO</span> <span class="d">Turn</span>.set_fraction`, "ROUTE · Clock → Turn"],
  [`<span class="k">ROUTE</span> <span class="d">Turn</span>.value_changed <span class="k">TO</span> <span class="d">Spin</span>.set_rotation`, "ROUTE · Turn → Spin"],
];

const PLUS = `<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2.2"/></svg>`;
const ext = `target="_blank" rel="noopener"`;

const FAVICON = "PHN2ZyB2aWV3Qm94PSIwIDAgNTEyIDUxMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBzaGFwZS1yZW5kZXJpbmc9ImNyaXNwRWRnZXMiPgogIDwhLS0gZmxhdCBiYW5kZWQgdmlvbGV0IGJhY2tncm91bmQsIG5vIHNtb290aCBncmFkaWVudHMgLS0+CgogIDwhLS0gZ3JvdW5kIHNoYWRvdzogaGFyZCBmbGF0IHNpbGhvdWV0dGUsIG5vIGJsdXIgLS0+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTAsMTIpIiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiMwNTAzMDkiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iNDAiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSI0MCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzNCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM2Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSI0MCIvPgogIDwvZz4KCiAgPCEtLSBleHRydXNpb24gYmFzZSAoc2hhZG93IGZhY2UsIG9mZnNldCBkb3duLXJpZ2h0KSAtLT4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg5LDkpIiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiMxMzQwNWMiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iMzgiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzMiIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM0Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogIDwvZz4KCiAgPCEtLSBtYWluIGZhY2UgKG1pZCBhbWJlciwgbm8gb2Zmc2V0KSAtLT4KICA8ZyBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiMyZjlmYzkiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iMzgiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzMiIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM0Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogIDwvZz4KPC9zdmc+Cg==";

// Page stylesheet (inlined into <style>; one request, no CDN).
const CSS = `
@font-face{font-family:"Forge Stencil";src:url("/fonts/BigShouldersStencil.woff2") format("woff2");
  font-weight:500 900;font-display:swap}
@font-face{font-family:"Forge Mono";src:url("/assets/fonts/Ubuntu/UbuntuMono-R.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Forge Mono";src:url("/assets/fonts/Ubuntu/UbuntuMono-B.woff2") format("woff2");font-weight:700;font-display:swap}

/* ---------- tokens ---------- */
:root{
  --stencil:"Forge Stencil",Impact,"Arial Narrow",sans-serif;
  --mono:"Forge Mono",ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --frame:1240px; --gut:clamp(16px,3.4vw,44px);
  --chamfer:9px; --ease:cubic-bezier(.22,.9,.24,1);
  /* brand constants, taken from the approved logo artwork: theme independent */
  --brand-cyan:#2f9fc9; --brand-ice:#9fe8ff; --brand-deep:#13405c; --brand-amber:#ffb23c;
}
/* Semantic palette. Roles, not decoration:
   amber = creation and primary action; cyan = technical data, selection,
   interaction and focus; teal = structure (trees, dividers, secondary
   technical headers); green = verified Available only; violet = the
   Appearance category. "-ink" variants are the AA-safe text versions. */
:root,[data-theme="dark"]{
  color-scheme:dark;
  --bg:#100f0d; --cell:#181714; --cell-2:#201e1a; --raised:#24221d; --ink:#efe9de; --soft:#c9c1b3; --muted:#9a9184;
  --line:rgba(239,233,222,.12); --line-2:rgba(239,233,222,.24);
  --amber:#ff9a2e; --amber-hover:#ffb35f; --amber-ink:#ffb45c; --on-amber:#140d04;
  --cyan:#25b9d7; --cyan-ink:#62d2ec; --on-cyan:#03161c; --cyan-line:rgba(37,185,215,.45);
  --teal:#2aa198; --teal-ink:#63c5bb; --violet:#9d86e6; --violet-ink:#b9a6f2;
  --tint-cyan:#11191b; --tint-amber:#1c1610; --tint-deep:#0d1517;
  --sel-bg:rgba(37,185,215,.16); --focus:#62d2ec;
  --brand-word:#ffb23c; --code-bg:#0b0a09;
  --ok:#74c69d; --dev:#ffb45c; --plan:#9aa4b8; --info:#62d2ec; --warn:#ffb45c; --err:#ff7a6b;
}
[data-theme="light"]{
  color-scheme:light;
  --bg:#e8e3d9; --cell:#f5f2ec; --cell-2:#ece7de; --raised:#fbf9f5; --ink:#17140f; --soft:#3f3a32; --muted:#5f584d;
  --line:rgba(23,20,15,.16); --line-2:rgba(23,20,15,.32);
  --amber:#ff9a2e; --amber-hover:#ffb35f; --amber-ink:#a24a00; --on-amber:#140d04;
  --cyan:#1590b0; --cyan-ink:#0a6580; --on-cyan:#ffffff; --cyan-line:rgba(10,101,128,.45);
  --teal:#0f7f76; --teal-ink:#0d6a62; --violet:#7a5fd0; --violet-ink:#5a3fae;
  --tint-cyan:#e3ecec; --tint-amber:#f1e6d6; --tint-deep:#dde6e6;
  --sel-bg:rgba(21,144,176,.16); --focus:#0a6580;
  --brand-word:#a84f00; --code-bg:#1a1814;
  --ok:#176b3c; --dev:#9a4a00; --plan:#4d5668; --info:#0a6580; --warn:#9a4a00; --err:#b3261e;
}
@media(prefers-color-scheme:light){
  :root:not([data-theme]){
    color-scheme:light;
    --bg:#e8e3d9; --cell:#f5f2ec; --cell-2:#ece7de; --raised:#fbf9f5; --ink:#17140f; --soft:#3f3a32; --muted:#5f584d;
    --line:rgba(23,20,15,.16); --line-2:rgba(23,20,15,.32);
    --amber-ink:#a24a00;
    --cyan:#1590b0; --cyan-ink:#0a6580; --on-cyan:#ffffff; --cyan-line:rgba(10,101,128,.45);
    --teal:#0f7f76; --teal-ink:#0d6a62; --violet:#7a5fd0; --violet-ink:#5a3fae;
    --tint-cyan:#e3ecec; --tint-amber:#f1e6d6; --tint-deep:#dde6e6;
    --sel-bg:rgba(21,144,176,.16); --focus:#0a6580;
    --brand-word:#a84f00;
    --ok:#176b3c; --dev:#9a4a00; --plan:#4d5668; --info:#0a6580; --warn:#9a4a00; --err:#b3261e;
  }
}

/* ---------- base ---------- */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;scroll-padding-top:72px;-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.6;
  -webkit-font-smoothing:antialiased;overflow-x:hidden;transition:background-color .35s,color .35s}
a{color:inherit}
img{max-width:100%;display:block}
:focus-visible{outline:2px solid var(--focus);outline-offset:3px}
::selection{background:var(--sel-bg)}
[hidden]{display:none!important}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.skip{position:absolute;left:12px;top:-60px;z-index:100;background:var(--amber);color:var(--on-amber);padding:10px 14px;
  font-family:var(--mono);font-weight:700;text-decoration:none}
.skip:focus{top:12px}

/* ---------- frame + grid ----------
   One centered frame on a four-column rhythm. Every row is a grid of cells
   divided by hairlines; empty spacer rows (.gap) carry the column rules
   between sections, so the grid reads continuously down the page. */
.frame{position:relative;max-width:var(--frame);margin:0 auto;border-inline:1px solid var(--line)}
.row{position:relative;z-index:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--line)}
.cell{position:relative;padding:clamp(20px,2.6vw,36px) var(--gut);min-width:0;background:var(--bg);transition:background-color .35s}
.cell+.cell{border-left:1px solid var(--line)}
.span2{grid-column:span 2}.span3{grid-column:span 3}.span4{grid-column:span 4}
.fill{background:var(--cell)}
.gap{height:clamp(28px,4vw,56px)}

/* corner ticks: small squares pinned to a cell's corners (amber = action) */
.ticks::before,.ticks::after{content:"";position:absolute;width:6px;height:6px;background:var(--amber);pointer-events:none}
.ticks::before{left:0;top:0}.ticks::after{right:0;bottom:0}

/* ---------- type ---------- */
.stencil{font-family:var(--stencil);font-weight:800;text-transform:uppercase;line-height:.86;letter-spacing:.01em}
.label{font-family:var(--mono);font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.label b{color:var(--cyan-ink);font-weight:700}
.num{font-family:var(--mono);font-size:13px;letter-spacing:.12em;color:var(--cyan-ink)}
.sec-head{display:flex;flex-direction:column;justify-content:flex-end;gap:16px;min-height:clamp(170px,20vw,250px)}
/* section header bar: a short technical rule in the section accent (cyan by default) */
.sec-head.fill::before{content:"";position:absolute;left:var(--gut);top:0;width:72px;height:3px;background:var(--acc,var(--cyan))}
.sec-head.fill .num{display:flex;align-items:center;gap:10px}
.sec-head.fill .num::after{content:"";flex:0 0 28px;height:1px;background:var(--cyan-line)}
.sec-title{font-size:clamp(2.6rem,6.4vw,5.6rem)}
.sec-title em{font-style:normal;color:var(--amber-ink)}
.lead{font-size:clamp(1.02rem,1.35vw,1.2rem);color:var(--soft);max-width:60ch}
.prose p{color:var(--soft);max-width:62ch}
.prose p+p{margin-top:14px}
.prose strong{color:var(--ink)}
.mono{font-family:var(--mono)}
code{font-family:var(--mono);font-size:.95em;color:var(--ink);background:var(--cell-2);padding:1px 5px}

/* ---------- buttons (chamfered) ---------- */
.btn{--c:var(--chamfer);display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;
  padding:12px 22px;font-family:var(--mono);font-size:14px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  text-decoration:none;border:0;cursor:pointer;
  clip-path:polygon(var(--c) 0,100% 0,100% calc(100% - var(--c)),calc(100% - var(--c)) 100%,0 100%,0 var(--c));
  transition:transform .25s var(--ease),background-color .25s,color .25s}
.btn .arr{transition:transform .25s var(--ease)}
.btn:hover .arr{transform:translateX(4px)}
.btn-amber{background:var(--amber);color:var(--on-amber)}
.btn-amber:hover{background:var(--amber-hover)}
.btn-ghost{background:var(--line-2);color:var(--ink);position:relative;isolation:isolate}
.btn-ghost::before{content:"";position:absolute;inset:1px;z-index:-1;background:var(--bg);
  clip-path:polygon(calc(var(--c) - .5px) 0,100% 0,100% calc(100% - var(--c) + .5px),calc(100% - var(--c) + .5px) 100%,0 100%,0 calc(var(--c) - .5px))}
.btn-ghost:hover{background:var(--cyan)}
.btn-ghost:hover::before{background:var(--cell-2)}
.btn:active{transform:translateY(1px)}

/* status tags: Available / In development / Planned */
.tag{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11.5px;letter-spacing:.12em;
  text-transform:uppercase;padding:3px 8px;border:1px solid currentColor;white-space:nowrap;line-height:1.4}
.tag::before{content:"";width:6px;height:6px;background:currentColor}
.ws-info .tag,.profile>.tag,.beta .tag{align-self:flex-start}
.tag.ok{color:var(--ok)}.tag.dev{color:var(--dev)}.tag.plan{color:var(--plan)}
.tag.dev::before{background:linear-gradient(90deg,currentColor 50%,transparent 50%);box-shadow:0 0 0 1px currentColor;width:5px;height:5px;margin:0 1px}
.tag.plan::before{background:transparent;border:1px solid currentColor}

/* ---------- nav ---------- */
.nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:saturate(1.2) blur(10px);-webkit-backdrop-filter:saturate(1.2) blur(10px);border-bottom:1px solid var(--line)}
/* a cyan-to-amber hairline under the header ties the two brand colors together */
.nav::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;pointer-events:none;
  background:linear-gradient(90deg,transparent 0,var(--cyan) 18%,var(--cyan) 50%,var(--amber) 50%,var(--amber) 82%,transparent 100%);opacity:.55}
.nav-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:stretch;min-height:84px}
.nav .cell{padding-block:10px;padding-inline:clamp(16px,2.2vw,30px);background:transparent;display:flex;align-items:center}
.nav-mid{justify-content:center}
/* brand lockup: the approved WRL artwork (public/brand, unmodified) + FORGE,
   set like the artwork's own caption. The <img> is cropped to the artwork's
   drawn area by its frame; nothing is redrawn, stretched or recolored. */
.brand{display:inline-flex;align-items:center;gap:14px;text-decoration:none;color:var(--ink);padding-right:clamp(4px,1.6vw,22px)}
.brand-mark{--h:62px;position:relative;flex:0 0 auto;width:calc(var(--h) * 1.35);height:var(--h);overflow:hidden}
.brand-mark img{position:absolute;width:calc(var(--h) * 1.5706);height:auto;max-width:none;
  left:calc(var(--h) * -.1104);top:calc(var(--h) * -.3804)}
.brand-txt{display:flex;flex-direction:column;gap:5px;border-left:1px solid var(--line-2);padding-left:14px}
.brand-name{font-family:var(--sans);font-weight:800;font-size:25px;line-height:1;letter-spacing:.3em;margin-right:-.3em;text-transform:uppercase;color:var(--brand-word)}
.brand-sub{font-family:var(--mono);font-size:11px;line-height:1;letter-spacing:.16em;text-transform:uppercase;color:var(--cyan-ink);white-space:nowrap}
.nav-links{display:flex;gap:clamp(0px,.7vw,10px);list-style:none;justify-content:center;align-items:center}
.nav-links a{font-family:var(--mono);font-size:13.5px;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;
  color:var(--soft);position:relative;display:block;padding:10px 9px}
.nav-links a::after{content:"";position:absolute;left:9px;right:9px;bottom:3px;height:2px;background:var(--cyan);
  transform:scaleX(0);transform-origin:right;transition:transform .3s var(--ease)}
.nav-links a:hover{color:var(--ink)}
.nav-links a:hover::after,.nav-links a:focus-visible::after{transform:scaleX(1);transform-origin:left}
.nav-links a[aria-current]{color:var(--cyan-ink)}
.nav-links a[aria-current]::after{transform:scaleX(1);background:var(--cyan)}
.nav-links .n,.nav-links .x,.nav-meta{display:none}
.nav-end{display:flex;gap:10px;justify-content:flex-end;align-items:center}
.icon-btn{width:44px;height:44px;display:inline-grid;place-items:center;background:transparent;color:var(--ink);
  border:1px solid var(--line-2);cursor:pointer;transition:border-color .2s,color .2s,background-color .2s}
.icon-btn:hover{border-color:var(--cyan);color:var(--cyan-ink)}
.icon-btn[aria-expanded="true"],.icon-btn[aria-pressed="true"]{border-color:var(--cyan);background:var(--sel-bg);color:var(--cyan-ink)}
.icon-btn svg{width:18px;height:18px}
.menu-btn{display:none}
.nav .btn{min-height:44px;padding:10px 16px;font-size:13px}

/* ---------- hero ---------- */
.hero .row:first-child{min-height:min(calc(100svh - 64px),860px)}
.hero-copy{display:flex;flex-direction:column;justify-content:space-between;gap:34px}
.hero-h1{font-size:clamp(4rem,11.4vw,10.6rem);display:flex;flex-direction:column}
.hero-h1 span:nth-child(3){color:var(--amber-ink)}
.hero-h1 .dot{color:var(--amber-ink)}
.hero-h1 span:nth-child(3) .dot{color:var(--ink)}
.hero-sub{max-width:52ch}
.hero-cta{display:flex;flex-wrap:wrap;gap:12px}
.beta{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center}
.beta .tag{color:var(--cyan-ink)}

/* the viewport: X_ITE canvas over a measured grid, with a live source panel.
   Cyan marks everything technical here: frame brackets, selection, readouts. */
.viewport{display:flex;flex-direction:column;padding:0;background:var(--cell)}
.vp-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--line)}
.vp-bar .label{color:var(--cyan-ink)}
.vp-bar .label::before{content:"";display:inline-block;width:7px;height:7px;margin-right:10px;background:var(--cyan);vertical-align:1px}
.vp-stage{position:relative;flex:1 1 auto;min-height:300px;overflow:hidden;color:var(--soft);
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
  background-size:40px 40px;background-position:center}
/* corner brackets framing the render area */
.vp-stage::before,.vp-stage::after{content:"";position:absolute;width:22px;height:22px;z-index:2;pointer-events:none;border:2px solid var(--cyan)}
.vp-stage::before{left:10px;top:10px;border-right:0;border-bottom:0}
.vp-stage::after{right:10px;bottom:10px;border-left:0;border-top:0}
.vp-stage .hero-fallback{position:absolute;inset:8% 10%;width:80%;height:84%}
.hero-fallback .v{fill:var(--cyan)}
.vp-stage x3d-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;border:0;background:transparent!important}
.xite-on .hero-fallback{display:none}
.vp-hint{position:absolute;left:14px;bottom:12px;font-family:var(--mono);font-size:12px;letter-spacing:.12em;color:var(--muted);
  text-transform:uppercase;pointer-events:none}
.xite-on .vp-hint{color:var(--cyan-ink)}
.vp-sel{position:absolute;inset:18% 16%;border:1px dashed var(--cyan);box-shadow:inset 0 0 0 1px var(--sel-bg);opacity:0;transition:opacity .25s;pointer-events:none}
.vp-sel::before{content:attr(data-node);position:absolute;left:-1px;top:-24px;background:var(--cyan-ink);color:var(--on-cyan);
  font-family:var(--mono);font-size:11.5px;font-weight:700;letter-spacing:.08em;padding:2px 7px}
.vp-sel.on{opacity:1}
/* the code surface is dark in both themes, so its colors are fixed tokens */
.src,.doc{--code-fg:#d9d2c5;--code-dim:#a39b8e;--code-ln:#8a8275;--code-kw:#ffb45c;--code-def:#9fe8ff;--code-com:#8a8275;
  --code-str:#a7d98b;--code-num:#e6c07b;--code-rule:rgba(239,233,222,.1);--code-cyan:#62d2ec;--code-sel:rgba(37,185,215,.18)}
.src{flex:0 0 auto;border-top:2px solid var(--cyan);background:var(--code-bg);color:var(--code-fg);font-family:var(--mono);font-size:13px;line-height:1.55}
.src-bar{display:flex;justify-content:space-between;gap:10px;padding:8px 16px;border-bottom:1px solid var(--code-rule);
  color:var(--code-dim);font-size:11.5px;letter-spacing:.12em;text-transform:uppercase}
.src-bar span:first-child{color:var(--code-cyan)}
.src ol{list-style:none;padding:8px 0;counter-reset:ln;overflow-x:auto}
.src li{counter-increment:ln;display:block;padding:0 16px 0 0;white-space:pre;cursor:default}
.src li::before{content:counter(ln);display:inline-block;width:38px;padding-right:12px;text-align:right;color:var(--code-ln)}
.src li[data-node]{cursor:pointer}
.src li[data-node]:hover,.src li[data-node]:focus,.src li.on{background:var(--code-sel);box-shadow:inset 3px 0 0 var(--code-cyan);outline:0}
.src li.on::before,.src li[data-node]:focus::before{color:var(--code-cyan)}
.src .k{color:var(--code-kw)}.src .d{color:var(--code-def)}.src .c{color:var(--code-com);font-style:italic}.src .s{color:var(--code-str)}.src .n{color:var(--code-num)}
.src-foot{display:flex;justify-content:space-between;gap:10px;padding:8px 16px;border-top:1px solid var(--code-rule);
  color:var(--code-dim);font-size:12px}
.src-foot output{color:var(--code-cyan);font-variant-numeric:tabular-nums}

/* ---------- statement ---------- */
.big-quote{font-size:clamp(1.5rem,2.6vw,2.2rem);line-height:1.2;font-family:var(--sans);font-weight:600;letter-spacing:-.01em;max-width:28ch}
.big-quote em{font-style:normal;color:var(--amber-ink)}
.lineage{list-style:none;display:grid;gap:0}
.lineage li{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;padding:14px 0;border-top:1px solid var(--line)}
.lineage li:first-child{border-top:0;padding-top:0}
.lineage b{font-family:var(--mono);font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);grid-column:2}
.lineage span{grid-column:2;color:var(--soft);font-size:.95rem}
.lineage i{grid-row:1/3;font-style:normal;font-family:var(--mono);color:var(--teal-ink);font-size:13px}

/* ---------- source-first diagram ----------
   One document, several views. Cyan carries the source <-> view relationship;
   the arrows and list order carry it too, so color is never the only cue. */
.sec-src{--acc:var(--cyan)}
.sec-src .sec-head.fill{background:var(--tint-cyan)}
.sec-src .sec-title em{color:var(--cyan-ink)}
.flow{display:grid;grid-template-columns:1fr auto 1fr;gap:18px;align-items:center}
.doc{border:1px solid var(--line-2);border-top:2px solid var(--cyan);background:var(--code-bg);color:var(--code-fg);font-family:var(--mono);font-size:13px;line-height:1.6;padding:14px 16px;white-space:pre;overflow:auto}
.doc .k{color:var(--code-kw)}.doc .d{color:var(--code-def)}.doc .c{color:var(--code-com)}
.doc mark{background:var(--code-sel);color:#fff;outline:1px solid var(--code-cyan);outline-offset:1px}
.views{list-style:none;display:grid;gap:10px;counter-reset:vw}
.views li{counter-increment:vw;border:1px solid var(--line-2);border-left:3px solid var(--teal);padding:12px 14px;display:flex;justify-content:space-between;gap:10px;align-items:center;background:var(--cell)}
.views li:first-child{border-left-color:var(--cyan)}
.views b{font-family:var(--mono);font-size:13px;letter-spacing:.1em;text-transform:uppercase}
.views b::before{content:"0" counter(vw) " ";color:var(--cyan-ink);font-weight:400}
.arrow{font-family:var(--mono);color:var(--cyan-ink);text-align:center;font-size:13px;letter-spacing:.1em;display:flex;flex-direction:column;align-items:center;gap:6px}
.arrow::before{content:"⇄";font-size:28px;line-height:1;color:var(--cyan)}
.points{list-style:none;counter-reset:pt;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0}
.points li{counter-increment:pt;padding:22px var(--gut) 24px 0;border-top:1px solid var(--line)}
.points li::before{content:"0" counter(pt);font-family:var(--mono);font-size:12.5px;color:var(--cyan-ink);letter-spacing:.12em;display:block;margin-bottom:8px}
.points h3{font-family:var(--mono);font-size:15px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
.points p{color:var(--soft);font-size:.96rem;max-width:46ch}
.points .tag{margin-top:10px}

/* ---------- capability columns ----------
   Each category keeps one accent everywhere it appears: the top edge, the
   index, the icon vertices. Model = amber (creation), Structure = teal,
   Appearance = violet, Behavior = cyan (interaction). Text stays neutral. */
.cap{--cat:var(--amber);--cat-ink:var(--amber-ink);transition:background-color .3s}
.cap-structure{--cat:var(--teal);--cat-ink:var(--teal-ink)}
.cap-appearance{--cat:var(--violet);--cat-ink:var(--violet-ink)}
.cap-behavior{--cat:var(--cyan);--cat-ink:var(--cyan-ink)}
.cap::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--cat)}
.cap{background:linear-gradient(color-mix(in srgb,var(--cat) 9%,var(--bg)),var(--bg) 190px)}
.cap:hover{background:color-mix(in srgb,var(--cat) 6%,var(--bg))}
.cap .num{color:var(--cat-ink);display:flex;justify-content:space-between;gap:8px}
.cap .num i{font-style:normal;color:var(--muted)}
.cap h3{font-size:clamp(2.2rem,3.6vw,3.2rem);margin:14px 0 18px}
.cap .prim-svg{width:56px;height:56px;color:var(--ink)}
.cap .prim-svg .v{fill:var(--cat)}
.cap ul{list-style:none;display:grid;gap:0}
.cap li{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:1px solid var(--line)}
.cap li>span:first-child{font-size:.97rem}
.cap li .tag{align-self:flex-start}
.legend{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}

/* ---------- workspaces ----------
   The selected tab is unmistakable: raised surface, cyan top bar, ink text,
   and it joins the panel below (no bottom rule). Inactive tabs sit back. */
.ws-tabs{display:flex;flex-wrap:wrap;gap:0;border-bottom:1px solid var(--line);background:var(--bg);counter-reset:wst}
.ws-tabs button{counter-increment:wst;flex:1 1 auto;min-height:60px;padding:12px 16px;background:transparent;border:0;border-right:1px solid var(--line);
  color:var(--muted);font-family:var(--mono);font-size:13px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;text-align:left;
  display:flex;flex-direction:column;gap:4px;justify-content:center;position:relative;transition:background-color .2s,color .2s}
.ws-tabs button::before{content:"06." counter(wst);font-size:10.5px;letter-spacing:.14em;color:var(--muted)}
.ws-tabs button::after{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--cyan);transform:scaleY(0);transform-origin:top;transition:transform .2s var(--ease)}
.ws-tabs button:last-child{border-right:0}
.ws-tabs button small{font-size:10.5px;letter-spacing:.12em}
.ws-tabs .st-ok{color:var(--ok)}.ws-tabs .st-dev{color:var(--dev)}.ws-tabs .st-plan{color:var(--plan)}
.ws-tabs button:hover{color:var(--ink);background:var(--cell-2)}
.ws-tabs button:hover::after{transform:scaleY(.34)}
.ws-tabs button[aria-selected="true"]{background:var(--raised);color:var(--ink);font-weight:700;margin-bottom:-1px;padding-bottom:13px}
.ws-tabs button[aria-selected="true"]::before{color:var(--cyan-ink)}
.ws-tabs button[aria-selected="true"]::after{transform:none}
.ws-panel{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:0}
.ws-panel[hidden]{display:none}
.ws-panel{background:var(--raised)}
.ws-info{padding:clamp(20px,2.6vw,36px) var(--gut);display:flex;flex-direction:column;gap:14px;border-right:1px solid var(--line)}
.ws-info .label{color:var(--teal-ink)}
.ws-info h3{font-size:clamp(2rem,3.4vw,3rem)}
.ws-info p{color:var(--soft)}
.ws-shot{margin:0;padding:clamp(16px,2vw,28px);background:var(--cell);display:flex;flex-direction:column;gap:10px}
.ws-shot img{width:100%;height:auto;border:1px solid var(--line-2)}
.ws-shot figcaption{font-family:var(--mono);font-size:12px;letter-spacing:.06em;color:var(--muted)}
.ws-shot figcaption b{color:var(--ink)}
.ws-shot figcaption .real{color:var(--cyan-ink)}
.ws-shot figcaption .real::before{content:"";display:inline-block;width:7px;height:7px;background:var(--cyan);margin-right:8px;vertical-align:1px}
.concept{aspect-ratio:16/10;border:1px dashed var(--line-2);display:grid;grid-template-rows:auto 1fr;background:
  repeating-linear-gradient(135deg,transparent 0 14px,var(--line) 14px 15px)}
.concept .c-bar{display:flex;gap:8px;padding:8px 10px;border-bottom:1px dashed var(--line-2);font-family:var(--mono);font-size:11.5px;
  letter-spacing:.12em;color:var(--muted);text-transform:uppercase;background:var(--cell)}
.concept .c-body{display:grid;grid-template-columns:1fr 2.4fr 1fr;gap:10px;padding:10px}
.concept .c-body>div{border:1px dashed var(--line-2);background:color-mix(in srgb,var(--cell) 88%,transparent);padding:8px;
  font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
.concept .c-body .main{display:grid;place-items:center;color:var(--soft)}
.concept .c-body .main svg{width:min(60%,200px);height:auto;color:var(--soft)}
.concept .c-body .main svg .v{fill:var(--plan)}

/* ---------- profiles ---------- */
.profile{display:flex;flex-direction:column;gap:14px}
.profile h3{font-size:clamp(1.9rem,3vw,2.6rem)}
.profile p{color:var(--soft);font-size:.98rem}
.profile ul{list-style:none;font-family:var(--mono);font-size:13.5px;color:var(--soft)}
.profile li{padding:7px 0;border-top:1px solid var(--line)}
.sec-prof{--acc:var(--amber)}
.sec-prof .sec-head.fill{background:var(--tint-amber)}
.profile li::before{content:"▪ ";color:var(--teal-ink)}
.profile .note{font-size:.88rem;color:var(--muted)}

/* ---------- principles ---------- */
.sec-why{--acc:var(--teal)}
.principles{list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));background:var(--tint-deep)}
.principles li{padding:clamp(20px,2.4vw,32px) var(--gut);border-top:1px solid var(--line);border-left:1px solid var(--line);
  display:flex;flex-direction:column;gap:8px;min-height:190px;transition:background-color .3s}
.principles li:nth-child(4n+1){border-left:0}
.principles li{position:relative}
.principles li::before{content:"";position:absolute;left:var(--gut);top:-1px;width:28px;height:3px;background:var(--teal)}
.principles li:hover{background:var(--cell)}
.principles li:hover::before{background:var(--cyan)}
.principles .num{font-size:12.5px}
.principles h3{font-family:var(--mono);font-size:15px;letter-spacing:.08em;text-transform:uppercase}
.principles p{color:var(--soft);font-size:.95rem}

/* ---------- releases ---------- */
.rel-list{list-style:none}
.rel-list li a{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,2fr) auto auto;gap:16px;align-items:center;padding:16px var(--gut);
  border-top:1px solid var(--line);text-decoration:none;transition:background-color .2s}
.rel-list li a:hover{background:var(--cell)}
.rel-list .t{font-family:var(--mono);font-weight:700;letter-spacing:.06em}
.rel-list .nm{color:var(--soft)}
.rel-list .dt{font-family:var(--mono);color:var(--muted);font-variant-numeric:tabular-nums;font-size:14px}
.rel-list .latest{color:var(--cyan-ink)}
.rel-list li a:hover .t{color:var(--cyan-ink)}
.rel-list .tag{justify-self:end}
.track{list-style:none;display:grid;gap:0}
.track li{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:14px 0;border-top:1px solid var(--line);align-items:start}
.track li .tag{margin-top:2px}
.track-h{display:flex;align-items:center;gap:10px}
.track-h::before{content:"";width:7px;height:7px;flex:0 0 auto;background:var(--tc)}
.track-h.ok{--tc:var(--ok)}.track-h.dev{--tc:var(--dev)}.track-h.plan{--tc:var(--plan)}
.track p{color:var(--soft);font-size:.95rem}

/* ---------- FAQ (native <details>, numbered) ---------- */
.faq{list-style:none}
.faq details{border-top:1px solid var(--line)}
.faq summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:56px 1fr 36px;gap:12px;align-items:center;
  padding:18px var(--gut);min-height:64px;font-size:clamp(1rem,1.3vw,1.12rem);font-weight:600}
.faq summary::-webkit-details-marker{display:none}
.faq summary:hover{background:var(--cell)}
.faq summary:hover .q-i{border-color:var(--cyan);color:var(--cyan-ink)}
.faq .q-n{font-family:var(--mono);font-size:13px;color:var(--muted);letter-spacing:.1em}
.faq .q-i{width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--line-2);color:var(--ink);transition:background-color .2s,border-color .2s,color .2s}
.faq .q-i svg{width:14px;height:14px;transition:transform .3s var(--ease)}
/* open: cyan rail, tinted surface, filled marker */
.faq details[open]{background:var(--tint-cyan);box-shadow:inset 3px 0 0 var(--cyan)}
.faq details[open] summary{background:transparent}
.faq details[open] .q-i{background:var(--cyan-ink);border-color:var(--cyan-ink);color:var(--on-cyan)}
.faq details[open] .q-i svg{transform:rotate(45deg)}
.faq details[open] .q-n{color:var(--cyan-ink)}
.faq .a{padding:0 var(--gut) 24px calc(var(--gut) + 68px);color:var(--soft);max-width:calc(68px + 70ch + 2*var(--gut))}
.faq .a p+p{margin-top:10px}
.faq .a a{color:var(--ink);text-decoration-color:var(--cyan)}

/* ---------- downloads ---------- */
.dl-head{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center}
.sec-dl{--acc:var(--amber)}
.sec-dl .sec-head.fill{background:var(--tint-amber)}
.dl-head .ver{font-family:var(--stencil);font-weight:800;font-size:clamp(2.6rem,5vw,4.2rem);line-height:.9}
.platforms{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-top:1px solid var(--line)}
.plat{display:flex;flex-direction:column;gap:6px;padding:22px var(--gut);text-decoration:none;border-left:1px solid var(--line);
  min-height:150px;justify-content:space-between;transition:background-color .2s,color .2s}
.plat:first-child{border-left:0}
.plat:hover{background:var(--amber);color:var(--on-amber)}
.plat:hover .p-sub,.plat:hover .p-os{color:var(--on-amber)}
.plat:hover .btn-ico{filter:none}
.plat .p-os{font-family:var(--mono);font-size:12.5px;letter-spacing:.14em;color:var(--cyan-ink);text-transform:uppercase}
.plat .p-title{display:flex;align-items:center;gap:12px;font-family:var(--stencil);font-weight:800;font-size:2.2rem;line-height:1;text-transform:uppercase}
.plat .p-sub{font-family:var(--mono);font-size:13px;color:var(--soft)}
.btn-ico{width:26px;height:26px;flex:0 0 auto}
[data-theme="dark"] .btn-ico,[data-theme="dark"] .dl-ico{filter:invert(1)}
@media(prefers-color-scheme:dark){:root:not([data-theme]) .btn-ico,:root:not([data-theme]) .dl-ico{filter:invert(1)}}
.all-downloads{font-family:var(--mono)}
.all-downloads summary{cursor:pointer;list-style:none;padding:16px var(--gut);font-size:13.5px;letter-spacing:.1em;text-transform:uppercase;
  display:flex;gap:10px;align-items:center;min-height:52px}
.all-downloads summary::-webkit-details-marker{display:none}
.all-downloads summary:hover{background:var(--cell)}
.all-downloads summary .tw{color:var(--cyan-ink)}
.all-downloads[open] summary{box-shadow:inset 3px 0 0 var(--cyan)}
.all-downloads[open] summary .tw{transform:rotate(45deg)}
.all-downloads summary .tw{display:inline-block;transition:transform .25s}
.all-downloads .dim{color:var(--muted)}
.dl-list{list-style:none;border-top:1px solid var(--line)}
.dl-row a{display:grid;grid-template-columns:140px minmax(0,1fr) minmax(0,1.6fr) auto;gap:14px;align-items:center;padding:12px var(--gut);
  text-decoration:none;border-bottom:1px solid var(--line);font-size:13.5px}
.dl-row a:hover{background:var(--cell)}
.dl-os{display:flex;align-items:center;gap:8px}
.dl-ico{width:16px;height:16px}
.dl-kind{color:var(--soft)}.dl-name{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dl-size{font-variant-numeric:tabular-nums;color:var(--cyan-ink)}
.dl-links{display:flex;flex-wrap:wrap;gap:0 26px;padding:8px var(--gut);font-family:var(--mono);font-size:13.5px}
.dl-links a{color:var(--ink);text-underline-offset:4px;text-decoration-color:var(--cyan);display:inline-block;padding:10px 0}
.dl-links a:hover{color:var(--cyan-ink)}

/* ---------- footer ---------- */
.foot-cols{list-style:none}
.foot-cols h3{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal-ink);font-weight:400;margin-bottom:12px}
.foot-cols ul{list-style:none;display:grid;gap:2px}
.foot-cols a{text-decoration:none;color:var(--soft);font-size:.95rem;display:inline-block;padding:4px 0}
.foot-cols a:hover{color:var(--cyan-ink)}
.legal{font-family:var(--mono);font-size:12.5px;color:var(--muted);letter-spacing:.04em;display:flex;flex-direction:column;gap:6px}
.legal a{color:var(--soft)}
.legal>a{display:inline-block;padding:8px 0}
.legal .credit a{color:var(--amber-ink)}
/* FORGE: ink letters on the grid. Each cell carries a cyan vertex node and
   an index, like the nodes on the logo; hover forges the letter amber and
   draws a cyan rule under it. */
.wordmark{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));position:relative;z-index:1;border-bottom:1px solid var(--line);overflow:hidden}
.wordmark::before{content:"";position:absolute;left:0;right:0;bottom:clamp(10px,1.6vw,20px);height:1px;background:var(--cyan-line);pointer-events:none}
.wordmark span{position:relative;font-family:var(--stencil);font-weight:800;font-size:clamp(5rem,21vw,17rem);line-height:.8;text-align:center;
  padding:clamp(16px,2.4vw,30px) 0 clamp(10px,1.6vw,20px);border-left:1px solid var(--line);color:var(--ink);
  transition:color .5s var(--ease),font-variation-settings .5s var(--ease);font-variation-settings:"wght" 850}
.wordmark span::before{content:"";position:absolute;left:-4px;top:-4px;width:7px;height:7px;background:var(--cyan)}
.wordmark span::after{content:"";position:absolute;left:18%;right:18%;bottom:clamp(9px,1.5vw,19px);height:3px;background:var(--cyan);
  transform:scaleX(0);transition:transform .45s var(--ease)}
.wordmark i{position:absolute;right:10px;top:8px;font-family:var(--mono);font-style:normal;font-size:11px;letter-spacing:.12em;line-height:1;color:var(--cyan-ink)}
.wordmark span:first-child{border-left:0}
.wordmark span:first-child::before{left:0}
.wordmark span:hover{color:var(--amber-ink);font-variation-settings:"wght" 520}
.wordmark span:hover::after{transform:scaleX(1)}

/* ---------- motion ---------- */
.reveal{opacity:1}
@media(prefers-reduced-motion:no-preference){
  .js .reveal{opacity:0;transform:translateY(14px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
  .js .reveal.in{opacity:1;transform:none}
}
@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important}
}

/* ---------- responsive ---------- */
@media(max-width:1240px) and (min-width:901px){
  /* tablet-landscape header: the list's own Download link replaces the CTA */
  .nav .nav-cta,.brand-sub{display:none}
  .nav-links{gap:0}
  .nav-links a{font-size:12.5px;padding-inline:8px}
  .nav-links a::after{left:8px;right:8px}
  .nav-links .nav-dl a{color:var(--amber-ink)}
  .nav-links .nav-dl a::after{background:var(--amber)}
}
@media(max-width:1080px){
  .principles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .principles li:nth-child(4n+1){border-left:1px solid var(--line)}
  .principles li:nth-child(2n+1){border-left:0}
  .ws-panel{grid-template-columns:1fr}
  .ws-info{border-right:0;border-bottom:1px solid var(--line)}
}
@media(max-width:900px){
  .row{grid-template-columns:repeat(2,minmax(0,1fr))}
  .span3,.span4{grid-column:span 2}
  .row>.cell.span2:nth-child(2n){border-left:0}
  .row>.span2+.span2{border-left:0;border-top:1px solid var(--line)}
  .row>.span2.half+.span2.half{border-left:1px solid var(--line);border-top:0}
  .row>.span3+.cell,.row>.cell+.span3{border-left:0;border-top:1px solid var(--line)}
  .hero .row:first-child{min-height:0}
  .nav-links{display:none}
  .menu-btn{display:inline-grid}
  .nav-row{grid-template-columns:minmax(0,1fr) auto;min-height:76px}
  .nav .nav-mid{display:contents}
  /* mobile drawer: numbered, branded, with a clear current item and the
     download as the closing action */
  .nav.open .nav-links{display:flex;position:absolute;top:100%;left:0;right:0;flex-direction:column;align-items:stretch;gap:0;
    background:var(--bg);border-top:2px solid var(--cyan);border-bottom:1px solid var(--line-2);padding:0 0 16px;
    max-height:calc(100svh - 76px);overflow-y:auto;box-shadow:0 24px 48px rgba(0,0,0,.35)}
  .nav.open .nav-links li{border-bottom:1px solid var(--line)}
  .nav.open .nav-links a{display:flex;align-items:baseline;gap:16px;padding:16px var(--gut);font-family:var(--stencil);font-weight:800;
    font-size:30px;line-height:1;letter-spacing:.02em;color:var(--ink)}
  .nav.open .nav-links a::after{left:0;right:auto;top:0;bottom:0;width:4px;height:auto;transform:scaleY(0);transform-origin:top}
  .nav.open .nav-links a:hover,.nav.open .nav-links a:focus-visible{background:var(--cell)}
  .nav.open .nav-links a:hover::after,.nav.open .nav-links a:focus-visible::after,.nav.open .nav-links a[aria-current]::after{transform:scaleY(1)}
  .nav.open .nav-links a[aria-current]{background:var(--tint-cyan);color:var(--ink)}
  .nav.open .nav-links a[aria-current] .n{color:var(--cyan-ink)}
  .nav.open .nav-links .n{display:inline;font-family:var(--mono);font-weight:400;font-size:12.5px;letter-spacing:.12em;color:var(--muted);min-width:22px}
  .nav.open .nav-links .x{display:inline;margin-left:auto;font-family:var(--mono);font-weight:400;font-size:14px;color:var(--cyan-ink)}
  .nav.open .nav-links .nav-dl{border-bottom:0;padding:18px var(--gut) 0}
  .nav.open .nav-links .nav-dl a{justify-content:center;align-items:center;background:var(--amber);color:var(--on-amber);font-family:var(--mono);
    font-size:14px;letter-spacing:.1em;text-transform:uppercase;min-height:52px;padding:12px 18px;
    clip-path:polygon(var(--chamfer) 0,100% 0,100% calc(100% - var(--chamfer)),calc(100% - var(--chamfer)) 100%,0 100%,0 var(--chamfer))}
  .nav.open .nav-links .nav-dl a::after{display:none}
  .nav.open .nav-links .nav-dl .n{color:var(--on-amber)}
  .nav.open .nav-links .nav-dl a:hover{background:var(--amber-hover)}
  .nav.open .nav-meta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px var(--gut) 0;border-bottom:0;
    font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .nav.open .nav-meta b{color:var(--cyan-ink);font-weight:700}
  .nav .nav-cta{display:none}
  .flow{grid-template-columns:1fr}
  .platforms{grid-template-columns:1fr}
  .plat{border-left:0;border-top:1px solid var(--line);min-height:0}
  .plat:first-child{border-top:0}
  .rel-list li a{grid-template-columns:1fr auto;gap:6px 14px}
  .rel-list .nm{grid-column:1/-1;grid-row:2}
  .dl-row a{grid-template-columns:110px 1fr auto}
  .dl-name{display:none}
  .faq summary{grid-template-columns:40px 1fr 32px}
  .faq .a{padding-left:var(--gut)}
}
@media(max-width:600px){
  .points{grid-template-columns:1fr}
  .principles{grid-template-columns:1fr}
  .principles li{border-left:0!important;min-height:0}
  .row{grid-template-columns:1fr}
  .span2,.span3,.span4{grid-column:span 1}
  .row>.cell+.cell,.row>.span2.half+.span2.half{border-left:0;border-top:1px solid var(--line)}
  .concept .c-body{grid-template-columns:1fr}
  .concept .c-body>div:not(.main){display:none}
  .ws-tabs button{flex:1 1 50%;border-bottom:1px solid var(--line)}
  .hero-cta .btn{flex:1 1 100%}
  .brand-mark{--h:48px}
  .brand{gap:11px}
  .brand-txt{padding-left:11px;gap:4px}
  .brand-name{font-size:20px;letter-spacing:.26em;margin-right:-.26em}
  .brand-sub{font-size:9.5px;letter-spacing:.12em}
  .sec-head{min-height:0}
  .sec-head:not(.fill){padding-block:14px}
  .sec-head:not(.fill):not(:has(a,.prose,.dl-head)){display:none}
  .rel-list .tag{justify-self:start}
}
`;

// Client script: theme, menu, tabs, FAQ, reveals, hero X_ITE scene.
const CLIENT_JS = `
(function () {
  var doc = document.documentElement;

  // ---- theme: explicit choice wins; otherwise CSS follows the OS ----
  var themeBtn = document.getElementById("theme-btn");
  function current() {
    var t = doc.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function syncThemeLabel() {
    var next = current() === "dark" ? "light" : "dark";
    themeBtn.setAttribute("aria-label", "Switch to " + next + " theme");
    themeBtn.title = "Switch to " + next + " theme";
  }
  themeBtn.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    doc.setAttribute("data-theme", next);
    try { localStorage.setItem("wrlf-theme", next); } catch (e) {}
    syncThemeLabel();
  });
  syncThemeLabel();

  // ---- mobile menu ----
  var nav = document.querySelector(".nav"), menuBtn = document.getElementById("menu-btn");
  function closeMenu() { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", function () {
    var open = !nav.classList.contains("open");
    nav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  document.getElementById("nav-links").addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("open")) { closeMenu(); menuBtn.focus(); }
  });

  // ---- nav: mark the in-page section currently in view (aria-current) ----
  var spy = Array.prototype.slice.call(document.querySelectorAll('#nav-links a[href^="#"]'));
  if ("IntersectionObserver" in window) {
    var spyIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        spy.forEach(function (l) {
          if (l.getAttribute("href") === "#" + en.target.id) l.setAttribute("aria-current", "location");
          else l.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-35% 0px -60% 0px" });
    var hero = document.querySelector(".hero");
    if (hero) spyIo.observe(hero);
    spy.forEach(function (l) { var t = document.getElementById(l.getAttribute("href").slice(1)); if (t) spyIo.observe(t); });
  }

  // ---- workspace tabs (WAI-ARIA tabs pattern, arrow-key roving focus) ----
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.ws-tabs [role="tab"]'));
  function select(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { select(t, false); });
    t.addEventListener("keydown", function (e) {
      var j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
      if (j === null) return;
      e.preventDefault();
      select(tabs[(j + tabs.length) % tabs.length], true);
    });
  });

  // ---- FAQ: one open at a time (native via name="faq"; this covers older engines) ----
  var faqs = Array.prototype.slice.call(document.querySelectorAll('.faq details'));
  faqs.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (d.open) faqs.forEach(function (o) { if (o !== d && o.open) o.open = false; });
    });
  });

  // ---- entrance reveals ----
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add("in"); });
  }

  // ---- hero: source lines <-> viewport highlight ----
  var sel = document.getElementById("vp-sel"), nodeOut = document.getElementById("src-node");
  var lines = Array.prototype.slice.call(document.querySelectorAll("#src-lines li[data-node]"));
  function highlight(node) {
    lines.forEach(function (l) { l.classList.toggle("on", !!node && l.getAttribute("data-node") === node); });
    if (node) { sel.setAttribute("data-node", node); sel.classList.add("on"); nodeOut.textContent = node; }
    else { sel.classList.remove("on"); nodeOut.textContent = "Spin.rotation"; }
  }
  lines.forEach(function (l) {
    var n = l.getAttribute("data-node");
    l.addEventListener("mouseenter", function () { highlight(n); });
    l.addEventListener("focus", function () { highlight(n); });
    l.addEventListener("mouseleave", function () { highlight(null); });
    l.addEventListener("blur", function () { highlight(null); });
  });

  // ---- hero: live scene rendered by X_ITE, the product's own renderer ----
  // Progressive enhancement: the SVG box is the fallback, and X_ITE swaps in
  // only after the scene loads. Boots on idle; skipped for reduced motion,
  // small screens or no WebGL. Rendering pauses while the hero is off screen.
  var viewport = document.getElementById("viewport"), stage = document.getElementById("vp-stage");
  var hint = document.getElementById("vp-hint"), spinBtn = document.getElementById("spin-btn");
  var rotOut = document.getElementById("src-rot");
  if (!stage || !window.matchMedia || !window.customElements) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { hint.textContent = "Static preview · reduced motion"; return; }
  if (window.innerWidth < 900) return;
  try {
    var probe = document.createElement("canvas");
    if (!(window.WebGLRenderingContext && (probe.getContext("webgl") || probe.getContext("experimental-webgl")))) return;
  } catch (e) { return; }

  var started = false, canvas = null, spin = null, clock = null, visible = true, last = 0;
  function boot() {
    if (started) return; started = true;
    var s = document.createElement("script");
    s.src = "/x_ite.min.js";
    // X_ITE registers <x3d-canvas> during script eval; whenDefined guarantees
    // it's upgradable before we mount (onload alone can race the registration).
    s.onload = function () { customElements.whenDefined("x3d-canvas").then(mount); };
    document.head.appendChild(s);
  }
  function mount() {
    canvas = document.createElement("x3d-canvas");
    canvas.setAttribute("src", "/hero-harley.wrl");
    canvas.setAttribute("contextMenu", "false");
    canvas.setAttribute("splashScreen", "false");
    canvas.setAttribute("notifications", "false");
    canvas.setAttribute("aria-hidden", "true");
    canvas.addEventListener("load", function () {
      viewport.classList.add("xite-on");
      hint.textContent = "Live · X_ITE";
      try {
        var scene = canvas.browser.currentScene;
        spin = scene.getNamedNode("Spin");
        clock = scene.getNamedNode("Clock");
        spinBtn.hidden = false;
      } catch (e) {}
      tick();
    });
    canvas.addEventListener("error", function () { if (canvas.parentNode) canvas.remove(); });
    stage.insertBefore(canvas, stage.firstChild);
  }
  // Readout of the live Spin.rotation field, ~8 updates/s, only while visible.
  function tick(t) {
    if (!visible || !spin) return;
    if (!t || t - last > 120) {
      last = t || 0;
      try { var r = spin.rotation; rotOut.textContent = "0 1 0 " + (((r.angle * (r.y < 0 ? -1 : 1)) % 6.2832 + 6.2832) % 6.2832).toFixed(3); } catch (e) {}
    }
    requestAnimationFrame(tick);
  }
  spinBtn.addEventListener("click", function () {
    if (!clock) return;
    var paused = spinBtn.getAttribute("aria-pressed") === "true";
    clock.enabled = paused;
    spinBtn.setAttribute("aria-pressed", String(!paused));
    var label = paused ? "Pause the TimeSensor" : "Resume the TimeSensor";
    spinBtn.setAttribute("aria-label", label); spinBtn.title = label;
    spinBtn.innerHTML = paused
      ? '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 4v12M14 4v12" stroke="currentColor" stroke-width="2.4"/></svg>'
      : '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 4l10 6-10 6z" fill="currentColor"/></svg>';
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (!canvas || !canvas.browser) return;
      try { if (visible) { canvas.browser.beginUpdate(); requestAnimationFrame(tick); } else canvas.browser.endUpdate(); } catch (e) {}
    }).observe(stage);
  }
  if ("requestIdleCallback" in window) requestIdleCallback(boot, { timeout: 2600 });
  else setTimeout(boot, 1400);
})();
`;

// ---- page ------------------------------------------------------------------

function renderPage(model) {
  const version = esc(model.version);
  const chan = model.prerelease === null ? "see GitHub" : model.prerelease ? "Beta (pre-release)" : "Stable";
  const relDate = model.publishedAt ? esc(model.publishedAt.slice(0, 10)) : "";
  const desc = "WRL Forge is a free, open-source desktop authoring environment for VRML97 worlds and objects, with live X_ITE preview, validation and exact-source editing. Visual authoring is in development.";

  const capCols = CAPS.map((c, i) => `
      <div class="cell cap cap-${c.k.toLowerCase()} reveal">
        <span class="num"><span>05.${i + 1}</span><i>${c.k}</i></span>
        ${primitiveIcon(c.icon)}
        <h3 class="stencil">${c.k}</h3>
        <ul>${c.items.map(([t, s]) => `<li><span>${t}</span>${tag(s)}</li>`).join("")}</ul>
      </div>`).join("");

  const wsTabs = WORKSPACES.map((w, i) => `
        <button type="button" role="tab" id="ws-tab-${w.id}" aria-controls="ws-${w.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
          ${w.name}<small class="st-${w.state}">${STATE[w.state]}</small></button>`).join("");
  const wsPanels = WORKSPACES.map((w, i) => {
    const media = w.shot
      ? `<figure class="ws-shot"><img src="${w.shot.src}" width="${w.shot.w}" height="${w.shot.h}" alt="${esc(w.shot.alt)}" loading="lazy" decoding="async">
          <figcaption><b>${w.shot.cap}</b> · <span class="real">real application screenshot</span></figcaption></figure>`
      : `<figure class="ws-shot"><div class="concept" role="img" aria-label="Layout sketch for the planned ${esc(w.name)} workspace. Not a screenshot.">
            <div class="c-bar"><span>Design preview</span><span>·</span><span>Not a screenshot</span></div>
            <div class="c-body"><div>${w.concept[0]}</div><div class="main">${primitiveIcon(w.id === "behavior" ? "Route" : w.id === "animation" ? "Transform" : "Box")}<span>${w.concept[1]}</span></div><div>${w.concept[2]}</div></div>
          </div>
          <figcaption><b>Roadmap illustration</b> · layout sketch only, not the application</figcaption></figure>`;
    return `
      <div class="ws-panel" role="tabpanel" id="ws-${w.id}" aria-labelledby="ws-tab-${w.id}" tabindex="0"${i === 0 ? "" : " hidden"}>
        <div class="ws-info"><span class="label">Workspace</span><h3 class="stencil">${w.title}</h3>${tag(w.state)}<p>${w.body}</p></div>
        ${media}
      </div>`;
  }).join("");

  const faq = FAQ.map(([q, a], i) => `
      <details name="faq"${i === 0 ? " open" : ""}>
        <summary><span class="q-n">${String(i + 1).padStart(2, "0")}</span><span>${q}</span><span class="q-i">${PLUS}</span></summary>
        <div class="a">${a}</div>
      </details>`).join("");

  const history = model.history.length ? model.history.map((r, i) => `
        <li><a href="${esc(r.url)}" ${ext}>
          <span class="t${i === 0 ? " latest" : ""}">${esc(r.tag)}</span>
          <span class="nm">${esc(r.name)}</span>
          <span class="dt">${esc(r.date)}</span>
          <span class="tag ${i === 0 ? "ok" : "plan"}">${i === 0 ? "Latest" : (r.prerelease ? "Pre-release" : "Release")}</span></a></li>`).join("")
    : `<li><a href="${RELEASES_PAGE}" ${ext}><span class="t">Releases</span><span class="nm">Release history is on GitHub</span><span class="dt"></span><span class="tag plan">GitHub</span></a></li>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WRL Forge — visual authoring for VRML97 and the 3D web</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#100f0d" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#e8e3d9" media="(prefers-color-scheme: light)">
<link rel="canonical" href="https://wrlforge.com/">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${FAVICON}">
<link rel="preload" href="/fonts/BigShouldersStencil.woff2" as="font" type="font/woff2" crossorigin>
<meta property="og:title" content="WRL Forge — Model. Edit. Forge.">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://wrlforge.com/">
<meta property="og:image" content="https://raw.githubusercontent.com/Ascendance3D/wrlforge/main/assets/generated/icons/runtime/icon.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="WRL Forge — Model. Edit. Forge.">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="https://raw.githubusercontent.com/Ascendance3D/wrlforge/main/assets/generated/icons/runtime/icon.png">
<script>
// Theme before first paint: saved choice, else the OS preference via CSS.
(function(){try{var t=localStorage.getItem("wrlf-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}
document.documentElement.classList.add("js");})();
</script>
<style>
${CSS}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="nav" id="top">
  <div class="frame">
    <nav class="nav-row" aria-label="Primary">
      <div class="cell"><a class="brand" href="/" aria-label="WRL Forge home">
        <span class="brand-mark"><img src="/brand/wrl-forge-cyan-transparent.svg" width="512" height="512" alt=""></span>
        <span class="brand-txt" aria-hidden="true"><span class="brand-name">Forge</span><span class="brand-sub">VRML97 authoring</span></span>
      </a></div>
      <div class="cell nav-mid">
        <ul class="nav-links" id="nav-links">
          <li><a href="#product"><span class="n" aria-hidden="true">01</span>Product</a></li>
          <li><a href="#authoring"><span class="n" aria-hidden="true">02</span>Authoring</a></li>
          <li><a href="#roadmap"><span class="n" aria-hidden="true">03</span>Roadmap</a></li>
          <li><a href="${LINKS.docs}" ${ext}><span class="n" aria-hidden="true">04</span>Documentation<span class="x" aria-hidden="true">↗</span></a></li>
          <li><a href="${LINKS.repo}" ${ext}><span class="n" aria-hidden="true">05</span>GitHub<span class="x" aria-hidden="true">↗</span></a></li>
          <li class="nav-dl"><a href="#download"><span class="n" aria-hidden="true">06</span>Download</a></li>
          <li class="nav-meta" aria-hidden="true"><span>Latest <b>${version}</b></span><span>${chan}</span></li>
        </ul>
      </div>
      <div class="cell nav-end">
        <button class="icon-btn" type="button" id="theme-btn" aria-label="Switch color theme" title="Switch color theme">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 2a8 8 0 0 1 0 16z" fill="currentColor"/></svg>
        </button>
        <button class="icon-btn menu-btn" type="button" id="menu-btn" aria-expanded="false" aria-controls="nav-links" aria-label="Menu">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" stroke-width="1.8"/></svg>
        </button>
        <a class="btn btn-amber nav-cta" href="#download">Download <span class="arr" aria-hidden="true">→</span></a>
      </div>
    </nav>
  </div>
</header>

<main id="main" class="frame">

  <!-- 02 hero -->
  <section class="hero" aria-labelledby="hero-h">
    <div class="row">
      <div class="cell span2 hero-copy fill">
        <div class="beta">
          <span class="label"><b>02</b> · VRML97 authoring · open source</span>
          <span class="tag">${version} · ${chan}</span>
        </div>
        <h1 class="stencil hero-h1" id="hero-h"><span>Model<span class="dot">.</span></span><span>Edit<span class="dot">.</span></span><span>Forge<span class="dot">.</span></span></h1>
        <div>
          <p class="lead hero-sub">A modern visual authoring environment for VRML97, built with X3D support in mind. Build in 3D, work directly with the source, and stay in control of every edit.</p>
          <p class="label" style="margin-top:12px">Today: VRML97 source editing, validation and live preview. Visual tools are in development; X3D files are planned.</p>
        </div>
        <div class="hero-cta">
          <a class="btn btn-amber" href="#download">Download WRL Forge <span class="arr" aria-hidden="true">↓</span></a>
          <a class="btn btn-ghost" href="${LINKS.repo}" ${ext}>Explore the Project <span class="arr" aria-hidden="true">→</span></a>
        </div>
      </div>
      <div class="cell span2 viewport" id="viewport">
        <div class="vp-bar">
          <span class="label">Viewport · X_ITE</span>
          <button type="button" class="icon-btn" id="spin-btn" aria-pressed="false" aria-label="Pause the TimeSensor" title="Pause the TimeSensor" hidden>
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 4v12M14 4v12" stroke="currentColor" stroke-width="2.4"/></svg>
          </button>
        </div>
        <div class="vp-stage" id="vp-stage">
          ${heroFallback()}
          <div class="vp-sel" id="vp-sel" aria-hidden="true"></div>
          <span class="vp-hint" id="vp-hint">Static preview</span>
        </div>
        <div class="src">
          <div class="src-bar"><span>hero-harley.wrl</span><span>Hover a line</span></div>
          <ol id="src-lines" aria-label="VRML source of the scene shown above">
            ${HERO_SRC.map(([html, node]) => `<li${node ? ` data-node="${node}" tabindex="0"` : ""}>${html}</li>`).join("")}
          </ol>
          <div class="src-foot"><span id="src-node">Spin.rotation</span><output id="src-rot" aria-live="off">0 1 0 0.000</output></div>
        </div>
      </div>
    </div>
    <div class="row"><div class="cell span4 label" style="padding-block:12px">Website visualization, not the editor · Model: &ldquo;the Red Raven&rdquo; © 2003 LSS, used with permission</div></div>
  </section>

  <div class="row gap" aria-hidden="true"><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div></div>

  <!-- 03 statement -->
  <section id="product" aria-labelledby="s03">
    <div class="row">
      <div class="cell span3 sec-head fill"><span class="num">03 — Product</span><h2 class="stencil sec-title" id="s03">The 3D web deserves <em>better tools.</em></h2></div>
      <div class="cell sec-head"><span class="label">Standards first</span></div>
    </div>
    <div class="row">
      <div class="cell span2 prose reveal">
        <p class="big-quote">VRML worlds are still being built, restored and explored. <em>The editors they were made in</em> mostly stopped at Windows 98.</p>
      </div>
      <div class="cell span2 prose reveal">
        <p>Classic authoring tools let people build worlds directly in 3D, but they rewrote files on save and are hard to run today. Text editors keep your source intact but can't show you the scene.</p>
        <p><strong>WRL Forge is working to close that gap</strong>: a cross-platform desktop application with live preview and validation today, and visual authoring tools being built on top of the exact source.</p>
        <ul class="lineage" style="margin-top:24px">
          <li><i>A</i><b>Spazz3D / Vivaty</b><span>Direct creation: build the scene by working in the scene.</span></li>
          <li><i>B</i><b>White Dune</b><span>Authoring depth: every node, field and route within reach.</span></li>
          <li><i>C</i><b>Modern 3D editors</b><span>Usability that current desktop users expect.</span></li>
        </ul>
        <p class="label" style="margin-top:16px">Inspirations, not affiliations.</p>
      </div>
    </div>
  </section>

  <!-- 04 source first -->
  <section class="sec-src" aria-labelledby="s04">
    <div class="row">
      <div class="cell sec-head"><span class="label">Exact source</span></div>
      <div class="cell span3 sec-head fill"><span class="num">04 — Source first</span><h2 class="stencil sec-title" id="s04">Your source is <em>still your source.</em></h2></div>
    </div>
    <div class="row">
      <div class="cell span4 reveal">
        <div class="flow">
<pre class="doc" aria-label="Example VRML document"><span class="c"># my-world.wrl — the document</span>
<span class="k">DEF</span> <span class="d">Lamp</span> <span class="k">Transform</span> {
  translation <mark>0 2.5 0</mark>   <span class="c"># kept as written</span>
  children [ <span class="k">Shape</span> { ... } ]
}</pre>
          <div class="arrow" aria-hidden="true">one document</div>
          <ul class="views" aria-label="Views of the same document">
            <li><b>Code</b>${tag("ok")}</li>
            <li><b>Scene tree</b><span class="tag ok">Read-only</span></li>
            <li><b>Inspector</b><span class="tag dev">Editing in dev</span></li>
            <li><b>Viewport</b><span class="tag dev">Selection in dev</span></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="cell span4">
        <ol class="points">
          <li class="reveal"><h3>Exact source preservation</h3><p>Comments, spacing, number formats and vendor quirks survive every edit. The editor never re-prints your file.</p>${tag("ok")}</li>
          <li class="reveal"><h3>Source-backed operations</h3><p>A visual change becomes a small patch to the exact characters it affects: move a Box and only its <code>translation</code> changes.</p>${tag("dev")}</li>
          <li class="reveal"><h3>Scene tree and inspector</h3><p>Derived views of the document. Nodes, USE references, PROTOs and ROUTEs, read-only in the current release.</p>${tag("ok")}</li>
          <li class="reveal"><h3>Document transactions</h3><p>Each visual action is one transaction and one Undo, applied to the same text the code editor shows.</p>${tag("dev")}</li>
          <li class="reveal"><h3>Safe saving</h3><p>Backup-first saves, external-change conflict detection, crash recovery, gzip preserved.</p>${tag("ok")}</li>
          <li class="reveal"><h3>No wholesale regeneration</h3><p>WRL Forge does not export a scene graph over your work. What you didn't touch stays byte-for-byte the same.</p>${tag("ok")}</li>
        </ol>
      </div>
    </div>
  </section>

  <div class="row gap" aria-hidden="true"><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div></div>

  <!-- 05 capabilities -->
  <section id="authoring" aria-labelledby="s05">
    <div class="row">
      <div class="cell span2 sec-head fill"><span class="num">05 — Authoring</span><h2 class="stencil sec-title" id="s05">Four ways <em>in.</em></h2></div>
      <div class="cell span2 sec-head">
        <p class="prose" style="color:var(--soft)">Every capability is labeled with its real state. <strong style="color:var(--ink)">Available</strong> means in the current release. <strong style="color:var(--ink)">In development</strong> means merged or being built, but not released. <strong style="color:var(--ink)">Planned</strong> means direction, not a promise.</p>
        <div class="legend">${tag("ok")}${tag("dev")}${tag("plan")}</div>
      </div>
    </div>
    <div class="row">${capCols}
    </div>
  </section>

  <!-- 06 workspaces -->
  <section aria-labelledby="s06">
    <div class="row">
      <div class="cell span3 sec-head fill"><span class="num">06 — Workspaces</span><h2 class="stencil sec-title" id="s06">A bench for <em>every job.</em></h2></div>
      <div class="cell sec-head"><span class="label">Screenshots are real.<br>Sketches are labeled.</span></div>
    </div>
    <div class="row">
      <div class="cell span4" style="padding:0">
        <div class="ws-tabs" role="tablist" aria-label="Workspaces">${wsTabs}
        </div>${wsPanels}
      </div>
    </div>
  </section>

  <div class="row gap" aria-hidden="true"><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div></div>

  <!-- 07 profiles -->
  <section class="sec-prof" aria-labelledby="s07">
    <div class="row">
      <div class="cell span3 sec-head fill"><span class="num">07 — Profiles</span><h2 class="stencil sec-title" id="s07">One editor. <em>Different worlds.</em></h2></div>
      <div class="cell sec-head"><span class="label">Rules are opt-in</span></div>
    </div>
    <div class="row">
      <div class="cell profile reveal">
        <span class="num">07.1</span><h3 class="stencil">Generic VRML97</h3>${tag("ok")}
        <p>Standards-oriented editing, validation and preview, with no Cybertown rules applied.</p>
        <ul><li>VRML97 <code>.wrl</code> / <code>.wrz</code>, gzip-aware</li><li>Syntax diagnostics</li><li>Live X_ITE preview</li></ul>
        <p class="note">X3D file support (<code>.x3d</code>, <code>.x3dv</code>) is not available yet. ${tag("plan")}</p>
      </div>
      <div class="cell profile reveal">
        <span class="num">07.2</span><h3 class="stencil">Cybertown Mall</h3>${tag("ok")}
        <p>A specialized profile for Mall items.</p>
        <ul><li>Original and Fit placement preview</li><li>Ground, center, Z-limit, 10 m guides</li><li>80 KiB gzip upload-size check</li><li>Measured-size gzip repack</li></ul>
        <p class="note">Independent community project. Not affiliated with, endorsed by, or officially connected to Cybertown.</p>
      </div>
      <div class="cell span2 profile reveal fill">
        <span class="num">07.3</span><h3 class="stencil">World Projects</h3>${tag("ok")}
        <p>Multi-file worlds, nested <code>Inline</code> references at any depth, textures, asset scanning for missing, remote and case-mismatched files, viewpoint preview, and deterministic ZIP bundles for manual upload.</p>
        <figure class="ws-shot" style="padding:0;background:none">
          <img src="/screens/world-project.webp" width="1100" height="791" loading="lazy" decoding="async"
            alt="World Project workspace: scan summary, a world preview reporting three local assets loaded, viewpoint and navigation controls.">
          <figcaption><b>Screenshot · shipped since v1.3.0-beta.2</b> · <span class="real">real application screenshot</span></figcaption>
        </figure>
      </div>
    </div>
  </section>

  <!-- 08 principles -->
  <section class="sec-why" aria-labelledby="s08">
    <div class="row">
      <div class="cell span2 sec-head fill"><span class="num">08 — Why WRL Forge</span><h2 class="stencil sec-title" id="s08">Built on <em>principles.</em></h2></div>
      <div class="cell span2 sec-head"><span class="label">No benchmarks. Just how it works.</span></div>
    </div>
    <div class="row">
      <div class="cell span4" style="padding:0">
        <ol class="principles">
          <li class="reveal"><span class="num">P/01</span><h3>Exact source control</h3><p>The source text is the document. Every other view is derived from it.</p></li>
          <li class="reveal"><span class="num">P/02</span><h3>X_ITE rendering</h3><p>An established open-source VRML/X3D engine, bundled locally. The only renderer.</p></li>
          <li class="reveal"><span class="num">P/03</span><h3>Local first</h3><p>No account, no cloud, no telemetry. Remote URLs in a scene are blocked, not fetched.</p></li>
          <li class="reveal"><span class="num">P/04</span><h3>Open source</h3><p>GPL-3.0-or-later. Contributors keep their copyright: DCO sign-off, no CLA.</p></li>
          <li class="reveal"><span class="num">P/05</span><h3>Non-destructive</h3><p>Backups before saves. The preview keeps the last valid scene when an edit breaks it.</p></li>
          <li class="reveal"><span class="num">P/06</span><h3>Standards first</h3><p>VRML97 semantics come first, and X3D-only fields don't leak into VRML97 output.</p></li>
          <li class="reveal"><span class="num">P/07</span><h3>Optional profiles</h3><p>Cybertown rules apply only when you choose that profile.</p></li>
          <li class="reveal"><span class="num">P/08</span><h3>Cross-platform</h3><p>Windows x64, macOS on Apple Silicon (signed and notarized), Linux x64.</p></li>
        </ol>
      </div>
    </div>
  </section>

  <div class="row gap" aria-hidden="true"><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div></div>

  <!-- 09 development -->
  <section id="roadmap" aria-labelledby="s09">
    <div class="row">
      <div class="cell span3 sec-head fill"><span class="num">09 — Development</span><h2 class="stencil sec-title" id="s09">Built in <em>the open.</em></h2></div>
      <div class="cell sec-head"><a class="btn btn-ghost" href="${LINKS.roadmap}" ${ext}>Roadmap <span class="arr" aria-hidden="true">→</span></a></div>
    </div>
    <div class="row">
      <div class="cell span2 reveal">
        <span class="label track-h ok">Current beta</span>
        <ul class="track" style="margin-top:14px">
          <li>${tag("ok")}<p><strong>${version}</strong>${relDate ? ` · ${relDate}` : ""}: source editor, validation, live preview, Mall and World Project tools, read-only scene tree and inspector. Builds for Windows, macOS and Linux.</p></li>
        </ul>
        <span class="label track-h dev" style="margin-top:26px">Visual authoring progress</span>
        <ul class="track" style="margin-top:14px">
          <li>${tag("dev")}<p>Typed inspector editing: position, rotation, size, color.</p></li>
          <li>${tag("dev")}<p>First objects: add Box and Sphere, duplicate, delete, one Undo per action.</p></li>
          <li>${tag("dev")}<p>Code / Model workspace switch.</p></li>
          <li>${tag("dev")}<p>Viewport click-to-select, only where the source node is proven.</p></li>
        </ul>
      </div>
      <div class="cell span2 reveal">
        <span class="label track-h plan">Upcoming milestones · no dates promised</span>
        <ul class="track" style="margin-top:14px">
          <li>${tag("plan")}<p>Transform gizmos and snapping.</p></li>
          <li>${tag("plan")}<p>Grouping and hierarchy editing.</p></li>
          <li>${tag("plan")}<p>Materials, textures and appearance.</p></li>
          <li>${tag("plan")}<p>ROUTEs, sensors and scripting.</p></li>
          <li>${tag("plan")}<p>Animation and PROTO workflows.</p></li>
          <li>${tag("plan")}<p>X3D file support.</p></li>
        </ul>
        <p class="label" style="margin-top:18px">Source: <a href="${LINKS.roadmap}" ${ext}>WRL_FORGE_ROADMAP.md</a> · <a href="${LINKS.changelog}" ${ext}>CHANGELOG</a></p>
      </div>
    </div>
    <div class="row">
      <div class="cell span4" style="padding:0">
        <div class="cell" style="padding-bottom:12px"><span class="label">Release history · live from GitHub</span></div>
        <ul class="rel-list">${history}
        </ul>
      </div>
    </div>
  </section>

  <!-- 10 faq -->
  <section aria-labelledby="s10">
    <div class="row">
      <div class="cell span2 sec-head fill"><span class="num">10 — FAQ</span><h2 class="stencil sec-title" id="s10">Questions, <em>answered.</em></h2></div>
      <div class="cell span2 sec-head"><span class="label">Still stuck? <a href="${LINKS.discussions}" ${ext}>Ask on GitHub Discussions</a></span></div>
    </div>
    <div class="row"><div class="cell span4 faq" style="padding:0">${faq}
    </div></div>
  </section>

  <div class="row gap" aria-hidden="true"><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div></div>

  <!-- 11 download -->
  <section id="download" class="sec-dl" aria-labelledby="s11">
    <div class="row">
      <div class="cell span2 sec-head fill ticks"><span class="num">11 — Download</span><h2 class="stencil sec-title" id="s11">Get <em>the forge.</em></h2></div>
      <div class="cell span2 sec-head">
        <div class="dl-head"><span class="ver">${version}</span><span class="tag dev">${chan}</span>${relDate ? `<span class="label">Released ${relDate}</span>` : ""}</div>
        <p style="color:var(--soft)">Free and open source. Beta software: keep backups of important worlds. Windows and Linux builds are not code-signed during the beta; macOS builds are signed and notarized.</p>
      </div>
    </div>
    <div class="row">
      <div class="cell span4" style="padding:0">
        <div class="platforms">
          ${platformTile(model.heroWindows, "windows", "Windows", "Windows · x64")}
          ${platformTile(model.heroMac, "mac", "macOS", "macOS · Apple Silicon")}
          ${platformTile(model.heroLinux, "linux", "Linux", "Linux · x64")}
        </div>
        ${downloadsList(model)}
        <div class="dl-links">
          ${model.checksumsUrl ? `<a href="${esc(model.checksumsUrl)}">SHA-256 checksums</a>` : ""}
          <a href="${esc(model.releaseUrl)}" ${ext}>Release notes</a>
          <a href="${LINKS.install}" ${ext}>Installation guide</a>
          <a href="${LINKS.troubleshooting}" ${ext}>Troubleshooting</a>
          <a href="${RELEASES_PAGE}" ${ext}>All releases</a>
        </div>
      </div>
    </div>
  </section>
</main>

<!-- 12 footer -->
<footer class="frame" aria-labelledby="foot-h">
  <h2 class="sr-only" id="foot-h">Site footer</h2>
  <div class="row">
    <div class="cell foot-cols"><h3>Project</h3><ul>
      <li><a href="${LINKS.repo}" ${ext}>Application repository</a></li>
      <li><a href="#download">Downloads</a></li>
      <li><a href="${LINKS.roadmap}" ${ext}>Roadmap</a></li>
      <li><a href="${LINKS.changelog}" ${ext}>Changelog</a></li></ul></div>
    <div class="cell foot-cols"><h3>Learn</h3><ul>
      <li><a href="${LINKS.docs}" ${ext}>Documentation</a></li>
      <li><a href="${LINKS.usage}" ${ext}>User guide</a></li>
      <li><a href="${LINKS.install}" ${ext}>Installation</a></li></ul></div>
    <div class="cell foot-cols"><h3>Help</h3><ul>
      <li><a href="${LINKS.support}" ${ext}>Support</a></li>
      <li><a href="${LINKS.discussions}" ${ext}>Discussions</a></li>
      <li><a href="${LINKS.issues}" ${ext}>Report an issue</a></li>
      <li><a href="${LINKS.security}" ${ext}>Security</a></li></ul></div>
    <div class="cell foot-cols"><h3>Legal</h3><ul>
      <li><a href="${LINKS.license}" ${ext}>App license (GPLv3+)</a></li>
      <li><a href="${LINKS.siteLicense}" ${ext}>Site license (GPLv3+)</a></li>
      <li><a href="${LINKS.credits}" ${ext}>Credits</a></li>
      <li><a href="${LINKS.notices}" ${ext}>Third-party notices</a></li></ul></div>
  </div>
  <div class="row">
    <div class="cell span3 legal">
      <span><a href="${LINKS.siteLicense}" ${ext}>GPLv3+</a> © 2026 WRL Forge · Ryan Bundy (aka BassMekanik2000) and contributors</span>
      <span class="credit">Hero world: <a href="https://lss3d.silver-hosting.com/index.php?op=worlds" ${ext}>&ldquo;the Red Raven&rdquo; by LSS</a> · rendered live in X_ITE · used with permission &#9825;</span>
      <span>Independent community project, not affiliated with Cybertown. Display type: Big Shoulders Stencil (OFL).</span>
    </div>
    <div class="cell legal" style="justify-content:space-between">
      <span>${version} · ${chan}</span>
      <a href="https://skate.fm" ${ext}>Powered by Skate.FM</a>
      <a href="#top">Back to top ↑</a>
    </div>
  </div>
  <div class="wordmark" aria-hidden="true"><span>F<i>01</i></span><span>O<i>02</i></span><span>R<i>03</i></span><span>G<i>04</i></span><span>E<i>05</i></span></div>
</footer>

<script>
${CLIENT_JS}
</script>
</body>
</html>`;
}

// ---- entry -----------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const model = await resolveReleaseModel();
    const html = renderPage(model);
    return new Response(html, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};
