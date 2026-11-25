// Static checks for the built site in dist/: local links, assets and anchors resolve, pages
// load nothing from other origins, and each page meets the structural accessibility rules
// that can be checked without a browser. Run `node scripts/build.mjs` first.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "./catalogue.mjs";
import { htmlToText } from "./markdown.mjs";

const decode = (value) => htmlToText(value);
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)].slice(1).map(([, name, value = ""]) => [name, decode(value)]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((match) => ({ tag: match[0], index: match.index, ...attributes(match[0]) }));

export async function htmlPages(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".html")).map((entry) => relative(directory, join(entry.parentPath, entry.name)).split("\\").join("/")).sort();
}

// Accessibility and resource rules for one page. Returns a list of problems.
export function checkPage(path, html) {
  const problems = [];
  const fail = (message) => problems.push(`${path}: ${message}`);
  if (!/<html lang="en">/.test(html)) fail("missing <html lang>");
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1].trim();
  if (!title) fail("missing <title>");
  if (!/<meta name="viewport" content="width=device-width, initial-scale=1">/.test(html)) fail("missing or restrictive viewport");
  if (!/<a class="skip-link" href="#main">/.test(html) || !/<main id="main"/.test(html)) fail("missing skip link or main landmark");
  if (/<script\b|\son[a-z]+="/i.test(html)) fail("contains a script or inline event handler");
  if (/\sstyle="/.test(html) || /<style\b/.test(html)) fail("contains inline styles, which the Content-Security-Policy blocks");

  const ids = tags(html, "[a-z0-9]+").map((tag) => tag.id).filter(Boolean);
  for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) fail(`duplicate id "${id}"`);

  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((match) => ({ level: Number(match[1]), text: htmlToText(match[2]).trim() }));
  if (headings.filter((heading) => heading.level === 1).length !== 1) fail("needs exactly one <h1>");
  headings.forEach((heading, index) => {
    if (!heading.text) fail(`empty <h${heading.level}>`);
    const previous = headings[index - 1];
    if (previous && heading.level > previous.level + 1) fail(`heading level skips from h${previous.level} to h${heading.level} at "${heading.text}"`);
  });

  for (const image of tags(html, "img")) {
    if (!("alt" in image)) fail(`image without alt: ${image.src}`);
    if (!image.width || !image.height) fail(`image without dimensions: ${image.src}`);
  }
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const link = attributes(`<a${match[1]}>`);
    const name = link["aria-label"] || htmlToText(match[2].replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/g, "$1")).trim();
    if (!name) fail(`link without an accessible name: ${link.href}`);
    if (!link.href) fail(`link without href: ${name}`);
    if (link.target) fail(`link opens a new window: ${link.href}`);
  }
  for (const tag of tags(html, "[a-z]+").filter((tag) => Number(tag.tabindex) > 0)) fail(`positive tabindex on ${tag.tag}`);
  for (const region of tags(html, "div").filter((tag) => tag.role === "region")) {
    if (!region["aria-label"] && !region["aria-labelledby"]) fail("scrollable region without a label");
  }
  for (const nav of tags(html, "nav").slice(1)) {
    if (!nav["aria-label"]) fail("more than one <nav> without an aria-label");
  }

  // Everything the page loads must come from this site.
  for (const tag of [...tags(html, "img"), ...tags(html, "source"), ...tags(html, "link"), ...tags(html, "iframe"), ...tags(html, "video"), ...tags(html, "audio")]) {
    if (tag.tag.startsWith("<link") && !/\b(stylesheet|icon|apple-touch-icon|preload|manifest)\b/.test(tag.rel ?? "")) continue;
    for (const url of [tag.src, tag.href, ...(tag.srcset ?? "").split(",").map((entry) => entry.trim().split(/\s+/)[0])].filter(Boolean)) {
      if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(url) || /^data:/i.test(url)) fail(`loads a resource from another origin: ${url}`);
    }
  }
  return problems;
}

// Checks that every local link and asset exists and every fragment matches an id.
export async function checkLinks(directory, paths) {
  const problems = [];
  const externals = new Map();
  const cache = new Map();
  const read = (path) => {
    if (!cache.has(path)) cache.set(path, readFile(join(directory, path), "utf8"));
    return cache.get(path);
  };
  const idsOf = async (path) => new Set(tags(await read(path), "[a-z0-9]+").map((tag) => tag.id).filter(Boolean));
  for (const path of paths) {
    const html = await read(path);
    const references = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((match) => decode(match[1]));
    const base = path === "404.html" ? `${site.origin}/missing/page` : `${site.origin}/${path}`;
    for (const reference of references) {
      if (reference.startsWith("#")) {
        if (!(await idsOf(path)).has(decodeURIComponent(reference.slice(1)))) problems.push(`${path}: missing anchor ${reference}`);
        continue;
      }
      const url = new URL(reference, base);
      if (url.origin !== site.origin) {
        if (url.protocol === "mailto:") continue;
        if (url.protocol !== "https:") problems.push(`${path}: insecure or unsupported URL ${reference}`);
        else externals.set(url.href, [...(externals.get(url.href) ?? []), path]);
        continue;
      }
      let target = posix.normalize(decodeURIComponent(url.pathname)).slice(1);
      if (!target || target.endsWith("/")) target += "index.html";
      try {
        if ((await stat(join(directory, target))).isDirectory()) throw new Error("directory");
      } catch {
        problems.push(`${path}: missing ${reference}`);
        continue;
      }
      if (url.hash && target.endsWith(".html") && !(await idsOf(target)).has(decodeURIComponent(url.hash.slice(1)))) {
        problems.push(`${path}: missing anchor ${reference}`);
      }
    }
  }
  return { problems, externals };
}

export async function checkSite(directory) {
  const paths = await htmlPages(directory);
  const problems = [];
  for (const path of paths) problems.push(...checkPage(path, await readFile(join(directory, path), "utf8")));
  const links = await checkLinks(directory, paths);
  problems.push(...links.problems);

  const sitemap = await readFile(join(directory, "sitemap.xml"), "utf8");
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
  const indexed = paths.filter((path) => path !== "404.html").map((path) => `${site.origin}/${path.replace(/index\.html$/, "")}`).sort();
  if (JSON.stringify(listed) !== JSON.stringify(indexed)) problems.push("sitemap.xml doesn't list exactly the published pages");
  for (const path of paths.filter((path) => path !== "404.html")) {
    const canonical = /<link rel="canonical" href="([^"]+)">/.exec(await readFile(join(directory, path), "utf8"))?.[1];
    if (canonical !== `${site.origin}/${path.replace(/index\.html$/, "")}`) problems.push(`${path}: wrong canonical URL ${canonical}`);
  }
  return { problems, externals: links.externals, pages: paths.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directory = fileURLToPath(new URL("../dist/", import.meta.url));
  try {
    const { problems, externals, pages } = await checkSite(directory);
    if (problems.length) {
      console.error(`Site check failed:\n${problems.join("\n")}`);
      process.exitCode = 1;
    } else {
      console.log(`Checked ${pages} pages: local links, anchors, resources and accessibility rules pass. ${externals.size} external URLs not requested.`);
    }
  } catch (error) {
    console.error("Site check failed:", error.code === "ENOENT" ? "dist/ is missing. Run node scripts/build.mjs first." : error.message);
    process.exitCode = 1;
  }
}
