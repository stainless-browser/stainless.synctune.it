# Preview, build and deployment

## No installation

The site needs Node 26 and nothing else: no package manager, framework, generator,
CDN or runtime service. The scripts in `scripts/` use only Node built-ins. Do not add a
`package.json` or run `npm install`.

```sh
node --test tests/        # renderer, site and contrast checks (also builds dist/)
node scripts/build.mjs    # writes the site to dist/
node scripts/check.mjs    # checks dist/ offline
node scripts/serve.mjs    # preview at http://127.0.0.1:8080; pass a port to change it
```

Stop the preview server with Ctrl+C. `dist/` is ignored by Git.

## What the build does

`scripts/build.mjs`:

1. Verifies every vendored document against `vendor/stainless/SOURCE.json` and every
   derived image against `assets/provenance.json`.
2. Wraps `src/home.html` and `src/404.html` in the shared layout.
3. Renders each document listed in `scripts/catalogue.mjs` with the built-in Markdown renderer
   in `scripts/markdown.mjs`, adding the docs navigation, contents, source link and
   previous/next links.
4. Writes `sitemap.xml` and copies `assets/`, `CNAME`, `.nojekyll` and `robots.txt`.

Pages are directories (`docs/install-macos/index.html`) and every internal link is relative, so
`dist/` also works under a repository path. Canonical and social URLs use the final domain.
`404.html` uses root-absolute links because GitHub Pages serves it for any missing path.

## Checks

`scripts/check.mjs` runs offline on `dist/` and fails on:

- a missing local page, asset or `#fragment`;
- any `src`, stylesheet or icon loaded from another origin, any script, inline style or
  event handler (each page's Content-Security-Policy would block them anyway);
- structural accessibility problems: missing language, title or viewport, a missing skip
  link or `main`, more or fewer than one `h1`, skipped heading levels, images without `alt`
  or dimensions, links without an accessible name or opening a new window, duplicate ids,
  positive `tabindex`, unlabelled scroll regions or unlabelled extra `nav` landmarks;
- a sitemap or canonical URL that doesn't match the published pages.

`tests/` also proves the renderer's GitHub-compatible heading ids and escaping, the link
mapping, tamper detection for vendored files and WCAG AA contrast for both color schemes.
These are static checks, not a full audit: also check keyboard use and a screen reader when
changing the layout.

`scripts/check-external.mjs` requests every external URL the site links to, with retries for
rate limits. It needs network access, so it runs in its own workflow.

## GitHub Pages

The repository publishes with GitHub Actions to the custom domain in `CNAME`:

- **Settings > Pages**: source **GitHub Actions**, custom domain `stainless.synctune.it`,
  **Enforce HTTPS** on.
- **DNS**: the `synctune.it` zone is hosted by Vercel. `stainless` is a `CNAME` to
  `stainless-browser.github.io`, the organization's Pages host, not a repository path.

The `CNAME` file records the intended hostname; it does not configure Pages by itself. If the
domain ever has to be re-added, set it in Pages settings before changing DNS, and let a
pending certificate finish rather than removing and re-adding the domain repeatedly.

## Workflows

`.github/workflows/pages.yml` has two jobs:

- **Build and check site** runs the tests, the build and the offline checks for every pull
  request and push to `main`, with read-only repository permissions. On `main` it uploads
  `dist/` as the Pages artifact.
- **Deploy GitHub Pages** deploys that artifact from the same run. Only this job receives
  Pages write and OIDC permissions, and only on `main`.

Pull requests never deploy. Newer commits cancel older pull request runs; production
deployments are serialized without cancellation. Redeploy by hand from
**Actions > Deploy static site > Run workflow** on `main`.

`.github/workflows/links.yml` builds the site and runs the external link check on pull
requests, every Monday and on demand. A failure there usually means an upstream page moved:
fix it in the Stainless repository and sync again.

Both workflows use official actions pinned to full commit SHAs and need no secrets beyond
the standard `GITHUB_TOKEN` and GitHub's OIDC token.

## Other static hosts

Run `node scripts/build.mjs` and publish `dist/`. The site needs no environment variables,
API keys, rewrites or server functions. Select `404.html` as the not-found page if required.
