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
2. **Phase 3 — live X_ITE scene** in the hero (owner's favourite; see plan).
3. **Phase 3.5 — create a GitHub remote** for THIS site repo (needs owner GO;
   outward-facing). Suggested name `DJAscendance/wrlforge-site`.

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

## Phase 3 plan — live X_ITE scene

Goal: one **lightweight, real X_ITE-rendered spinning `.wrl`** dropped into the
hero viewport frame (the product's actual renderer, on the product's landing
page — the on-brand flex). Owner: *"omg that shit is amazing bro… just one
scene, lighter weight."*

- **Serve X_ITE self-hosted (no CDN — house rule).** Vendor
  `node_modules/x_ite/dist/x_ite.min.js` (~1.36 MB, MIT) from the product repo
  into this repo. Cleanest delivery: add Cloudflare **Workers Static Assets**
  (`[assets] directory = "./public"` in `wrangler.toml`) and drop
  `x_ite.min.js` + a small `.wrl` in `public/`; the Worker keeps rendering the
  HTML, static assets serve the JS/model. (Alt: a Worker route that returns the
  vendored JS as text with a long `Cache-Control`.)
- **The model**: author a small aesthetic `.wrl` (low-poly, cyan/amber to match)
  or reuse a product test fixture. Keep it tiny.
- **Integration**: lazy-init X_ITE (only after load / when scrolled into view)
  so it never blocks paint. Transparent background, autorotate, ~300px. Likely
  place it where the ring-planet is (top-right) or as a companion. Keep the SVG
  planets as the no-JS/no-WebGL fallback.
- **Motion/CSP**: pause autorotate under `prefers-reduced-motion`. The Worker
  sets no CSP today; if one is added later, X_ITE needs WebGL + possibly
  `wasm-unsafe-eval`. Same-origin assets avoid cross-origin issues.
- **Reference**: the product renders X_ITE-only; see product repo
  `renderer/preview.js` / `renderer/world-preview.js` and `docs/PREVIEW_ARCHITECTURE.md`
  for how the app drives X_ITE.

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
