# XFour Website
[![forthebadge](https://forthebadge.com/images/badges/built-with-love.svg)](https://forthebadge.com) [![forthebadge](https://forthebadge.com/images/badges/contains-cat-gifs.svg)](https://forthebadge.com)

The XFour corporate website. 

Built with [BootStrap Studio](https://bootstrapstudio.io/).
View at [www.xfour.co.uk](https://www.xfour.co.uk).

## Deploying

**The site deploys itself. Do not run `wrangler deploy` on your laptop.**

The `x4-website` Cloudflare Worker is connected to this repository with
[Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
Cloudflare watches the repository and builds it:

| Push to | Build command | Deploy command | Result |
| --- | --- | --- | --- |
| `main` | `npm ci` | `npx wrangler deploy` | Live on [www.xfour.co.uk](https://www.xfour.co.uk) |
| any other branch | `npm ci` | `npx wrangler versions upload` | A preview version that gets no live traffic, on its own URL |

Both run in the `x4-website` directory.

So: open a pull request, wait for the **Workers Builds: x4-website** check,
follow it for the preview URL, look at the site in a browser, then merge. What
is on `main` is what is live.

### Why not by hand

`wrangler deploy` uploads whatever is in your local `x4-website/public` folder
at that moment. It does not read git, does not check which branch you are on,
and does not care whether your files are committed. A hand deploy can put
uncommitted work live with no record of what went out, and the next merge to
`main` silently undoes it.

### Reading the deployment history

In the Cloudflare dashboard, a Workers Builds deploy is recorded as
`source: wrangler`, the same as a hand deploy would be — because the build
container runs `npx wrangler deploy` itself. **That field cannot tell you
whether a deploy came from CI or from somebody's laptop.** To find out, look at
Workers Builds instead: Worker → Deployments → Builds lists each build with the
branch and commit it came from.

### Checking that live matches git

Do not compare `view-source` on www.xfour.co.uk against the files in this
repository. They will not match, and that is normal: the zone has Cloudflare
Fonts and Rocket Loader turned on, so the edge rewrites the HTML on the way out.
It replaces the Google Fonts stylesheet link with an inlined `@font-face` block
and adds a loader script. The files themselves are untouched.

Compare against the Worker version instead. Every version has its own URL that
does not go through the zone, so it serves exactly what was uploaded:

```sh
# Worker → Deployments → the live version → Preview URL
curl -sL https://<version-prefix>-x4-website.xfour.workers.dev/about-us.html \
  | diff - x4-website/public/about-us.html
```

### Local preview

```sh
cd x4-website
npm ci
npm run dev    # wrangler dev, serves the site locally
```

### Where the build settings live

Not in this repository: Cloudflare dashboard → Workers & Pages → `x4-website` →
Settings → Build. That page holds the repository connection, the two triggers
above and the build token. Changes made there are not visible in git, so note
them in a pull request or an issue.
