import assert from "node:assert/strict";
import { test } from "node:test";
import { createSlugger, renderMarkdown } from "../scripts/markdown.mjs";

const html = (markdown) => renderMarkdown(markdown).html;

test("heading ids match GitHub, including repeats and punctuation", () => {
  const slug = createSlugger();
  assert.deepEqual(["Install, update and remove", "Install, update and remove", "`stainless://` pages (preview)"].map(slug), [
    "install-update-and-remove",
    "install-update-and-remove-1",
    "stainless-pages-preview",
  ]);
  const { headings } = renderMarkdown("# Title\n\n## Q&A: *why* `code`?\n");
  assert.deepEqual(headings.map((heading) => heading.id), ["title", "qa-why-code"]);
});

test("raw HTML is escaped, never passed through", () => {
  assert.equal(html("A <script>alert(1)</script> & <b>bold</b>"), "<p>A &lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;</p>");
  assert.match(html("```html\n<img src=x onerror=y>\n```"), /<pre data-language="html"><code>&lt;img src=x onerror=y&gt;<\/code><\/pre>/);
});

test("code spans keep emphasis, links and underscores literal", () => {
  assert.equal(html("Run `a_b *c* [d](e)` and snake_case_name, *em* and **strong**."), "<p>Run <code>a_b *c* [d](e)</code> and snake_case_name, <em>em</em> and <strong>strong</strong>.</p>");
});

test("tight and loose lists follow CommonMark", () => {
  assert.equal(html("- one\n- two\n  - nested"), "<ul>\n<li>one</li>\n<li>two\n<ul>\n<li>nested</li>\n</ul></li>\n</ul>");
  assert.equal(html("1. one\n\n2. two"), "<ol>\n<li><p>one</p></li>\n<li><p>two</p></li>\n</ol>");
  assert.match(html("3. three\n4. four"), /<ol start="3">/);
});

test("task items are announced as done or not done", () => {
  const output = html("- [ ] open\n- [x] closed");
  assert.match(output, /aria-label="Not done">☐<\/span> open/);
  assert.match(output, /aria-label="Done">☑<\/span> closed/);
});

test("tables keep escaped pipes, alignment and a labelled scroll region", () => {
  const output = html("## Options\n\n| Flag | Meaning |\n| --- | ---: |\n| `a \\| b` | yes |");
  assert.match(output, /role="region" aria-label="Table: Options" tabindex="0"/);
  assert.match(output, /<td><code>a \| b<\/code><\/td><td class="align-right">yes<\/td>/);
});

test("links and images go through the link hook", () => {
  const seen = [];
  const link = (href, label, title, { image } = {}) => {
    seen.push([href, title, Boolean(image)]);
    return `<a href="${href}">${label}</a>`;
  };
  const output = renderMarkdown('See [the guide](guide.md#setup "Guide"), ![logo](a.png) and <https://example.com/x>.', { link }).html;
  assert.deepEqual(seen, [["https://example.com/x", null, false], ["guide.md#setup", "Guide", false], ["a.png", null, true]]);
  assert.match(output, /<a href="a.png">logo<\/a>/);
});
