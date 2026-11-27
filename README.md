# XFour Website
[![forthebadge](https://forthebadge.com/images/badges/built-with-love.svg)](https://forthebadge.com) [![forthebadge](https://forthebadge.com/images/badges/contains-cat-gifs.svg)](https://forthebadge.com)

The XFour corporate website.

Built with [Astro](https://astro.build/). The look is Bootstrap 5, originally
from [BootStrap Studio](https://bootstrapstudio.io/).
View at [www.xfour.co.uk](https://www.xfour.co.uk).

## How the site is put together

Everything lives in the `x4-website` directory.

| Path | What is in it |
| --- | --- |
| `src/pages` | One file per page. The file name is the URL: `src/pages/about-us.astro` is served at `/about-us`. |
| `src/layouts` | `BaseLayout.astro` holds the head tags, navigation and footer for the public pages. `ErrorLayout.astro` is the 404 and 503 shell. |
| `src/components` | The navigation, the footer and the live chat tag. |
| `public` | Images, CSS, JavaScript, `robots.txt`, `sitemap.xml`, `_headers`. Copied into the build as they are, so every asset URL stays where it is. |
| `dist` | The built site. Not in git — it is made on every deploy. |

**Change the navigation, the footer or a head tag in one place only.** Before
Astro, each of the eleven pages carried its own copy of all three, and they
drifted apart. That is what this structure exists to prevent.

Two things worth knowing:

* A new page needs no routing. Add the file to `src/pages` and the URL exists.
  It only needs a navigation edit if it belongs in the menu.
* The `title`, `description` and Open Graph tags come from the two props a page
  passes to `BaseLayout`. The canonical URL is worked out from the page's own
  address, so it cannot be copied from another page by mistake.

## Deploying

**The site deploys itself. Do not run `wrangler deploy` on your laptop.**

Two Cloudflare Workers are connected to this repository with
[Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
Cloudflare watches the repository and builds it:

| Push to | Worker | Build command | Deploy command | Result |
| --- | --- | --- | --- | --- |
| `main` | `x4-website` | `npm ci` | `npx wrangler deploy` | Live on [www.xfour.co.uk](https://www.xfour.co.uk) |
| `main` | `x4-website-preview` | `npm ci` | `npx wrangler deploy --env preview` | A copy of `main` on <https://x4-website-preview.xfour.workers.dev> |
| any other branch | `x4-website-preview` | `npm ci` | `npx wrangler versions upload --env preview` | A preview of the branch, on its own URL |

All three run in the `x4-website` directory.

Wrangler runs the Astro build itself before it uploads anything — `wrangler.jsonc`
sets `build.command` to `npm run build`. So the commands above are the whole
pipeline.

So: open a pull request, wait for the **Workers Builds: x4-website-preview**
check, follow it for the preview URL, look at the site in a browser, then merge.
What is on `main` is what is live.

### Previews

A branch is never built on the production Worker. It goes to a second Worker,
`x4-website-preview`, which is the `preview` environment in `wrangler.jsonc`
(XFO-1798, 27 Nov 2026). Two rules sit behind that, and both are tested in
`test/preview-config.test.mjs` and `test/enquiry.test.mjs`:

1. **Only www.xfour.co.uk runs code that has the CRM key.** The production
   Worker has `workers_dev: false` and `preview_urls: false`, so it has no
   `workers.dev` address at all — not for the live version, not for an old one,
   not for a branch. The preview Worker has no `ENTRA_CLIENT_SECRET`, no
   `TURNSTILE_SECRET_KEY`, no Dataverse vars, no `ENQUIRY_RETRY_KV` and no cron.
   A form sent on a preview answers `503 not_configured` and shows "call us
   instead". It cannot create a Lead.
2. **A preview cannot be indexed.** Every response from the preview Worker
   carries `X-Robots-Tag: noindex, nofollow`.

Where to find a preview:

| What | Address |
| --- | --- |
| The branch, latest push | `https://<branch-name>-x4-website-preview.xfour.workers.dev` — only when the branch name has no `/` in it |
| One push | `https://<version-prefix>-x4-website-preview.xfour.workers.dev` — the link in the Workers Builds check |
| `main` as built, not through the zone | <https://x4-website-preview.xfour.workers.dev> |

Name a branch `xfo-123-short-title`, not `feature/short-title`, to get the
stable branch address.

Never do these, each one breaks rule 1:

- `wrangler secret put … --env preview`, or a secret added to
  `x4-website-preview` in the dashboard;
- a KV namespace, a Dataverse var or a cron under `env.preview` in
  `wrangler.jsonc`;
- `workers_dev` or `preview_urls` deleted from, or set to `true` at, the top of
  `wrangler.jsonc`. Wrangler turns both **on** when they are missing, and the
  next deploy of `main` would then put every stored version of the production
  Worker back on the internet;
- a "Deploy non-production branches" trigger on the `x4-website` Worker.

To check the production Worker's setting, read it back from the Cloudflare API.
Both values must be `false`:

```sh
# GET /accounts/{account_id}/workers/scripts/x4-website/subdomain
# → { "enabled": false, "previews_enabled": false }
curl -s -o /dev/null -w '%{http_code}\n' https://x4-website.xfour.workers.dev/   # 404
curl -s -o /dev/null -w '%{http_code}\n' https://www.xfour.co.uk/                # 200
```

Last read back: 27 Nov 2026 01:16 UTC, both `false` (XFO-1798).

### Why not by hand

`wrangler deploy` builds whatever is in your local working copy and uploads
that. It does not read git, does not check which branch you are on, and does
not care whether your files are committed. A hand deploy can put
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

Compare against the preview Worker instead. It is on a `workers.dev` address,
which does not go through the zone, so it serves exactly what was built. Its
own address always has the latest `main`:

```sh
cd x4-website && npm ci && npm run build
curl -sL https://x4-website-preview.xfour.workers.dev/about-us \
  | diff - dist/about-us.html
```

The production Worker has no such address (see "Previews" above). To see which
commit is live, look at Worker → Deployments → Builds.

### Working on it locally

```sh
cd x4-website
npm ci
npm run dev        # Astro dev server, reloads as you edit
npm run build      # writes dist/
npm run preview    # builds, then serves dist/ through the real Worker runtime
```

`npm run dev` is the one to use while writing a page. Use `npm run preview`
before opening a pull request, because it is the only one that applies the
Worker's own rules: the extensionless URLs, the `_headers` file and the custom
404.

### Where the build settings live

Not in this repository: Cloudflare dashboard → Workers & Pages → `x4-website` →
Settings → Build. That page holds the repository connection, the two triggers
above and the build token. Changes made there are not visible in git, so note
them in a pull request or an issue.
