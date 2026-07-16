# wrlforge-site

Marketing / download site for **WRL Forge** — served from a single Cloudflare
Worker at [wrlforge.com](https://wrlforge.com).

`worker.js` renders the landing page server-side and resolves the newest GitHub
release (prereleases **included** — the product currently ships beta
prereleases, which the `/releases/latest` endpoint hides). Download links and
file sizes come live from the GitHub API, so they never go stale.

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

Code in this repository is MIT licensed — see [LICENSE](LICENSE).

The hero model (`public/harley.wrl`, `public/hero-harley.wrl`,
`public/hog1.jpg`) is third-party art used with permission and is **not**
covered by that license — see [NOTICE](NOTICE) for details and attribution.
