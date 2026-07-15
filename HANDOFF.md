# WRL Forge site — session handoff (2026-07-15)

Working notes so the next session resumes **exactly** here. Owner: Ryan Bundy
(aka **BassMekanik2000**). Owner works in staged phases and wants a STOP +
report + GO/NO-GO between phases — don't run multiple phases uninterrupted.

## TL;DR — resume point

The marketing site (this repo) is **redesigned, deployed, and LIVE at
wrlforge.com** (Phases 1 & 2 done). Remaining work, **in this order**:

1. **[PENDING MERGE] MIT relicense of the *product* repo** — PR is open:
   https://github.com/DJAscendance/wrlforge/pull/1 . When it merges, do the
   one small site follow-up in "Post-merge" below (flip footer copy to MIT).
2. **[DONE] Phase 3 — live X_ITE scene** in the hero: LSS's "HOG!" motorbike
   (`.wrl`, used with her permission) rendered live by X_ITE, transparent,
   turntable-spinning, top-right where the ring-planet was. See "Phase 3" below.
   Built + verified locally; **NOT yet deployed** (awaiting owner deploy GO).
3. **Phase 3.5 — create a GitHub remote** for THIS site repo (needs owner GO;
   outward-facing). Suggested name `DJAscendance/wrlforge-site`.
4. **Optional — LSS dedication/thank-you page**. Owner floated a dedication page
   for LSS (author of the hero model). For now she's credited in the footer with
   a link to https://lss3d.silver-hosting.com/index.php?op=worlds . A fuller
   page is a nice-to-have follow-up.

## What's live now (Phases 1 & 2)

- **Repo**: this one — `/home/ryan/Projects/cybertown/wrlforge-site` (separate
  from the product repo; promoted out of the product repo's untracked `site/`).
  Local git only, **no GitHub remote yet**. Latest commits: footer copyright
  fix → nav/link polish → Phase 2 redesign → Phase 1 (bug fix) → account_id.
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

## License situation (important, don't get this wrong)

- The **product repo is currently `UNLICENSED` / all-rights-reserved on `main`**.
  PR #1 relicenses it to **MIT** (keeps the copyright line as MIT's one
  condition — owner explicitly wants "fully open source, just my name in it").
- Therefore the **site must NOT claim MIT/open-source about the product until
  PR #1 is merged.** The current footer is copyright-only, which is accurate
  either way. The "Open Source Tech" chips are fine — those *dependencies*
  genuinely are OSS; that's the tech it's built ON, not the product's license.

### Post-merge (do this once PR #1 merges)
Flip the footer in `worker.js` from the copyright-only line to reference MIT,
e.g. `MIT © 2026 WRL Forge · Ryan Bundy (BassMekanik2000)`, then redeploy. That
is the entire site-side follow-up.

## Phase 3 — live X_ITE scene (DONE, not yet deployed)

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

- **Local preview**: `npx wrangler dev --port 8788` (from this repo).
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
- Download UI: `heroButton`, `downloadsList`. Page: `renderPage`. Entry: default
  `fetch` handler.
- CSS is one inline `<style>`; motion is gated in
  `@media(prefers-reduced-motion:no-preference)`. Globe spin = `merspin`
  keyframe (meridians fade to 0 opacity edge-on so there's no centre line) +
  `rollmark`/`rollmarkRev` surface marker.

## Open flags (not blocking; surface to owner)
- Product git history has commit-author email `ascendance@skate.fm` in the
  public repo (noted in prior sessions; history rewrite is prohibited — separate
  decision).
- `spikes/xite-mall-fit/package.json` in the product repo still says
  `UNLICENSED` (internal throwaway spike; intentionally left out of PR #1).
