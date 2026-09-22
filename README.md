# wrlforge-site

Marketing / download site for **WRL Forge** — served from a single Cloudflare
Worker at [wrlforge.com](https://wrlforge.com).

`worker.js` renders the landing page server-side and resolves the newest GitHub
release (prereleases **included** — the product currently ships beta
prereleases, which the `/releases/latest` endpoint hides). Download links and
file sizes come live from the GitHub API, so they never go stale.

## Platforms

Three platforms are offered: **Windows**, **macOS**, **Linux** — in that display
order, in both the hero download panel and the "all downloads" list.

`classifyAsset()` maps a GitHub release asset name to a platform. macOS is
matched **before** the generic Windows `.zip` fallback, so
`WRL-Forge-<version>-mac-arm64.zip` is labelled macOS and not Windows; `.dmg`
is matched as macOS too.

The OS marks live in `public/os-icons/` (self-hosted, no CDN), copied byte-for-
byte from the product repo's `assets/os-icons/`. Each platform ships 30/60/90 px
variants wired through `srcset` for high-DPI screens. They are decorative only
(`alt=""`, `aria-hidden="true"`) — the platform name is always present as text,
so the icons are never the sole indicator.

## Develop

```sh
npx wrangler dev        # local preview at http://localhost:8787
```

## Deploy

```sh
npx wrangler deploy     # publishes to wrlforge.com + www.wrlforge.com
```

Routes and the custom domain binding live in `wrangler.toml`.

## License

`Copyright © 2026 Ryan Bundy (BassMekanik2000) and contributors.`

Original website code in this repository is **free software** under the **GNU
General Public License, version 3 or later** (`GPL-3.0-or-later`) — see
[LICENSE](LICENSE). This matches the WRL Forge product, which is
`GPL-3.0-or-later`.

Third-party components keep their own copyright and licenses — the vendored
X_ITE runtime under `public/` is MIT, and its bundled fonts are Apache-2.0 /
OFL-1.1 / Ubuntu Font Licence. See [NOTICE](NOTICE).

The hero artwork — **“the Red Raven” © 2003 LSS** (`public/harley.wrl`,
`public/hog1.jpg`) — is third-party creative work used with LSS's permission
for display on wrlforge.com. LSS retains copyright. It is **not** covered by
the GPL site-code license and is **not** open-licensed; see [NOTICE](NOTICE)
for the exact terms and attribution.

Contributions are welcome under `GPL-3.0-or-later` with a DCO sign-off
(`git commit -s`) — no CLA, no copyright assignment. See
[CONTRIBUTING.md](CONTRIBUTING.md).
