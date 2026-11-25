# Content, vendored docs and brand assets

## Pages written here

- `src/home.html` is the landing page body. Its facts come from the Stainless README, status
  and docs at the pinned commit. Keep it truthful: no invented release dates, benchmarks,
  testimonials or screenshots, and no version numbers that go stale; link to
  [Releases](https://github.com/stainless-browser/stainless/releases) and the status page instead.
- `src/404.html` is the not-found body. It must use root-absolute links.
- The header, footer and docs chrome live in `layout()` and `documentPage()` in
  `scripts/build.mjs`.
- `assets/styles.css` holds every style. Colors are custom properties at the top, with a dark
  scheme for `prefers-color-scheme: dark`; the hero is always dark.

## Vendored Stainless docs

The docs are copies of Markdown files from
[stainless-browser/stainless](https://github.com/stainless-browser/stainless), unchanged.
`vendor/stainless/SOURCE.json` records the source commit, its date, the product version and
the SHA-256 of every file. The build refuses edited or missing files, so fix wording in the
Stainless repository, not here.

To update the docs to a newer commit:

```sh
git -C /path/to/stainless fetch origin
node scripts/sync-stainless.mjs --source /absolute/path/to/stainless --ref origin/main
node --test tests/ && node scripts/build.mjs && node scripts/check-external.mjs
```

The sync reads files from that commit with `git show`, so local changes in the checkout are
ignored. It stops if `docs/` gained a file that `scripts/catalogue.mjs` doesn't list: add the
new page to the right section first, then sync again. It warns when the upstream artwork
changed (see below).

`scripts/catalogue.mjs` maps each upstream file to its published path, sidebar label and
section. Documents without a level-1 heading need a `title` there. Links inside the docs are
rewritten as follows:

- links to a catalogued file go to its page, keeping any `#fragment`;
- `README.md` goes to the home page (with a fragment, to the README on GitHub);
- everything else, such as source files, workflows and `AGENTS.md`, goes to GitHub at the
  pinned commit.

The renderer in `scripts/markdown.mjs` supports the GitHub-flavored syntax these docs use,
with GitHub's heading ids. It escapes all raw HTML. Mermaid blocks appear as source with a link
to the rendered diagram on GitHub. If a new upstream construct renders wrongly, extend the
renderer with a test in `tests/markdown.test.mjs`.

## Brand assets

The logo and icons are web-sized exports of `chromium/branding/stainless-icon.png` and
`chromium/branding/stainless-logo.png` from the pinned commit. `assets/provenance.json` records,
for each file, the source artwork and its SHA-256, the export command, the size and the
file's own SHA-256. The build fails if an asset was changed or exported from different
artwork than the pinned commit.

When the upstream artwork changes, export again on macOS with `sips` and `cwebp`, using the
commands in `assets/provenance.json`, then update the recorded hashes and sizes:

```sh
sips -s format png -Z 64 /path/to/stainless/chromium/branding/stainless-icon.png --out assets/stainless-icon-64.png
sips -s format png -Z 640 /path/to/stainless/chromium/branding/stainless-logo.png --out /tmp/logo-640.png
cwebp -q 85 -alpha_q 100 -metadata none /tmp/logo-640.png -o assets/stainless-logo-640.webp
shasum -a 256 assets/stainless-icon-64.png
```

Keep the artwork's colors and proportions. The teal accent (`#38b8c0`) comes from the logo's
edge and is used only for decoration; text uses the darker `--accent-text` tokens, which
meet WCAG AA contrast in both color schemes.

## Privacy

No scripts, cookies, analytics, fonts, embeds or other third-party resources load on this
site, and each page's Content-Security-Policy enforces it. Linked services have their own
policies. Update the footer note if this ever changes.

## Before publishing a change

Run the tests, build and checks above, then preview narrow (320 px) and wide screens in light
and dark mode. Use the keyboard to reach the skip link, navigation, contents disclosures and
pager. Keep `CNAME`, canonical URLs, `robots.txt` and the sitemap consistent if the hostname
ever changes.
