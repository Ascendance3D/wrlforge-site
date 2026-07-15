// WRL Forge marketing site — Cloudflare Worker.
// Renders the landing page server-side and resolves the newest GitHub release
// (prereleases INCLUDED — the product currently ships beta prereleases, which
// the /releases/latest endpoint deliberately hides).

const REPO = "DJAscendance/wrlforge";
const RELEASES_PAGE = "https://github.com/DJAscendance/wrlforge/releases";

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
    prerelease: false,
    assets: [],
    checksumsUrl: null,
    heroWindows: null,
    heroLinux: null,
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

    const classified = (rel.assets || []).map(a => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
      sizeLabel: formatBytes(a.size),
      ...classifyAsset(a),
    }));

    for (const a of classified) {
      if (a.platform === "checksums") { model.checksumsUrl = a.url; continue; }
      if (a.platform === "windows" || a.platform === "linux") model.assets.push(a);
    }

    const byKind = (arr, kinds) => kinds.map(k => arr.find(a => a.kind === k)).find(Boolean);
    const win = model.assets.filter(a => a.platform === "windows");
    const lin = model.assets.filter(a => a.platform === "linux");
    model.heroWindows = byKind(win, ["Installer (Setup)", "MSI installer", "Portable (exe)", "Portable (zip)"]) || win[0] || null;
    model.heroLinux   = byKind(lin, ["AppImage", "Portable (tar.gz)", "Debian package"]) || lin[0] || null;

    const order = { windows: 0, linux: 1 };
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

// ---- retro 3D scene generators (pure SVG, no assets) -----------------------

// A late-90s wireframe globe: rim, latitude/longitude wires, shaded body,
// amber vertex nodes at the poles. `hue` picks the wire/vertex palette.
function wireGlobe(px, hue) {
  const P = {
    cyan:    { wire: "#9fe8ff", body: "#12324a", glow: "#2f9fc9", vtx: "#ffb23c" },
    magenta: { wire: "#ff8fe6", body: "#3a1440", glow: "#e05cc8", vtx: "#ffd36a" },
    amber:   { wire: "#ffd58a", body: "#3a2708", glow: "#ffb23c", vtx: "#9fe8ff" },
  }[hue] || { wire: "#9fe8ff", body: "#12324a", glow: "#2f9fc9", vtx: "#ffb23c" };

  const r = 50;
  const lat = [-32, 0, 32].map(cy => {
    const rx = Math.sqrt(r * r - cy * cy);
    return `<ellipse cx="0" cy="${cy}" rx="${rx.toFixed(1)}" ry="8"/>`;
  }).join("");
  const lon = [16, 34].map(rx => `<ellipse cx="0" cy="0" rx="${rx}" ry="${r}"/>`).join("")
    + `<line x1="0" y1="${-r}" x2="0" y2="${r}"/>`
    + `<line x1="${-r}" y1="0" x2="${r}" y2="0"/>`;
  const gid = "g" + hue;
  const vtx = [[0, -r], [0, r], [-r, 0], [r, 0], [-16, -20], [16, -20], [0, 32]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${P.vtx}"/>`).join("");

  return `<svg class="planet-svg" viewBox="-58 -58 116 116" width="${px}" height="${px}" aria-hidden="true">
    <defs><radialGradient id="${gid}" cx="34%" cy="30%" r="75%">
      <stop offset="0%" stop-color="${P.glow}" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="${P.body}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#050309" stop-opacity="1"/>
    </radialGradient></defs>
    <circle cx="0" cy="0" r="${r}" fill="url(#${gid})"/>
    <g fill="none" stroke="${P.wire}" stroke-width="1.1" opacity="0.75">
      <circle cx="0" cy="0" r="${r}"/>${lat}${lon}
    </g>
    ${vtx}
  </svg>`;
}

// A wireframe globe that spins Earth-style: meridians sweep across and flatten
// edge-on while a surface marker rolls across the front face. Options: hue
// (palette), tilt (axis lean, deg), rev (reverse spin direction), dur (period).
function spinningGlobe(px, opts = {}) {
  const { hue = "cyan", tilt = 0, rev = false, dur = 11 } = opts;
  const P = {
    cyan:    { wire: "#9fe8ff", glow: "#2f9fc9", body: "#12324a", vtx: "#ffb23c" },
    magenta: { wire: "#ff8fe6", glow: "#e05cc8", body: "#3a1440", vtx: "#ffd36a" },
    amber:   { wire: "#ffd58a", glow: "#ffb23c", body: "#3a2708", vtx: "#9fe8ff" },
  }[hue] || { wire: "#9fe8ff", glow: "#2f9fc9", body: "#12324a", vtx: "#ffb23c" };
  const r = 50, N = 6, gid = "gspin_" + hue;
  const lat = [-30, 0, 30].map(cy => {
    const rx = Math.sqrt(r * r - cy * cy);
    return `<ellipse cx="0" cy="${cy}" rx="${rx.toFixed(1)}" ry="7"/>`;
  }).join("");
  let mer = "";
  for (let i = 0; i < N; i++) {
    const delay = (-(dur / N) * i).toFixed(2);
    mer += `<ellipse class="mer" cx="0" cy="0" rx="${r}" ry="${r}" style="animation-delay:${delay}s"/>`;
  }
  const poles = [[0, -r], [0, r]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${P.vtx}"/>`).join("");
  const svgStyle = `transform:rotate(${tilt}deg);--gdur:${dur}s`;
  return `<svg class="planet-svg" viewBox="-58 -58 116 116" width="${px}" height="${px}" style="${svgStyle}" aria-hidden="true">
    <defs><radialGradient id="${gid}" cx="34%" cy="30%" r="75%">
      <stop offset="0%" stop-color="${P.glow}" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="${P.body}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#050309" stop-opacity="1"/>
    </radialGradient></defs>
    <circle cx="0" cy="0" r="${r}" fill="url(#${gid})"/>
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="${P.wire}" stroke-width="1.1" opacity="0.75"/>
    <g fill="none" stroke="${P.wire}" stroke-width="1" opacity="0.55">${lat}</g>
    <g fill="none" stroke="${P.wire}" stroke-width="1.1">${mer}</g>
    ${poles}
    <circle class="glb-mark${rev ? " rev" : ""}" cx="0" cy="0" r="2.6" fill="${P.vtx}"/>
  </svg>`;
}

// A faceted low-poly gem-planet with a thin low-poly ring — the "hero" planet.
// Two concentric rings of facets (a mid ring + a centre cap) give it real
// polygon density instead of a flat wedge fan.
function ringedPlanet(px) {
  const r = 48, rm = r * 0.56, n = 13; // odd count avoids a seam down the centre
  const tones = ["#123a54", "#2f9fc9", "#1d5578", "#7fd6f2"];
  const pt = (rad, a) => [(Math.cos(a) * rad).toFixed(1), (Math.sin(a) * rad).toFixed(1)];
  let facets = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const [ox0, oy0] = pt(r, a0), [ox1, oy1] = pt(r, a1);
    const [mx0, my0] = pt(rm, a0), [mx1, my1] = pt(rm, a1);
    // Alternate facet colours around AND across the rings so it reads as a
    // faceted gem rather than a concentric radial gradient (bullseye).
    const outer = tones[i % tones.length];
    const inner = tones[(i + 2) % tones.length];
    facets += `<polygon points="${ox0},${oy0} ${ox1},${oy1} ${mx1},${my1} ${mx0},${my0}" fill="${outer}"/>`;
    facets += `<polygon points="${mx0},${my0} ${mx1},${my1} 0,0" fill="${inner}"/>`;
  }
  let verts = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const [rx, ry] = pt(r, a), [mx, my] = pt(rm, a);
    verts += `<circle cx="${rx}" cy="${ry}" r="1.7" fill="#ffb23c"/>`;
    verts += `<circle cx="${mx}" cy="${my}" r="1.2" fill="#ffd58a"/>`;
  }
  return `<svg class="planet-svg" viewBox="-80 -64 160 128" width="${px}" height="${Math.round(px * 0.8)}" aria-hidden="true">
    <ellipse cx="0" cy="6" rx="74" ry="20" fill="none" stroke="#ffb23c" stroke-width="1.4" opacity="0.55"/>
    <ellipse cx="0" cy="6" rx="62" ry="16" fill="none" stroke="#9fe8ff" stroke-width="0.8" opacity="0.35"/>
    <g stroke="#06121c" stroke-width="0.6" stroke-linejoin="round">${facets}</g>
    ${verts}
    <ellipse cx="0" cy="6" rx="74" ry="20" fill="none" stroke="#ffb23c" stroke-width="1.4" opacity="0.9"
      stroke-dasharray="0 118 130 400"/>
  </svg>`;
}

// The receding wireframe ground plane (VRML/Tron horizon) for the page floor.
function gridFloor() {
  const W = 1600, H = 440, vpx = W / 2, cols = 30, rows = 13;
  let lines = "";
  // Converging verticals.
  for (let i = 0; i <= cols; i++) {
    const xb = -0.5 * W + (i / cols) * (2 * W);
    lines += `<line x1="${xb.toFixed(1)}" y1="${H}" x2="${vpx}" y2="0"/>`;
  }
  // Receding horizontals, denser toward the horizon.
  for (let k = 1; k <= rows; k++) {
    const t = k / rows;
    const y = H * Math.pow(t, 1.9);
    const lx = vpx + (-0.5 * W - vpx) * (y / H);
    const rx = vpx + (1.5 * W - vpx) * (y / H);
    const op = (0.12 + 0.5 * (y / H)).toFixed(2);
    lines += `<line x1="${lx.toFixed(1)}" y1="${y.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${y.toFixed(1)}" opacity="${op}"/>`;
  }
  return `<svg class="grid-floor" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <g stroke="#2f9fc9" stroke-width="1" opacity="0.5">${lines}</g>
  </svg>`;
}

// Small wireframe VRML primitives for the left object palette.
function primitiveIcon(kind) {
  const s = `class="prim-svg" viewBox="0 0 64 64" aria-hidden="true"`;
  const stroke = `fill="none" stroke="#9fe8ff" stroke-width="1.4" stroke-linejoin="round"`;
  const back = `fill="none" stroke="#2f9fc9" stroke-width="1" opacity="0.5"`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#ffb23c"/>`;
  switch (kind) {
    case "Box":
      return `<svg ${s}><g ${back}><polyline points="20,18 44,18 44,42"/><line x1="20,18" x2="20,18"/></g>
        <g ${stroke}><polygon points="14,24 34,16 50,24 30,32"/><polyline points="14,24 14,44 30,52 30,32"/>
        <polyline points="50,24 50,44 30,52"/></g>${dot(14,24)}${dot(50,24)}${dot(30,52)}${dot(34,16)}</svg>`;
    case "Cone":
      return `<svg ${s}><ellipse cx="32" cy="46" rx="20" ry="7" ${back}/>
        <g ${stroke}><path d="M32 12 L12 46 M32 12 L52 46"/><ellipse cx="32" cy="46" rx="20" ry="7"/></g>
        ${dot(32,12)}${dot(12,46)}${dot(52,46)}</svg>`;
    case "Sphere":
      return `<svg ${s}><g ${stroke}><circle cx="32" cy="32" r="20"/><ellipse cx="32" cy="32" rx="20" ry="7.5"/>
        <ellipse cx="32" cy="32" rx="7.5" ry="20"/></g>${dot(32,12)}${dot(32,52)}${dot(12,32)}${dot(52,32)}</svg>`;
    case "Cylinder":
      return `<svg ${s}><g ${stroke}><ellipse cx="32" cy="18" rx="16" ry="6"/><path d="M16 18 L16 46 M48 18 L48 46"/>
        <ellipse cx="32" cy="46" rx="16" ry="6"/></g><ellipse cx="32" cy="46" rx="16" ry="6" ${back}/>
        ${dot(16,18)}${dot(48,18)}${dot(16,46)}${dot(48,46)}</svg>`;
    case "Extrusion":
      return `<svg ${s}><g ${stroke}><polygon points="18,44 24,20 40,20 46,44"/>
        <polygon points="26,40 30,24 38,24 40,40"/><path d="M18,44 26,40 M24,20 30,24 M40,20 38,24 M46,44 40,40"/></g>
        ${dot(18,44)}${dot(24,20)}${dot(40,20)}${dot(46,44)}</svg>`;
    default:
      return `<svg ${s}><circle cx="32" cy="32" r="18" ${stroke}/></svg>`;
  }
}

// RGB axis gizmo, the way every VRML/3D viewport shows orientation.
function axisGizmo() {
  return `<svg class="gizmo" viewBox="0 0 90 90" aria-hidden="true">
    <g stroke-width="2" stroke-linecap="round" fill="none">
      <line x1="30" y1="60" x2="78" y2="60" stroke="#ff6b6b"/>
      <line x1="30" y1="60" x2="30" y2="12" stroke="#7dff7a"/>
      <line x1="30" y1="60" x2="8" y2="80" stroke="#6ab8ff"/>
    </g>
    <text x="82" y="63" fill="#ff6b6b">X</text>
    <text x="26" y="10" fill="#7dff7a">Y</text>
    <text x="2" y="86" fill="#6ab8ff">Z</text>
  </svg>`;
}

// ---- download UI -----------------------------------------------------------

function heroButton(asset, os, label, cls) {
  if (!asset) {
    return `<a href="${RELEASES_PAGE}" class="btn ${cls}">
      <span class="btn-os">${esc(os)}</span>
      <span class="btn-title">${esc(label)}</span>
      <span class="btn-sub">see all releases</span></a>`;
  }
  return `<a href="${esc(asset.url)}" class="btn ${cls}">
    <span class="btn-os">${esc(os)}</span>
    <span class="btn-title">${esc(label)}</span>
    <span class="btn-sub">${esc(asset.kind)} &middot; ${esc(asset.sizeLabel)}</span></a>`;
}

function downloadsList(model) {
  if (!model.assets.length) return "";
  const rows = model.assets.map(a => `
    <li class="dl-row"><a href="${esc(a.url)}">
      <span class="dl-os">${esc(a.os)}</span>
      <span class="dl-kind">${esc(a.kind)}</span>
      <span class="dl-size">${esc(a.sizeLabel)}</span></a></li>`).join("");
  const checksums = model.checksumsUrl
    ? `<a class="dl-checksums" href="${esc(model.checksumsUrl)}">▚ SHA-256 checksums</a>` : "";
  return `<details class="all-downloads">
    <summary><span class="tw">[+]</span> all downloads &amp; file sizes <span class="dim">(${model.assets.length})</span></summary>
    <ul class="dl-list">${rows}</ul>${checksums}</details>`;
}

// ---- page ------------------------------------------------------------------

function renderPage(model) {
  const version = esc(model.version);
  const chan = model.prerelease ? "PRE-RELEASE BETA" : "STABLE";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WRL Forge — Build. Preview. Validate. Package.</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNTEyIDUxMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBzaGFwZS1yZW5kZXJpbmc9ImNyaXNwRWRnZXMiPgogIDwhLS0gZmxhdCBiYW5kZWQgdmlvbGV0IGJhY2tncm91bmQsIG5vIHNtb290aCBncmFkaWVudHMgLS0+CgogIDwhLS0gZ3JvdW5kIHNoYWRvdzogaGFyZCBmbGF0IHNpbGhvdWV0dGUsIG5vIGJsdXIgLS0+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTAsMTIpIiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiMwNTAzMDkiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iNDAiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSI0MCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzNCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM2Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSI0MCIvPgogIDwvZz4KCiAgPCEtLSBleHRydXNpb24gYmFzZSAoc2hhZG93IGZhY2UsIG9mZnNldCBkb3duLXJpZ2h0KSAtLT4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg5LDkpIiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiMxMzQwNWMiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iMzgiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzMiIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM0Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogIDwvZz4KCiAgPCEtLSBtYWluIGZhY2UgKG1pZCBhbWJlciwgbm8gb2Zmc2V0KSAtLT4KICA8ZyBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiMyZjlmYzkiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iMzgiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzMiIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM0Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogIDwvZz4KPC9zdmc+Cg==">
<meta property="og:title" content="WRL Forge">
<meta property="og:description" content="Build. Preview. Validate. Package. Welcome to the 3D platform builders love.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://wrlforge.com">
<meta property="og:image" content="https://raw.githubusercontent.com/DJAscendance/wrlforge/main/assets/generated/icons/runtime/icon.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="WRL Forge">
<meta name="twitter:description" content="Build. Preview. Validate. Package. Welcome to the 3D platform builders love.">
<meta name="twitter:image" content="https://raw.githubusercontent.com/DJAscendance/wrlforge/main/assets/generated/icons/runtime/icon.png">
<style>
:root{
  --void:#0a0618; --deep:#150c2c; --deep2:#1c1238;
  --cyan:#2f9fc9; --ice:#9fe8ff; --amber:#ffb23c; --magenta:#ff5fd0;
  --wire:rgba(47,159,201,.35); --muted:#8fa6c4;
  --mono:"Courier New",ui-monospace,"Cascadia Mono",monospace;
  --sans:"Helvetica Neue",Arial,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{
  background:var(--void); color:#fff; font-family:var(--sans);
  min-height:100vh; overflow-x:hidden; position:relative;
  -webkit-font-smoothing:antialiased;
}

/* ---------- ambient scene ---------- */
.stars{position:fixed;inset:0;z-index:-3;opacity:.5;pointer-events:none;background-image:
  radial-gradient(1px 1px at 12% 18%,#fff 100%,transparent),
  radial-gradient(1.5px 1.5px at 24% 44%,#dff3ff 100%,transparent),
  radial-gradient(1px 1px at 38% 12%,#fff 100%,transparent),
  radial-gradient(2px 2px at 52% 62%,rgba(255,255,255,.8) 100%,transparent),
  radial-gradient(1px 1px at 66% 28%,#fff 100%,transparent),
  radial-gradient(1.5px 1.5px at 78% 72%,#fff 100%,transparent),
  radial-gradient(1px 1px at 88% 40%,#cfeaff 100%,transparent),
  radial-gradient(1px 1px at 94% 88%,#fff 100%,transparent);
  background-size:340px 340px;}
.scene{position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden}
.horizon-glow{position:absolute;left:50%;bottom:-60px;width:150vw;height:340px;transform:translateX(-50%);
  background:radial-gradient(ellipse at center bottom,rgba(47,159,201,.5),rgba(47,159,201,.12) 40%,transparent 70%);}
.grid-floor{position:absolute;left:0;bottom:0;width:100%;height:44vh;min-height:300px}

.planet{position:absolute;filter:drop-shadow(0 0 18px rgba(47,159,201,.35))}
.planet.p-ring{top:8%;right:6%;width:min(30vw,300px);filter:drop-shadow(0 0 26px rgba(255,178,60,.28))}
.planet.p-cyan{top:26%;right:30%;width:110px;opacity:.9}
.planet.p-mag{top:8%;left:10%;width:62px;filter:drop-shadow(0 0 16px rgba(224,92,200,.5))}
.planet.p-amber{bottom:15%;right:12%;width:88px;opacity:.85}
.planet-svg,.prim-svg{display:block;width:100%;height:auto}

/* ---------- shell ---------- */
.wrap{position:relative;z-index:1;max-width:1320px;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column}

/* viewport toolbar / nav */
nav{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:18px 34px;
  border-bottom:1px solid var(--wire)}
.brand{display:flex;align-items:center;gap:14px}
.brand svg{width:34px;height:34px}
.brand .mark{font-family:var(--mono);font-weight:700;letter-spacing:3px;font-size:15px;color:#fff}
.brand .mark b{color:var(--amber)}
.nav-links{display:flex;gap:22px;font-family:var(--mono);font-size:13px;letter-spacing:1px;text-transform:uppercase}
.nav-links a{color:var(--ice);text-decoration:none;opacity:.85;transition:.2s}
.nav-links a:hover{opacity:1;color:#fff;text-shadow:0 0 10px var(--cyan)}
.vp-status{font-family:var(--mono);font-size:11px;letter-spacing:1px;color:var(--muted);display:flex;gap:12px;align-items:center}
.vp-status .chip{color:var(--ice);opacity:.7}
.vp-status .chip.on{color:var(--amber);opacity:1}

/* hero */
.hero{flex:1;position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;
  padding:38px 34px;max-width:980px}
.hero::before{content:"";position:absolute;z-index:-1;inset:0 6% 0 -40px;pointer-events:none;
  background:radial-gradient(120% 78% at 24% 46%,rgba(8,4,20,.9),rgba(8,4,20,.5) 54%,transparent 82%)}
.eyebrow{font-family:var(--mono);font-size:14px;letter-spacing:1px;color:var(--cyan);margin-bottom:22px;
  align-self:flex-start;display:inline-flex;align-items:center;gap:10px;border:1px solid var(--wire);
  padding:6px 12px;border-radius:4px;background:rgba(21,12,44,.5)}
.eyebrow b{color:var(--ice)} .eyebrow .blink{color:var(--amber)}
h1{font-size:clamp(2.8rem,7vw,5.6rem);font-weight:800;line-height:.98;letter-spacing:-.03em;margin-bottom:22px;
  text-shadow:0 0 40px rgba(47,159,201,.35)}
h1 .vrml{color:var(--amber);text-shadow:0 0 26px rgba(255,178,60,.55)}
.lede{font-size:clamp(1.02rem,1.7vw,1.28rem);color:var(--muted);line-height:1.55;max-width:600px;margin-bottom:24px}
.lede b{color:var(--ice);font-weight:600}
.features{display:flex;flex-wrap:wrap;gap:10px 20px;margin-bottom:38px;font-family:var(--mono);
  font-size:.82rem;letter-spacing:.5px;color:var(--ice)}
.features span{opacity:.85}
.features span::first-letter{color:var(--amber)}

/* download panel — framed like a viewport window */
.dl-panel{border:1px solid var(--wire);border-radius:10px;background:linear-gradient(180deg,rgba(28,18,56,.55),rgba(10,6,24,.7));
  backdrop-filter:blur(6px);padding:20px;max-width:660px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.dl-panel .bar{font-family:var(--mono);font-size:11px;letter-spacing:1px;color:var(--muted);
  display:flex;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid var(--wire);margin-bottom:16px}
.dl-panel .bar .tag{color:var(--amber)}
.actions{display:flex;gap:14px;flex-wrap:wrap}
.btn{flex:1 1 220px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:12px;
  align-items:center;padding:14px 18px;border-radius:8px;text-decoration:none;transition:.25s;position:relative}
.btn-os{grid-row:1/3;font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:1px;
  writing-mode:vertical-rl;transform:rotate(180deg);opacity:.55;text-transform:uppercase}
.btn-title{font-weight:700;font-size:1.08rem}
.btn-sub{font-family:var(--mono);font-size:.78rem;opacity:.8}
.btn-primary{background:var(--ice);color:#071018;box-shadow:0 6px 22px rgba(159,232,255,.28)}
.btn-primary:hover{background:#fff;transform:translateY(-2px);box-shadow:0 10px 30px rgba(159,232,255,.45)}
.btn-secondary{background:rgba(47,159,201,.1);color:#fff;border:1px solid rgba(159,232,255,.4)}
.btn-secondary:hover{background:rgba(47,159,201,.22);border-color:var(--ice);transform:translateY(-2px)}

.all-downloads{margin-top:16px;font-family:var(--mono)}
.all-downloads summary{cursor:pointer;color:var(--ice);font-size:.85rem;letter-spacing:.5px;list-style:none;padding:6px 2px}
.all-downloads summary::-webkit-details-marker{display:none}
.all-downloads summary:hover{color:#fff}
.all-downloads summary .tw{color:var(--amber)} .all-downloads .dim{color:var(--muted)}
.all-downloads[open] summary .tw::after{content:""}
.dl-list{list-style:none;margin-top:12px;border:1px solid var(--wire);border-radius:6px;overflow:hidden}
.dl-row a{display:grid;grid-template-columns:84px 1fr auto;gap:14px;align-items:center;padding:11px 16px;
  text-decoration:none;color:#fff;border-bottom:1px solid rgba(47,159,201,.16);transition:.2s;font-size:.86rem}
.dl-list .dl-row:last-child a{border-bottom:none}
.dl-row a:hover{background:rgba(47,159,201,.12)}
.dl-os{color:var(--ice)} .dl-kind{color:var(--muted)} .dl-size{color:#fff;opacity:.85;font-variant-numeric:tabular-nums}
.dl-checksums{display:inline-block;margin-top:12px;color:var(--cyan);font-size:.8rem;text-decoration:none;letter-spacing:.5px}
.dl-checksums:hover{color:var(--ice)}

/* powered-by */
.powered{padding:8px 34px 30px;max-width:940px}
.powered .lbl{font-family:var(--mono);font-size:12px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:18px}
.deps{display:flex;flex-wrap:wrap;gap:14px}
.deps a{font-family:var(--mono);font-size:.86rem;letter-spacing:1px;color:var(--ice);text-decoration:none;
  border:1px solid var(--wire);padding:7px 14px;border-radius:20px;transition:.2s;background:rgba(21,12,44,.4)}
.deps a:hover{color:#fff;border-color:var(--ice);box-shadow:0 0 16px rgba(47,159,201,.35)}

footer{border-top:1px solid var(--wire);padding:22px 34px;display:flex;justify-content:space-between;gap:14px;
  flex-wrap:wrap;font-family:var(--mono);font-size:12px;letter-spacing:.5px;color:var(--muted)}
footer a{color:var(--cyan);text-decoration:none} footer a:hover{color:var(--ice)}
footer .r{display:flex;gap:16px;align-items:center}

/* left object palette */
.palette{position:fixed;left:18px;top:50%;transform:translateY(-50%);z-index:1;width:104px;
  display:flex;flex-direction:column;gap:10px;pointer-events:none}
.palette .phead{font-family:var(--mono);font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;
  text-align:center;padding-bottom:2px}
.prim{border:1px solid var(--wire);border-radius:6px;background:rgba(21,12,44,.45);padding:6px 6px 3px;
  backdrop-filter:blur(4px)}
.prim svg{width:100%;height:52px}
.prim .plabel{font-family:var(--mono);font-size:9.5px;letter-spacing:.5px;color:var(--ice);text-align:center;opacity:.75;margin-top:2px}

.gizmo{position:fixed;left:26px;bottom:22px;width:78px;height:78px;z-index:1;opacity:.85}
.gizmo text{font-family:var(--mono);font-size:11px;font-weight:700}

/* motion */
@keyframes drift{0%,100%{transform:translateY(0)}50%{transform:translateY(-16px)}}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
/* spinning globe: meridians sweep and vanish as they turn edge-on (no
   leftover vertical line through the centre) */
@keyframes merspin{0%,100%{rx:50px;stroke-opacity:.9}50%{rx:6px;stroke-opacity:0}}
/* surface marker rolls across the front face, hidden while behind the globe */
@keyframes rollmark{
  0%{transform:translateX(-45px);opacity:0}
  7%{opacity:1}
  50%{transform:translateX(45px);opacity:1}
  57%{opacity:0}
  100%{transform:translateX(-45px);opacity:0}
}
@keyframes rollmarkRev{
  0%{transform:translateX(45px);opacity:0}
  7%{opacity:1}
  50%{transform:translateX(-45px);opacity:1}
  57%{opacity:0}
  100%{transform:translateX(45px);opacity:0}
}
.glb-mark{opacity:0}
@media(prefers-reduced-motion:no-preference){
  .planet.p-ring{animation:drift 11s ease-in-out infinite}
  .planet.p-mag{animation:drift 8s ease-in-out infinite}
  .planet.p-amber{animation:drift 13s ease-in-out infinite}
  .eyebrow .blink{animation:blink 1.1s steps(1) infinite}
  .mer{animation:merspin var(--gdur,11s) ease-in-out infinite}
  .glb-mark{animation:rollmark var(--gdur,11s) linear infinite}
  .glb-mark.rev{animation-name:rollmarkRev}
}

/* on wide screens, clear the fixed object-palette rail */
@media(min-width:1220px){ .hero{padding-left:150px} .powered{padding-left:150px} }

/* responsive */
@media(max-width:1219px){ .palette{display:none} }
@media(max-width:760px){
  nav{flex-wrap:wrap;gap:10px;padding:14px 18px}
  .vp-status{display:none}
  .hero{padding:44px 18px 24px} .powered{padding:30px 18px}
  .planet.p-ring{width:200px;opacity:.5} .planet.p-cyan,.planet.p-mag{opacity:.5}
  .btn{flex:1 1 100%}
  .dl-row a{grid-template-columns:64px 1fr auto;gap:8px}
  footer{flex-direction:column}
  .gizmo{display:none}
}
</style>
</head>
<body>
<div class="stars"></div>
<div class="scene">
  <div class="horizon-glow"></div>
  <div class="planet p-ring">${ringedPlanet(300)}</div>
  <div class="planet p-cyan">${spinningGlobe(112, { hue: "cyan", dur: 11 })}</div>
  <div class="planet p-mag">${spinningGlobe(62, { hue: "magenta", tilt: 32, dur: 9 })}</div>
  <div class="planet p-amber">${spinningGlobe(88, { hue: "amber", tilt: -12, rev: true, dur: 13 })}</div>
  ${gridFloor()}
</div>

<aside class="palette" aria-hidden="true">
  <div class="phead">// nodes</div>
  ${["Box", "Cone", "Sphere", "Cylinder", "Extrusion"].map(k =>
    `<div class="prim">${primitiveIcon(k)}<div class="plabel">${k}</div></div>`).join("")}
</aside>
${axisGizmo()}

<div class="wrap">
  <nav>
    <div class="brand">
      <svg viewBox="0 0 512 512" stroke-linejoin="miter" stroke-linecap="square" aria-label="WRL Forge">
        <polyline points="70,160 105,360 150,250 195,360 230,160" stroke-width="40" fill="none" stroke="#9fe8ff"/>
        <polyline points="255,160 255,360" stroke-width="40" fill="none" stroke="#9fe8ff"/>
        <polyline points="255,160 315,160 325,195 255,205" stroke-width="34" fill="none" stroke="#9fe8ff"/>
        <polyline points="272,205 335,360" stroke-width="36" fill="none" stroke="#9fe8ff"/>
        <polyline points="365,160 365,360 440,360" stroke-width="40" fill="none" stroke="#ffb23c"/>
      </svg>
      <span class="mark"><b>FORGE</b></span>
    </div>
    <div class="nav-links">
      <a href="https://cybertownrevival.com" target="_blank" rel="noopener">Cybertown</a>
      <a href="https://github.com/DJAscendance/wrlforge" target="_blank" rel="noopener">App Repository</a>
      <a href="https://opensource.org/osd" target="_blank" rel="noopener">Open Source</a>
    </div>
    <div class="vp-status">
      <span class="chip on">WALK</span><span class="chip">EXAMINE</span><span class="chip">FLY</span>
      <span>│</span><span class="chip">${version}</span>
    </div>
  </nav>

  <main class="hero">
    <span class="eyebrow"><b>#VRML V2.0 utf8</b> <span class="blink">▮</span></span>
    <h1>Build your own <span class="vrml">reality</span>.</h1>
    <p class="lede">
      The markdown editor for the 3D web that time forgot. Hand-write <b>VRML</b>,
      watch it render live, validate every node, and package worlds for <b>Cybertown</b>
      that actually load — offline, no upload, no nonsense.
    </p>
    <div class="features">
      <span>◈ live 3D preview</span><span>◈ syntax &amp; validation</span><span>◈ one-click packaging</span>
    </div>

    <div class="dl-panel">
      <div class="bar"><span>DOWNLOAD // ${version}</span><span class="tag">${chan}</span></div>
      <div class="actions">
        ${heroButton(model.heroWindows, "WIN", "Download for Windows", "btn-primary")}
        ${heroButton(model.heroLinux, "LNX", "Download for Linux", "btn-secondary")}
      </div>
      ${downloadsList(model)}
    </div>
  </main>

  <section class="powered">
    <div class="lbl">Open Source Tech ↘</div>
    <div class="deps">
      <a href="https://create3000.github.io/x_ite/" target="_blank" rel="noopener">X_ITE</a>
      <a href="https://vscodium.com" target="_blank" rel="noopener">VSCodium</a>
      <a href="https://codemirror.net" target="_blank" rel="noopener">CodeMirror</a>
      <a href="https://www.electronjs.org" target="_blank" rel="noopener">Electron</a>
      <a href="https://nodejs.org" target="_blank" rel="noopener">Node.js</a>
    </div>
  </section>

  <footer>
    <div>MIT-licensed on GitHub · Created by Ryan Bundy</div>
    <div class="r"><span>${version} · ${chan}</span><a href="https://skate.fm" target="_blank" rel="noopener">Powered by Skate.FM</a></div>
  </footer>
</div>
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
