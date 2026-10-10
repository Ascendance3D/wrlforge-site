# Contributing to the WRL Forge site

This repository is the marketing / download site for **WRL Forge**, served from a
single Cloudflare Worker at [wrlforge.com](https://wrlforge.com). Contributions are
welcome.

For the product itself, see
[Ascendance3D/wrlforge](https://github.com/Ascendance3D/wrlforge) and its own,
longer `CONTRIBUTING.md`. This file covers the site only.

## Licensing and copyright

Original site code here is **`GPL-3.0-or-later`** (see [LICENSE](LICENSE)), matching
the product.

- **You keep your copyright.** Contributing does not transfer it.
- **There is no CLA and no copyright assignment.** You license your contribution
  under `GPL-3.0-or-later`; that is all that is asked of you.
- Your contribution is distributed under that license along with the rest of the
  site's own code.

## Sign your work — the DCO

This project uses the **Developer Certificate of Origin** rather than a CLA. Sign
off each commit:

```sh
git commit -s
```

which appends:

```
Signed-off-by: Your Name <your.email@example.com>
```

That line certifies you have the right to submit the work under the project's
license. The canonical text is short and worth reading once:
**<https://developercertificate.org/>**

## Third-party code and assets

If you add or update anything you did not write, say so in the pull request and
include:

- the upstream project and source URL;
- the version, tag, or commit it came from;
- the upstream license (SPDX identifier);
- confirmation that upstream copyright and license notices ship with it.

Preserve upstream headers verbatim. Never replace someone else's copyright line
with a WRL Forge one. Material with unknown or unverifiable origin cannot be
accepted. Anything added must also be recorded in [NOTICE](NOTICE).

## Creative assets and featured artwork

The site features third-party artwork, and that artwork is **legally separate from
the software license**.

- **Featured art does not become GPL** because the site's code is GPL. Artists keep
  their copyright.
- Do not submit models, textures, images, audio, or fonts unless you hold the
  rights or have the creator's explicit permission covering the use you are
  proposing. "Found it online" is not permission.
- Say exactly what permission was granted. Display-on-wrlforge.com permission is
  not redistribution permission, and will be recorded as the narrower thing it is.
- Every featured work gets an entry in [NOTICE](NOTICE) naming its creator, its
  rights, and the limits of the permission granted.

The current hero artwork — **"the Red Raven" © 2003 LSS** — is used with LSS's
permission for display on wrlforge.com only. Do not reuse, re-host, or modify it.

## Development

```sh
npx wrangler dev        # local preview
npx wrangler deploy     # publishes to wrlforge.com (maintainers only)
```

`worker.js` is the whole page — there is no `index.html`. Routes and the custom
domain binding live in `wrangler.toml`; please don't change Cloudflare
configuration in a pull request.

## Security issues

Please report security problems privately to the maintainer rather than opening a
public issue.
