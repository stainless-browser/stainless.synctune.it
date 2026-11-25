import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build, output, resolveLink } from "../scripts/build.mjs";
import { checkPage, checkSite } from "../scripts/check.mjs";
import { readVendor } from "../scripts/vendor.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const commit = "0123456789abcdef0123456789abcdef01234567";

test("the built site passes the link, resource and accessibility checks", async () => {
  await build();
  const { problems, pages } = await checkSite(output);
  assert.deepEqual(problems, []);
  assert.equal(pages, 26);
});

test("upstream links map to site pages or to GitHub at the pinned commit", () => {
  assert.equal(resolveLink("build-macos.md#maintaining-chromium", "docs/status.md", "docs/status/", commit), "../build-macos/#maintaining-chromium");
  assert.equal(resolveLink("../SECURITY.md", "docs/status.md", "docs/status/", commit), "../security/");
  assert.equal(resolveLink("docs/README.md", "CONTRIBUTING.md", "docs/contributing/", commit), "../");
  assert.equal(resolveLink("../README.md", "docs/README.md", "docs/", commit), "../");
  assert.equal(resolveLink("../chromium/manifest.json", "docs/status.md", "docs/status/", commit), `https://github.com/stainless-browser/stainless/blob/${commit}/chromium/manifest.json`);
  assert.equal(resolveLink("../chromium/patches/", "docs/roadmap.md", "docs/roadmap/", commit), `https://github.com/stainless-browser/stainless/tree/${commit}/chromium/patches`);
  assert.equal(resolveLink("../README.md#quickstart", "docs/README.md", "docs/", commit), `https://github.com/stainless-browser/stainless/blob/${commit}/README.md#quickstart`);
  assert.throws(() => resolveLink("../../elsewhere.md", "docs/status.md", "docs/status/", commit), /outside the repository/);
});

test("page checks catch external resources, scripts and structural accessibility problems", async () => {
  const good = await readFile(join(output, "docs/status/index.html"), "utf8");
  assert.deepEqual(checkPage("good.html", good), []);
  const broken = good
    .replace('<link rel="stylesheet"', '<link rel="stylesheet" href="https://cdn.example/x.css"><link rel="x"')
    .replace("</main>", '<img src="a.png" width="1" height="1"><h4>Skipped</h4><a href="#"></a><script></script></main>');
  const problems = checkPage("broken.html", broken).join("\n");
  for (const expected of ["another origin: https://cdn.example/x.css", "image without alt", "skips from", "without an accessible name", "script"]) {
    assert.match(problems, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("edited vendored documents are rejected", async () => {
  const copy = await mkdtemp(join(tmpdir(), "stainless-site-"));
  try {
    await cp(join(root, "vendor"), join(copy, "vendor"), { recursive: true });
    await writeFile(join(copy, "vendor/stainless/SECURITY.md"), "# Edited\n");
    await assert.rejects(readVendor(copy), /SECURITY\.md differs from the recorded source/);
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
});

test("theme colors meet WCAG AA text contrast", async () => {
  const css = await readFile(join(root, "assets/styles.css"), "utf8");
  const tokens = (block) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((match) => [match[1], match[2]]));
  const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)")));
  const dark = { ...light, ...tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("*,"))) };
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (one, two) => {
    const [high, low] = [luminance(one), luminance(two)].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  };
  for (const [scheme, palette] of [["light", light], ["dark", dark]]) {
    for (const text of ["ink", "muted", "accent-text"]) {
      for (const background of ["paper", "surface", "sunken"]) {
        assert.ok(ratio(palette[text], palette[background]) >= 4.5, `${scheme} ${text} on ${background}`);
      }
    }
    for (const text of ["hero-ink", "hero-muted", "hero-accent"]) assert.ok(ratio(palette[text], palette["hero-bg"]) >= 4.5, `${text} on hero`);
    assert.ok(ratio(palette["button-ink"], palette["hero-accent"]) >= 4.5, "primary button");
  }
});
