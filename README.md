# XFour Website
[![forthebadge](https://forthebadge.com/images/badges/built-with-love.svg)](https://forthebadge.com) [![forthebadge](https://forthebadge.com/images/badges/contains-cat-gifs.svg)](https://forthebadge.com)

The XFour corporate website. 

Built with [BootStrap Studio](https://bootstrapstudio.io/).
View at [www.xfour.co.uk](https://www.xfour.co.uk).
## Deploying

The live site is deployed by GitHub Actions, not by hand.

- **A merge to `main` goes live.** The workflow is `.github/workflows/deploy.yml`.
- **A pull request builds a preview version** and posts the preview URL on the
  pull request. A preview does not change the live site.
- **Do not run `wrangler deploy` from a laptop.** A hand deployment uploads the
  files in your local `x4-website/public` folder, whatever their state, and git
  is never told. The next deployment from a clean checkout then silently
  removes the change.

Two repository secrets are required (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with the **Workers Scripts: Edit** permission on the XFour IT Limited account |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |
