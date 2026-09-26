# WRL Forge site — session handoff (updated 2026-09-26)

Working notes so the next session resumes **exactly** here. Owner: Ryan Bundy
(aka **BassMekanik2000**). Owner works in staged phases and wants a STOP +
report + GO/NO-GO between phases — don't run multiple phases uninterrupted.

## TL;DR — current state

The marketing site (this repo) is **redesigned, deployed, and LIVE at
wrlforge.com** (Phases 1, 2, 3 and 3.5 all done and deployed).

**Repo truth:**

- Repository: `Ascendance3D/wrlforge-site` — **public** since 2026-07-16.
- Remote: `origin` → https://github.com/Ascendance3D/wrlforge-site.git
- Default branch: **`master`**; `origin/master` tracking.
- No secrets in the repo (the Cloudflare token stays in the shell env).

**Licensing truth (see "License situation" below — this changed):** both the
product and this site are now **`GPL-3.0-or-later`**. The July 2026 MIT
transition is **complete and superseded**.

**Open work:**

1. **Acknowledgements + Remembrance page** — owner has ~20–30 people to thank
   plus a remembrance section. Blocked on the owner supplying names and
   remembrance content; shape is sketched in `followup.md` §3. LSS is already
   credited in the footer with a link to
   https://lss3d.silver-hosting.com/index.php?op=worlds .
2. **Dead `wireGlobe()`** in `worker.js` — safe to delete on the next edit.

`followup.md` is **historical only** and carries a superseded banner; do not
follow its MIT instructions.

## What's live now (Phases 1 & 2)

- **Repo**: this one — `/home/ryan/Projects/cybertown/wrlforge-site` (separate
  from the product repo; promoted out of the product repo's untracked `site/`).
  Public on GitHub as `Ascendance3D/wrlforge-site`, `origin/master` tracking.
- **Phase 1**: fixed the broken downloads. The Worker used `/releases/latest`
  which 404s because `v1.3.0-beta.2` is a **prerelease**; every download button
  was 404ing. Now queries `/releases?per_page=15` and takes the newest
  non-draft. File sizes + checksums come live from the GitHub API.
- **Phase 2**: retro-1997 "VRML browser" redesign — pure inline SVG/CSS, no CDN.
  Hero "Build your own reality.", `#VRML V2.0 utf8` eyebrow, markdown-editor
  lede + feature chips, three spinning wireframe globes (cyan upright / magenta
  32° tilt / amber -12° reversed), a two-ring low-poly faceted ring-planet,
  receding wireframe grid floor, left VRML-node object palette, RGB axis gizmo,
  viewport toolbar (WALK/EXAMINE/FLY + version). Single screen, responsive
  (palette hides <1220px), `prefers-reduced-motion` respected.
- **Content/links done per owner**: brand is `[logo] FORGE` (WRL text removed —
  the logo is the WRL mark). Nav: Cybertown→cybertownrevival.com,
  **App Repository**→the GH repo, **Open Source**→opensource.org/osd. Deps
  section relabeled **"Open Source Tech"**; the five chips now link out
  (X_ITE→create3000.github.io/x_ite, VSCodium, CodeMirror, Electron, Node.js).
  Footer: `© 2026 WRL Forge · by Ryan Bundy (aka BassMekanik2000)`.

- **Phase 3 (1.4.0 prep)**: three-platform downloads. WRL Forge 1.4.0 adds macOS
  artifacts (`.dmg` + `-mac-arm64.zip`), and the old classifier treated **any**
  `.zip` as Windows — so the Mac ZIP would have shipped mislabelled. Fixed in
  `classifyAsset()` by matching `.dmg` and Mac-tagged `.zip` **before** the
  generic Windows `.zip` rule. `resolveReleaseModel()` gained `heroMac` and
  includes `mac` in `model.assets`; display order is `windows, mac, linux`.
  The hero panel now shows three platform buttons (Windows / macOS / Linux) and
  every download row carries its OS mark. Checksum handling and prerelease
  support are unchanged. When a release has no Mac asset (e.g. `v1.3.0-beta.5`)
  the macOS button degrades to "see all releases" rather than disappearing.

## OS icons (`public/os-icons/`)

Copied byte-for-byte from the **product** repo `assets/os-icons/` — that is the
approved source; do not edit the copies here, re-copy instead. Nine files:
`icons8-windows-11-{30,60,90}.png`, `icons8-mac-client-{30,60,90}.png`,
`icons8-linux-{30,60,90}.png`. Served as static assets at `/os-icons/...`
(no CDN), wired through `srcset` (30 = 1x, 60 = 2x, 90 = 3x).

They are **solid black glyphs**. That reads fine on the ice-coloured primary
button but is invisible on the dark secondary buttons and download rows, so
those are inverted in CSS (`filter:invert(1)`) rather than by editing the PNGs —
the bytes stay identical to the product copies.

Accessibility: icons are decorative (`alt=""`, `aria-hidden="true"`); the
platform name is always rendered as adjacent text, so an icon is never the only
platform indicator.

## License situation (important, don't get this wrong)

**Current, as of 2026-08-29 — this supersedes everything earlier:**

- The **product** `Ascendance3D/wrlforge` is **`GPL-3.0-or-later`** as of commit
  `2eb7c39e7ffd6b830155c4ee3d9b2dc8cb6aab1d`
  ("chore: relicense WRLForge under GPL-3.0-or-later").
- **This site's own code is `GPL-3.0-or-later` too** (lane OSS-2). `LICENSE` is
  the canonical, unmodified GPLv3 text; the "or later" election is stated in
  `README.md` and `NOTICE`, never inside the license text itself.
- **Third-party components keep their own licenses.** The vendored X_ITE runtime
  (v15.1.10) is MIT; its bundled fonts are Apache-2.0 / OFL-1.1 / Ubuntu Font
  Licence, each with its license file retained beside it. Never relabel these as
  GPL, and never delete their notices. Full inventory is in `NOTICE`.
- **LSS's featured artwork is NOT GPL and never becomes GPL.** `public/harley.wrl`
  and `public/hog1.jpg` are "the Red Raven" © 2003 LSS, used with her permission
  for **display on wrlforge.com only** — no reuse, redistribution, or
  modification. `public/hero-harley.wrl` is our own wrapper (GPL) that `Inline`s
  her model; wrapping does not relicense it. Her footer credit and link must stay
  visible. See `NOTICE` §2 for the exact terms.
- **Contribution posture:** `GPL-3.0-or-later`, contributors keep copyright,
  **no CLA, no copyright assignment**, DCO sign-off via `git commit -s`. See
  `CONTRIBUTING.md`.
- The "Open Source Tech" chips are fine — those *dependencies* genuinely are OSS;
  that's the tech it's built ON, not the product's own license.

### Historical (do NOT act on)
The July 2026 MIT transition (product PR #1, then the site's MIT `LICENSE`,
`NOTICE`, and `MIT ©` footer) is **complete and superseded** by the GPL decision
above. `followup.md` still describes it and carries a superseded banner. If you
find a document telling you to flip anything to MIT, it is stale.

## Phase 3 — live X_ITE scene (DONE + DEPLOYED 2026-07-15)

The hero now renders **LSS's "HOG!" motorbike** (2003 Cybertown item, ~170 KB
`.wrl` + `hog1.jpg` texture) live in X_ITE — transparent, slow turntable spin,
top-right in the old ring-planet slot. SVG ring-planet remains the fallback.

**Licensing**: model is LSS's, **used with her explicit permission** (she sent
the files directly to owner). Credited in the footer with a link to her worlds
site. Do NOT reuse other scraped Cybertown items without similar permission.

**How it's wired (`public/`, served via Workers Static Assets):**
- `wrangler.toml` has `[assets] directory="./public"`, `html_handling="none"`,
  `not_found_handling="none"` → exact-file matches serve as assets, everything
  else (incl. `/`) falls through to the Worker. Verified locally.
- `worker.js`: `#xite-host` slot next to `#ring-fallback`; an inline boot script
  lazy-loads `/x_ite.min.js` on `requestIdleCallback`, then mounts
  `<x3d-canvas src="/hero-harley.wrl">`. On the canvas `load` event it adds
  `body.xite-on` (CSS hides the SVG, shows the canvas). Guards: skips on
  `prefers-reduced-motion`, `innerWidth < 900`, or no WebGL → SVG stays.
- `public/hero-harley.wrl` — wrapper that `Inline`s `harley.wrl`, adds a
  transparent `Background { transparency 1 }`, key/fill `DirectionalLight`s, a
  framing `Viewpoint { position 0 0 3.9 }`, and a `TimeSensor`+
  `OrientationInterpolator`+ROUTE Y-spin. A re-centering `Transform
  { translation 1.6052 1.0778 0 }` puts the model's bbox center on the origin so
  the spin doesn't swing (measured via X_ITE `getBBox`, center was
  (-1.6052,-1.0778,0.06)). LSS's `harley.wrl` is untouched except its opaque
  gray `Background` node was removed (so the canvas can be transparent).

**GOTCHAS (important):**
- **X_ITE `dist/x_ite.min.js` is NOT self-contained.** It lazily `import()`s
  component chunks from a sibling `assets/` dir AND loads `x_ite.css` (shadow
  DOM). You MUST vendor all three: `x_ite.min.js` + `x_ite.css` +
  `assets/` (we pruned the unminified `.js` twins; ~8.8 MB, 96 files). Missing
  `x_ite.css` → the internal canvas collapses to 1×1 and renders nothing.
- **The `<canvas>` is inside `x3d-canvas.shadowRoot`** — `document.querySelector('x3d-canvas canvas')` finds nothing; use the shadow root.
- **Chrome caches 404s.** While iterating I loaded the page before vendoring the
  assets; Chrome then served the cached 404 for `x_ite.css` even after the file
  existed. A **hard reload (Ctrl+Shift+R)** fixed it. Not a production concern
  (fresh visitors), but bites during local dev — hard-reload after adding assets.
- X_ITE with no `Background` clears to **opaque black**, not transparent — you
  need `Background { transparency 1 }` for a see-through canvas.
- Math/bbox: `x3d-canvas.browser.currentScene.getNamedNode('Spin')` → reach the
  internal node via its symbol props → `getBBox(new window.X3D.Box3())`.
- **Reference**: the product renders X_ITE-only; see product repo
  `renderer/preview.js` / `renderer/world-preview.js` and `docs/PREVIEW_ARCHITECTURE.md`.

## Deploy runbook + gotchas

- **Local preview**: `npx wrangler dev --port 8788` (from this repo). There is
  no `package.json` — `npx` fetches wrangler on demand (verified on 4.127.1).
- **Deploy**: `npx wrangler deploy`. Auth = `CLOUDFLARE_API_TOKEN` env
  (account "Ascendance Productions"). `account_id` is pinned in `wrangler.toml`
  (`a3fb626872474ce6d6d3a55829a760e7`) — **required**, else deploy 400s on
  `/memberships` with the account-scoped token.
- **Cache gotcha**: the page sets `Cache-Control: max-age=300`. After a deploy,
  edge POPs serve stale HTML for up to ~5 min AND inconsistently across POPs —
  **verify with a single fresh `?cb=<unique>` curl**, not repeated hits to the
  same URL (separate curls land on different POPs). Confirmed live via browser
  screenshot each time.

## File map (`worker.js` — single source; there is no index.html)

- Release data layer: `formatBytes`, `classifyAsset`, `resolveReleaseModel`
  (prerelease-aware), `esc`.
- Scene generators (pure SVG): `spinningGlobe(px, {hue,tilt,rev,dur})`,
  `ringedPlanet(px)` (2-ring alternating-facet gem), `gridFloor()`,
  `primitiveIcon(kind)`, `axisGizmo()`. NOTE: `wireGlobe()` is now **dead code**
  (all globes use `spinningGlobe`) — safe to delete on next edit.
- Download UI: `osIcon(platform, px, cls)` (+ the `OS_ICONS` stem map),
  `heroButton(asset, platform, os, label, cls)`, `downloadsList`. Page:
  `renderPage`. Entry: default `fetch` handler.
- Hero buttons are content-sized (`flex:1 1 auto`) and sit three-across above
  900px; `@media(max-width:900px)` stacks them full width, so the row never
  degrades into a 2 + 1 orphan at tablet widths.
- CSS is one inline `<style>`; motion is gated in
  `@media(prefers-reduced-motion:no-preference)`. Globe spin = `merspin`
  keyframe (meridians fade to 0 opacity edge-on so there's no centre line) +
  `rollmark`/`rollmarkRev` surface marker.

## Open flags (not blocking; surface to owner)
- Product git history has commit-author email `ascendance@skate.fm` in the
  public repo (noted in prior sessions; history rewrite is prohibited — separate
  decision).
- `spikes/xite-mall-fit/package.json` in the product repo: was left `UNLICENSED`
  during the MIT lane; the GPL relicense commit `2eb7c39e` touched it — check
  there, not here, if it matters.
- Two **pre-existing** console errors on the landing page (baseline, unrelated to
  licensing): `<line> attribute x1/x2: Expected length, "20,18"` from a generated
  SVG in `worker.js`. Present before and after OSS-2; not fixed in that lane.
