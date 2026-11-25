# Stainless website

Source for [stainless.synctune.it](https://stainless.synctune.it), which showcases the
[Stainless browser](https://github.com/stainless-browser/stainless) and publishes its docs for
users and contributors.

Plain HTML and CSS, with no JavaScript, cookies or third-party resources. The docs are
rendered from Stainless's own Markdown, pinned to one source commit, by small scripts that use
only Node built-ins. There are no dependencies and no install step.

```sh
node --test tests/        # renderer, site and contrast checks
node scripts/build.mjs    # writes the site to dist/
node scripts/check.mjs    # links, anchors, resources and accessibility rules
node scripts/serve.mjs    # preview dist/ at http://127.0.0.1:8080
```

Use Node 26 (see `.node-version`).

- [Preview, build and deployment](docs/deployment.md)
- [Content, vendored docs and brand assets](docs/maintenance.md)

The website is licensed under the [Apache License 2.0](LICENSE), like Stainless.
