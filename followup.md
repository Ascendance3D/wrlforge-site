> # ⛔ SUPERSEDED — HISTORICAL RECORD ONLY. DO NOT FOLLOW.
>
> **This file records the July 2026 transition and is kept for history.**
>
> - The **MIT instructions below are historical and must NOT be followed.**
>   Both §1 (flip the footer to MIT) and §2 (Red Raven rename) were completed and
>   deployed on 2026-07-16, and the MIT decision itself has since been **reversed**.
> - **WRL Forge — product and site alike — is now `GPL-3.0-or-later`.** The product
>   relicensed at `DJAscendance/wrlforge` commit
>   `2eb7c39e7ffd6b830155c4ee3d9b2dc8cb6aab1d`; the site was aligned to match
>   (lane OSS-2). Anything below that says "MIT" describes a state that no longer
>   exists.
> - **Current authority is [`README.md`](README.md), [`LICENSE`](LICENSE),
>   [`NOTICE`](NOTICE), [`CONTRIBUTING.md`](CONTRIBUTING.md), and
>   [`HANDOFF.md`](HANDOFF.md)** — not this file.
> - The only part of this file still live is **§3, the Acknowledgements +
>   Remembrance page**, which is still open and still blocked on the owner
>   supplying the names and remembrance content.
> - The "Still parked" note about the repo being **private** is also stale — the
>   repo has been **public** since 2026-07-16.

---

# Follow-up — later today (2026-07-15)

Written after: Phase 3 (live X_ITE Harley) shipped to wrlforge.com, private
GitHub remote created, and **PR #1 merged → the product repo is now MIT**.
Take the nap first. These are the two things left.

---

## 1. ~~Site footer → flip to MIT~~ — DONE 2026-07-16, then SUPERSEDED by GPLv3+

Now that `DJAscendance/wrlforge` `main` is **MIT** (PR #1 merged
2026-07-15T14:06Z), the site can say so. Until this is done the footer is
copyright-only — still *accurate*, just not claiming the new license.

**Edit** `worker.js`, the footer block (~line 584). Change the first line:

```
  <div>© 2026 WRL Forge · by Ryan Bundy (aka BassMekanik2000)<br>
```
to something like:
```
  <div>MIT © 2026 WRL Forge · Ryan Bundy (aka BassMekanik2000)<br>
```
(Leave the `<span class="credit">…LSS…</span>` line right below it as-is.)

Optional: the **App Repository** / **Open Source** nav links could now point at
the repo's LICENSE or say "MIT" somewhere, if you want to advertise it louder.

**Then redeploy + verify:**
- `npx wrangler deploy` — NOTE: the safety classifier blocks production deploys
  unless *you* run/authorize them explicitly. Easiest is to type
  `! npx wrangler deploy` in the Claude prompt, or just say "deploy to production".
- Verify with a cache-buster (edge caches HTML for 300s and POPs differ):
  `curl -s "https://wrlforge.com/?cb=$RANDOM" | grep -o "MIT © 2026"`
- Confirm the live Harley still renders (hard-reload the page in a browser).

---

## 2. ~~Rename the hero model → "the Red Raven" (by LSS)~~ — DONE 2026-07-16

The bike is titled "HOG!" internally (its `WorldInfo`), but LSS's name for it is
**"the Red Raven"** — that's what the site should say. Update the footer credit:

- In `worker.js`, footer `.credit` span, change
  `Hero world: &ldquo;HOG!&rdquo; by LSS`
  → `Hero world: &ldquo;the Red Raven&rdquo; by LSS`.
- Ships with the **same redeploy** as the MIT footer flip (§1) — do both, deploy once.
- (Optional) the display name also appears in comments in
  `public/hero-harley.wrl` / `public/harley.wrl`; the model files can be renamed
  too if you want (`red-raven.wrl`), but that means updating the `Inline` url and
  the `worker.js` `src` — cosmetic, not required.

---

## 3. Acknowledgements + Remembrance page — **STILL OPEN** (the big one)

You have **~20–30 people** to thank, plus a **remembrance for those we've lost**.
This deserves a real page, not a footer line. Deferred on purpose.

**What's needed from you (bring the content):**
- The list of names to thank (handles / real names, however you want them shown).
- Who/how to link (personal sites, worlds, socials) where it applies.
- The remembrance list + how you want it framed (tone, any dates, a dedication
  line). This is the sensitive part — we'll treat it with care.
- Any group credits (Cybertown community, Skate.FM, etc.).

**Shape (proposal, adjust freely):**
- A dedicated page, e.g. `/thanks` or `/credits`, linked from the footer
  ("With thanks ♥") and/or the nav. Same retro-VRML visual language as the
  landing page so it feels of-a-piece.
- Two sections: **Thanks** (the living roll, maybe grouped) and **In memory**
  (remembrance — quieter styling, its own space, not mixed in).
- LSS is already credited in the site footer (hero model, link to her worlds
  site) — carry that through / expand it here too.
- Implementation note: it's a Cloudflare Worker (no static HTML). Either add a
  route in `worker.js` that renders a second page for `/thanks`, or render it as
  a static asset in `public/`. A Worker route keeps it server-rendered like the
  rest; a static `public/thanks.html` is simpler but bypasses the Worker. Lean
  Worker-route for consistency.

**When ready:** hand over the names + remembrance content and we'll build it.

---

## Still parked (no deadline)
- ~~**GitHub remote is private** (`DJAscendance/wrlforge-site`). Flip to public
  whenever you want it out in the open.~~ — DONE 2026-07-16, repo is **public**.
- `worker.js` has a dead `wireGlobe()` function (all globes use `spinningGlobe`
  now) — safe to delete on the next edit.
