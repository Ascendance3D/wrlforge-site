# Follow-up — later today (2026-07-15)

Written after: Phase 3 (live X_ITE Harley) shipped to wrlforge.com, private
GitHub remote created, and **PR #1 merged → the product repo is now MIT**.
Take the nap first. These are the two things left.

---

## 1. Site footer → flip to MIT (small, but needs a redeploy)

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

## 2. Acknowledgements + Remembrance page (the big one — do this rested)

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
- **GitHub remote is private** (`DJAscendance/wrlforge-site`). Flip to public
  whenever you want it out in the open.
- `worker.js` has a dead `wireGlobe()` function (all globes use `spinningGlobe`
  now) — safe to delete on the next edit.
