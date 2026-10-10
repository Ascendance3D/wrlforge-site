# wrlforge-site — Agent Guide

Marketing site for WRL Forge: a single Cloudflare Worker (`worker.js`, release
data in `release.js`) with static assets in `public/`. Read `HANDOFF.md` for
current state, history, and the deploy runbook. Read `NOTICE` before touching
any artwork, fonts, or vendored X_ITE files.

## Browser QA harness

- **Use `playwright-cli` for browser QA** (installed globally; run
  `playwright-cli --help`). It is the preferred harness for this repo.
- Do **not** use the Playwright MCP server or the Playwright plugin tools for
  QA here.
- `playwright-cli` writes snapshots and console logs to `.playwright-cli/` in
  the working directory. That output is temporary: it is git-ignored, and you
  should delete it after the QA run.
- For a local target, run `npx wrangler dev --port 8788` and load
  `http://localhost:8788/?cb=<unique>`, because the page is cached for 5 minutes.
