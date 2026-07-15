// WRL Forge marketing site — Cloudflare Worker.
// Renders the landing page server-side and resolves the newest GitHub release
// (prereleases INCLUDED — the product currently ships beta prereleases, which
// the /releases/latest endpoint deliberately hides).

const REPO = "DJAscendance/wrlforge";
const RELEASES_PAGE = "https://github.com/DJAscendance/wrlforge/releases";

// ---- helpers ---------------------------------------------------------------

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  if (mb >= 100) return Math.round(mb) + " MB";
  return mb.toFixed(1) + " MB";
}

// Classify a release asset by filename into platform + human-friendly kind.
// Order of the checks matters (portable before plain exe, etc.).
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

// Resolve the newest usable release and build a normalized download model.
async function resolveReleaseModel() {
  const model = {
    version: "latest",
    releaseUrl: RELEASES_PAGE + "/latest",
    prerelease: false,
    assets: [],          // classified, non-checksum assets
    checksumsUrl: null,
    heroWindows: null,   // preferred Windows pick
    heroLinux: null,     // preferred Linux pick
  };

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=15`, {
      headers: { "User-Agent": "WRLForge-Site-Worker", "Accept": "application/vnd.github+json" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!res.ok) return model;

    const releases = await res.json();
    // Newest non-draft release (prereleases allowed). API returns newest-first.
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

    // Hero picks: NSIS Setup for Windows, AppImage for Linux (best "just works").
    const byKind = (arr, kinds) => kinds.map(k => arr.find(a => a.kind === k)).find(Boolean);
    const win = model.assets.filter(a => a.platform === "windows");
    const lin = model.assets.filter(a => a.platform === "linux");
    model.heroWindows = byKind(win, ["Installer (Setup)", "MSI installer", "Portable (exe)", "Portable (zip)"]) || win[0] || null;
    model.heroLinux   = byKind(lin, ["AppImage", "Portable (tar.gz)", "Debian package"]) || lin[0] || null;

    // Stable display order for the full list: Windows first, then Linux.
    const order = { windows: 0, linux: 1 };
    model.assets.sort((a, b) => (order[a.platform] - order[b.platform]) || a.name.localeCompare(b.name));
  } catch (e) {
    // Silent fallback to the defaults above (release page link still works).
  }

  return model;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ---- rendering -------------------------------------------------------------

function heroButton(asset, label, cls) {
  if (!asset) {
    return `<a href="${RELEASES_PAGE}" class="btn ${cls}">
              <span class="btn-title">${esc(label)}</span>
              <span class="btn-subtitle">see all releases</span>
            </a>`;
  }
  return `<a href="${esc(asset.url)}" class="btn ${cls}">
            <span class="btn-title">${esc(label)}</span>
            <span class="btn-subtitle">${esc(asset.kind)} &bull; ${esc(asset.sizeLabel)}</span>
          </a>`;
}

function downloadsList(model) {
  if (!model.assets.length) return "";
  const rows = model.assets.map(a => `
    <li class="dl-row">
      <a href="${esc(a.url)}">
        <span class="dl-os">${esc(a.os)}</span>
        <span class="dl-kind">${esc(a.kind)}</span>
        <span class="dl-size">${esc(a.sizeLabel)}</span>
      </a>
    </li>`).join("");
  const checksums = model.checksumsUrl
    ? `<a class="dl-checksums" href="${esc(model.checksumsUrl)}">SHA-256 checksums ↗</a>` : "";
  return `
    <details class="all-downloads">
      <summary>All downloads &amp; file sizes (${model.assets.length})</summary>
      <ul class="dl-list">${rows}</ul>
      ${checksums}
    </details>`;
}

function renderPage(model) {
  const version = esc(model.version);
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WRL Forge - Build. Preview. Validate. Package.</title>

    <!-- Site Favicon (Transparent Cyan SVG Logo) -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNTEyIDUxMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBzaGFwZS1yZW5kZXJpbmc9ImNyaXNwRWRnZXMiPgogIDwhLS0gZmxhdCBiYW5kZWQgdmlvbGV0IGJhY2tncm91bmQsIG5vIHNtb290aCBncmFkaWVudHMgLS0+CgogIDwhLS0gZ3JvdW5kIHNoYWRvdzogaGFyZCBmbGF0IHNpbGhvdWV0dGUsIG5vIGJsdXIgLS0+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTAsMTIpIiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiMwNTAzMDkiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iNDAiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSI0MCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzNCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM2Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSI0MCIvPgogIDwvZz4KCiAgPCEtLSBleHRydXNpb24gYmFzZSAoc2hhZG93IGZhY2UsIG9mZnNldCBkb3duLXJpZ2h0KSAtLT4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg5LDkpIiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiMxMzQwNWMiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iMzgiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzMiIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM0Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogIDwvZz4KCiAgPCEtLSBtYWluIGZhY2UgKG1pZCBhbWJlciwgbm8gb2Zmc2V0KSAtLT4KICA8ZyBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiMyZjlmYzkiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iMzgiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzMiIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM0Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogIDwvZz4KCiAgPCEtLSB0b3AgYmV2ZWwgKGhpZ2hsaWdodCBmYWNlLCBvZmZzZXQgdXAtbGVmdCkgLS0+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTcsLTgpIiBzdHJva2UtbGluZWpvaW49Im1pdGVyIiBzdHJva2UtbGluZWNhcD0ic3F1YXJlIiBmaWxsPSJub25lIiBzdHJva2U9IiM5ZmU4ZmYiPgogICAgPHBvbHlsaW5lIHBvaW50cz0iNzAsMTYwIDEwNSwzNjAgMTUwLDI1MCAxOTUsMzYwIDIzMCwxNjAiIHN0cm9rZS13aWR0aD0iMzgiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjI1NSwxNjAgMjU1LDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAzMTUsMTYwIDMyNSwxOTUgMjU1LDIwNSIgc3Ryb2tlLXdpZHRoPSIzMiIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjcyLDIwNSAzMzUsMzYwIiBzdHJva2Utd2lkdGg9IjM0Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIzNjUsMTYwIDM2NSwzNjAgNDQwLDM2MCIgc3Ryb2tlLXdpZHRoPSIzOCIvPgogIDwvZz4KCiAgPCEtLSBoYXJkIHNwZWN1bGFyIGJldmVsIGVkZ2UsIHRoaW4gYnJpZ2h0IGxpbmUsIHNhbWUgb2Zmc2V0IGFzIHRvcCBmYWNlIC0tPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC03LC04KSIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIgc3Ryb2tlLWxpbmVjYXA9InNxdWFyZSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjQiIG9wYWNpdHk9IjAuOSI+CiAgICA8cG9seWxpbmUgcG9pbnRzPSI3MCwxNjAgMTA1LDM2MCAxNTAsMjUwIDE5NSwzNjAgMjMwLDE2MCIvPgogICAgPHBvbHlsaW5lIHBvaW50cz0iMjU1LDE2MCAyNTUsMzYwIi8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIyNTUsMTYwIDMxNSwxNjAgMzI1LDE5NSAyNTUsMjA1Ii8+CiAgICA8cG9seWxpbmUgcG9pbnRzPSIyNzIsMjA1IDMzNSwzNjAiLz4KICAgIDxwb2x5bGluZSBwb2ludHM9IjM2NSwxNjAgMzY1LDM2MCA0NDAsMzYwIi8+CiAgPC9nPgoKICA8IS0tIGN5YW4gVlJNTCB2ZXJ0ZXggbm9kZXMgYXQgc3RydWN0dXJhbCBqb2ludHMgLS0+CiAgPGcgZmlsbD0iI2ZmYjIzYyIgc3Ryb2tlPSIjMDUwMzA5IiBzdHJva2Utd2lkdGg9IjEuNSI+CiAgICA8cG9seWdvbiBwb2ludHM9IjcwLDE2OCA3OCwxNzYgNzAsMTg0IDYyLDE3NiIvPgogICAgPHBvbHlnb24gcG9pbnRzPSIyMzAsMTY4IDIzOCwxNzYgMjMwLDE4NCAyMjIsMTc2Ii8+CiAgICA8cG9seWdvbiBwb2ludHM9IjE1MCwyNTggMTU4LDI2NiAxNTAsMjc0IDE0MiwyNjYiLz4KICAgIDxwb2x5Z29uIHBvaW50cz0iMjU1LDE2OCAyNjMsMTc2IDI1NSwxODQgMjQ3LDE3NiIvPgogICAgPHBvbHlnb24gcG9pbnRzPSIzNjUsMTY4IDM3MywxNzYgMzY1LDE4NCAzNTcsMTc2Ii8+CiAgPC9nPgogIDxnIGZpbGw9IiNlYWZlZmYiPgogICAgPGNpcmNsZSBjeD0iNzAiIGN5PSIxNjgiIHI9IjIuMiIvPgogICAgPGNpcmNsZSBjeD0iMjMwIiBjeT0iMTY4IiByPSIyLjIiLz4KICAgIDxjaXJjbGUgY3g9IjE1MCIgY3k9IjI1OCIgcj0iMi4yIi8+CiAgICA8Y2lyY2xlIGN4PSIyNTUiIGN5PSIxNjgiIHI9IjIuMiIvPgogICAgPGNpcmNsZSBjeD0iMzY1IiBjeT0iMTY4IiByPSIyLjIiLz4KICA8L2c+CgogIDwhLS0gc21hbGwgdGlnaHQgY2FwdGlvbiAtLT4KICA8dGV4dCB4PSI0MzAiIHk9IjQ0MCIgZm9udC1mYW1pbHk9IlJvYm90bywgQXJpYWwsIEhlbHZldGljYSwgc2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjcwMCIKICAgICAgICBmb250LXNpemU9IjI0IiBsZXR0ZXItc3BhY2luZz0iNiIgZmlsbD0iI2ZmYjIzYyIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEiIHRleHQtYW5jaG9yPSJlbmQiPkZPUkdFPC90ZXh0Pgo8L3N2Zz4K">

    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="WRL Forge">
    <meta property="og:description" content="Build. Preview. Validate. Package. Welcome to the 3D platform builders love.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://wrlforge.com">
    <meta property="og:image" content="https://raw.githubusercontent.com/DJAscendance/wrlforge/main/assets/generated/icons/runtime/icon.png">

    <!-- Twitter Meta Tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta property="twitter:domain" content="wrlforge.com">
    <meta property="twitter:url" content="https://wrlforge.com">
    <meta name="twitter:title" content="WRL Forge">
    <meta name="twitter:description" content="Build. Preview. Validate. Package. Welcome to the 3D platform builders love.">
    <meta name="twitter:image" content="https://raw.githubusercontent.com/DJAscendance/wrlforge/main/assets/generated/icons/runtime/icon.png">
    <style>
        :root {
            --bg-dark: #0a0618;
            --text-main: #ffffff;
            --text-muted: #8b949e;
            --cyan: #2f9fc9;
            --cyan-light: #9fe8ff;
            --purple-dark: #150c2c;
            --purple-light: #1c1238;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        body {
            background-color: var(--bg-dark);
            color: var(--text-main);
            overflow-x: hidden;
            position: relative;
            min-height: 100vh;
        }

        .stars {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            z-index: -2;
            background-image:
                radial-gradient(1px 1px at 10% 10%, #fff 100%, transparent),
                radial-gradient(1.5px 1.5px at 20% 30%, #fff 100%, transparent),
                radial-gradient(2px 2px at 30% 60%, rgba(255,255,255,0.8) 100%, transparent),
                radial-gradient(1px 1px at 40% 80%, #fff 100%, transparent),
                radial-gradient(2px 2px at 50% 20%, rgba(255,255,255,0.9) 100%, transparent),
                radial-gradient(1px 1px at 60% 40%, #fff 100%, transparent),
                radial-gradient(1.5px 1.5px at 70% 70%, #fff 100%, transparent),
                radial-gradient(2px 2px at 80% 30%, rgba(255,255,255,0.7) 100%, transparent),
                radial-gradient(1px 1px at 90% 90%, #fff 100%, transparent);
            background-size: 300px 300px;
            opacity: 0.4;
            pointer-events: none;
        }

        .planet-arc {
            position: absolute;
            top: -45vw; right: -25vw;
            width: 100vw; height: 100vw;
            border-radius: 50%;
            box-shadow:
                inset 10px -20px 80px rgba(47, 159, 201, 1),
                inset 20px -40px 150px rgba(159, 232, 255, 0.5),
                0 0 120px rgba(47, 159, 201, 0.8),
                0 0 250px rgba(28, 18, 56, 0.8);
            background: linear-gradient(135deg, var(--purple-dark), var(--bg-dark));
            border: 2px solid rgba(159, 232, 255, 0.6);
            z-index: -1;
            transform: rotate(-15deg);
        }

        nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px 40px;
            z-index: 10;
            position: relative;
        }
        .nav-left { display: flex; align-items: center; gap: 32px; }
        .nav-left svg { width: 40px; height: 40px; }
        .nav-links { display: flex; gap: 24px; font-weight: 600; font-size: 16px; }
        .nav-links a { color: var(--text-main); text-decoration: none; transition: color 0.2s; }
        .nav-links a:hover { color: var(--cyan-light); }

        .hero {
            position: relative;
            padding: 100px 40px 120px 120px;
            max-width: 1200px;
            margin: 0 auto;
            z-index: 1;
        }
        .hero h1 {
            font-size: 6rem; font-weight: 800; line-height: 1.05;
            margin-bottom: 24px; letter-spacing: -0.04em;
        }
        .hero p {
            font-size: 1.75rem; color: var(--text-muted); line-height: 1.4;
            max-width: 800px; margin-bottom: 48px; font-weight: 400;
        }

        .actions { display: flex; gap: 20px; margin-bottom: 24px; }
        .btn {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 16px 36px; border-radius: 8px; text-decoration: none;
            transition: all 0.3s ease; position: relative; overflow: hidden; text-align: center;
        }
        .btn-title { font-weight: 700; font-size: 1.2rem; margin-bottom: 4px; }
        .btn-subtitle { font-size: 0.85rem; opacity: 0.8; font-weight: 500; }
        .btn-primary { background-color: var(--text-main); color: var(--bg-dark); box-shadow: 0 4px 15px rgba(255,255,255,0.2); }
        .btn-primary:hover { background-color: var(--cyan-light); transform: translateY(-2px); box-shadow: 0 8px 25px rgba(159, 232, 255, 0.4); }
        .btn-secondary { background-color: rgba(28, 18, 56, 0.5); color: var(--text-main); border: 1px solid rgba(255,255,255,0.3); backdrop-filter: blur(10px); }
        .btn-secondary:hover { border-color: var(--cyan-light); background-color: rgba(47, 159, 201, 0.2); transform: translateY(-2px); }

        /* All downloads + file sizes */
        .all-downloads { max-width: 640px; margin-bottom: 90px; }
        .all-downloads summary {
            cursor: pointer; color: var(--cyan-light); font-weight: 600; font-size: 0.95rem;
            padding: 8px 0; user-select: none;
        }
        .all-downloads summary:hover { color: #fff; }
        .dl-list { list-style: none; margin-top: 12px; border: 1px solid rgba(47,159,201,0.3); border-radius: 8px; overflow: hidden; }
        .dl-row a {
            display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 16px;
            padding: 12px 18px; text-decoration: none; color: var(--text-main);
            border-bottom: 1px solid rgba(47,159,201,0.15); transition: background 0.2s;
        }
        .dl-list .dl-row:last-child a { border-bottom: none; }
        .dl-row a:hover { background: rgba(47,159,201,0.12); }
        .dl-os { color: var(--cyan-light); font-weight: 600; font-size: 0.85rem; }
        .dl-kind { color: var(--text-muted); font-size: 0.95rem; }
        .dl-size { color: var(--text-main); font-variant-numeric: tabular-nums; font-size: 0.9rem; opacity: 0.85; }
        .dl-checksums { display: inline-block; margin-top: 12px; color: var(--cyan); font-size: 0.85rem; text-decoration: none; }
        .dl-checksums:hover { color: var(--cyan-light); }

        .dependencies { padding-top: 26px; }
        .dependencies p { font-size: 1.1rem; color: var(--text-muted); margin-bottom: 32px; display: flex; align-items: center; gap: 8px; }
        .dep-logos { display: flex; align-items: center; gap: 60px; flex-wrap: wrap; opacity: 0.8; }
        .dep-logos span { font-size: 1.8rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 12px; transition: all 0.3s; cursor: default; }
        .dep-logos span:hover { opacity: 1; color: var(--cyan-light); transform: scale(1.05); }

        .bg-line { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
        .forge-logo { fill: var(--text-main); }
        .logo-xite { font-family: monospace; letter-spacing: -2px; font-weight: 900; }
        .logo-vscodium { font-family: "Segoe UI", sans-serif; font-weight: 400; letter-spacing: 2px; }
        .logo-codemirror { font-family: Georgia, serif; font-style: italic; font-weight: bold; }
        .logo-electron { font-family: Arial, Helvetica, sans-serif; font-weight: 900; letter-spacing: 1px; }
        .logo-node { font-family: "Courier New", Courier, monospace; font-weight: 600; }

        .footer {
            margin-top: 60px; padding-bottom: 40px; color: rgba(255, 255, 255, 0.4);
            font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center;
        }
        .footer a { color: var(--cyan); text-decoration: none; font-weight: 600; transition: color 0.2s; }
        .footer a:hover { color: var(--cyan-light); }

        @media (max-width: 768px) {
            .hero { padding: 60px 20px 80px 40px; }
            .hero h1 { font-size: 3.5rem; }
            .hero p { font-size: 1.25rem; }
            .actions { flex-direction: column; }
            .dl-row a { grid-template-columns: 70px 1fr auto; gap: 10px; }
            .planet-arc { right: -50vw; top: -30vw; width: 150vw; height: 150vw; }
            .footer { flex-direction: column; gap: 8px; }
        }
    </style>
</head>
<body>
    <div class="stars"></div>
    <div class="planet-arc"></div>

    <svg class="bg-line" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#9fe8ff" stop-opacity="0.1"/>
                <stop offset="20%" stop-color="#9fe8ff" stop-opacity="1"/>
                <stop offset="50%" stop-color="#2f9fc9" stop-opacity="1"/>
                <stop offset="100%" stop-color="#1c1238" stop-opacity="0"/>
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <path d="M 1200, -100 Q 600, 100 80, 200 L 80, 2000" fill="none" stroke="url(#lineGrad)" stroke-width="4" filter="url(#glow)" />
        <circle cx="80" cy="200" r="5" fill="#fff" filter="url(#glow)"/>
        <circle cx="80" cy="500" r="5" fill="#fff" filter="url(#glow)"/>
        <g transform="translate(65, 300)" filter="url(#glow)">
            <circle cx="15" cy="15" r="15" fill="#150c2c" stroke="#2f9fc9" stroke-width="2"/>
            <polyline points="10,10 5,15 10,20" fill="none" stroke="#9fe8ff" stroke-width="2"/>
            <polyline points="20,10 25,15 20,20" fill="none" stroke="#9fe8ff" stroke-width="2"/>
        </g>
    </svg>

    <div style="position: relative; max-width: 1400px; margin: 0 auto;">
        <nav>
            <div class="nav-left">
                <svg viewBox="0 0 512 512" class="forge-logo" stroke-linejoin="miter" stroke-linecap="square">
                    <polyline points="70,160 105,360 150,250 195,360 230,160" stroke-width="40" fill="none" stroke="currentColor"/>
                    <polyline points="255,160 255,360" stroke-width="40" fill="none" stroke="currentColor"/>
                    <polyline points="255,160 315,160 325,195 255,205" stroke-width="34" fill="none" stroke="currentColor"/>
                    <polyline points="272,205 335,360" stroke-width="36" fill="none" stroke="currentColor"/>
                    <polyline points="365,160 365,360 440,360" stroke-width="40" fill="none" stroke="currentColor"/>
                </svg>
                <div class="nav-links">
                    <a href="https://cybertownrevival.com" target="_blank" rel="noopener">Cybertown Revival</a>
                    <a href="https://github.com/DJAscendance/wrlforge#readme" target="_blank" rel="noopener">Product</a>
                    <a href="https://github.com/DJAscendance/wrlforge" target="_blank" rel="noopener">Open Source</a>
                </div>
            </div>
        </nav>

        <main class="hero">
            <h1>Let’s build VRML from here</h1>
            <p>
                Harnessed for Cybertown productivity. Designed for validation.
                Celebrated for built-in correctness. Welcome to the 3D platform builders love.
            </p>

            <div class="actions">
                ${heroButton(model.heroWindows, "Download for Windows", "btn-primary")}
                ${heroButton(model.heroLinux, "Download for Linux", "btn-secondary")}
            </div>

            ${downloadsList(model)}

            <div class="dependencies">
                <p>Powered by open source technologies <span style="font-size: 1.2rem; margin-left: 5px;">↘</span></p>
                <div class="dep-logos">
                    <span class="logo-xite">X_ITE</span>
                    <span class="logo-vscodium">VSCodium</span>
                    <span class="logo-codemirror">CodeMirror</span>
                    <span class="logo-electron">Electron</span>
                    <span class="logo-node">Node.js</span>
                </div>
            </div>

            <div class="footer">
                <div>Open Source on GitHub (MIT License) &bull; Created by Ryan Bundy &bull; ${version}</div>
                <div>Powered by <a href="https://skate.fm" target="_blank" rel="noopener">Skate.FM</a></div>
            </div>
        </main>
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
