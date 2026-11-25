// Builds the static site into dist/: the landing page, the vendored Stainless docs and the
// public files. Uses Node built-ins only. Run with `node scripts/build.mjs`.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { pageAliases, pages, sections, site, upstream } from "./catalogue.mjs";
import { escapeHtml, renderMarkdown } from "./markdown.mjs";
import { readProvenance, readVendor } from "./vendor.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
export const output = join(root, "dist");
const publicFiles = ["CNAME", ".nojekyll", "robots.txt"];
const pagesBySource = new Map(pages.map((page) => [page.source, page]));

// Relative URL from one published directory ("" is the site root) to another.
export function relativeUrl(from, to) {
  const path = posix.relative(`/${from}`, `/${to}`);
  return path ? `${path}/` : "./";
}

const githubUrl = (kind, commit, path) => `${upstream.url}/${kind}/${commit}/${path}`.replace(/\/$/, "");

// Maps a link found in an upstream document to its published page, or to GitHub at the
// pinned commit for files the site doesn't publish.
export function resolveLink(href, source, from, commit) {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("//")) return href;
  const [path, hash] = href.split(/#(.*)/s);
  const fragment = hash === undefined ? "" : `#${hash}`;
  const target = posix.normalize(posix.join(posix.dirname(source), path));
  if (target.startsWith("../")) throw new Error(`${source} links outside the repository: ${href}`);
  const page = pagesBySource.get(target);
  if (page) return relativeUrl(from, page.path) + fragment;
  if (target in pageAliases && !fragment) return relativeUrl(from, pageAliases[target]);
  return githubUrl(path.endsWith("/") ? "tree" : "blob", commit, target) + fragment;
}

const navigation = [
  { label: "Docs", path: "docs/", current: (path) => path.startsWith("docs/") && !["docs/install-macos/", "docs/contributing/"].includes(path) },
  { label: "Install", path: "docs/install-macos/" },
  { label: "Contribute", path: "docs/contributing/" },
];

export function layout({ path, title, description, body, base = relativeUrl(path, ""), record, index = true }) {
  const canonical = `${site.origin}/${path}`;
  const short = record.commit.slice(0, 7);
  const href = (target) => (base === "/" ? `/${target}` : relativeUrl(path, target));
  const items = navigation.map((item) => {
    const current = item.current ? item.current(path) : path === item.path;
    return `<li><a href="${href(item.path)}"${current ? ' aria-current="page"' : ""}>${item.label}</a></li>`;
  });
  items.push(`<li><a href="${upstream.url}">GitHub</a></li>`);
  const pageTitle = path === "" ? `${site.name}: a Chromium browser without Google services` : `${title} | ${site.name}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
${index ? `<link rel="canonical" href="${canonical}">` : '<meta name="robots" content="noindex">'}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#111214">
<link rel="icon" href="${base}assets/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${base}assets/apple-touch-icon.png">
<link rel="stylesheet" href="${base}assets/styles.css">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${site.name}">
<meta property="og:title" content="${escapeHtml(path === "" ? site.name : title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.origin}/assets/stainless-icon-512.png">
<meta property="og:image:alt" content="Stainless app icon: a brushed-steel S on a black rounded square">
<meta name="twitter:card" content="summary">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
<div class="container header-inner">
<a class="brand" href="${base === "/" ? "/" : relativeUrl(path, "")}"><img src="${base}assets/stainless-icon-64.png" alt="" width="32" height="32"><span>Stainless</span></a>
<nav class="site-nav" aria-label="Main">
<ul>
${items.join("\n")}
</ul>
</nav>
</div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site-footer">
<div class="container footer-inner">
<p>Stainless is free software under the <a href="${href("docs/license/")}">Apache License 2.0</a>, by <a href="https://open.synctune.it/">Synctune Open</a>.</p>
<p>Docs mirror <a href="${upstream.url}/tree/${record.commit}"><code>${upstream.repository}@${short}</code></a> (${record.committedAt.slice(0, 10)}). This site sets no cookies and loads no scripts, analytics or third-party resources.</p>
<nav aria-label="Project">
<ul>
<li><a href="${href("docs/security/")}">Security</a></li>
<li><a href="${href("docs/accessibility/")}">Accessibility</a></li>
<li><a href="${href("docs/code-of-conduct/")}">Code of Conduct</a></li>
<li><a href="${upstream.url}/releases">Releases</a></li>
<li><a href="https://github.com/stainless-browser/stainless.synctune.it">Website source</a></li>
</ul>
</nav>
</div>
</footer>
</body>
</html>
`;
}

function docsNavigation(path) {
  const groups = sections.map((section, number) => {
    const links = section.pages.map((page) => {
      const current = page.path === path ? ' aria-current="page"' : "";
      return `<li><a href="${relativeUrl(path, page.path)}"${current}>${escapeHtml(page.label)}</a></li>`;
    });
    return `<p class="docs-nav-heading" id="docs-nav-${number}">${escapeHtml(section.title)}</p>\n<ul aria-labelledby="docs-nav-${number}">\n${links.join("\n")}\n</ul>`;
  });
  return `<nav class="docs-nav" aria-label="Docs">\n${groups.join("\n")}\n</nav>`;
}

function pager(page) {
  const position = pages.indexOf(page);
  const links = [];
  const previous = pages[position - 1];
  const next = pages[position + 1];
  if (previous) links.push(`<a class="pager-previous" rel="prev" href="${relativeUrl(page.path, previous.path)}"><span>Previous</span> ${escapeHtml(previous.label)}</a>`);
  if (next) links.push(`<a class="pager-next" rel="next" href="${relativeUrl(page.path, next.path)}"><span>Next</span> ${escapeHtml(next.label)}</a>`);
  return `<nav class="pager" aria-label="Previous and next page">\n${links.join("\n")}\n</nav>`;
}

function renderDocument(page, markdown, record) {
  if (page.plain) {
    return { title: page.title, html: `<h1>${escapeHtml(page.title)}</h1>\n<pre class="plain-text">${escapeHtml(markdown.trim())}</pre>`, headings: [] };
  }
  const options = {
    link(href, html, title) {
      const target = resolveLink(href, page.source, page.path, record.commit);
      return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</a>`;
    },
    heading({ level, id, html, text }) {
      if (level === 1) return `<h1 id="${id}">${html}</h1>`;
      return `<div class="heading"><h${level} id="${id}">${html}</h${level}><a class="anchor" href="#${id}" aria-label="${escapeHtml(`Permalink: ${text}`)}">#</a></div>`;
    },
    code({ language, text }) {
      const code = `<pre class="code"${language ? ` data-language="${escapeHtml(language)}"` : ""}><code>${escapeHtml(text)}</code></pre>`;
      if (language !== "mermaid") return code;
      const rendered = githubUrl("blob", record.commit, page.source);
      return `<figure class="diagram">\n${code}\n<figcaption>Mermaid diagram source. <a href="${rendered}">View the rendered diagram on GitHub</a>.</figcaption>\n</figure>`;
    },
  };
  const { html, headings } = renderMarkdown(markdown, options);
  const titles = headings.filter((heading) => heading.level === 1);
  if (titles.length === 1) return { title: titles[0].text, html, headings };
  // Upstream documents without their own title get the catalogue's.
  if (titles.length === 0 && page.title) return { title: page.title, html: `<h1>${escapeHtml(page.title)}</h1>\n${html}`, headings };
  throw new Error(`${page.source} needs exactly one level-1 heading, or a title in scripts/catalogue.mjs.`);
}

function documentPage(page, markdown, record) {
  const { title, html, headings } = renderDocument(page, markdown, record);
  const outline = headings.filter((heading) => heading.level === 2);
  const contents = outline.length >= 3
    ? `<details class="toc">\n<summary>On this page</summary>\n<ul>\n${outline.map((heading) => `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`).join("\n")}\n</ul>\n</details>`
    : "";
  const source = `<p class="doc-source">Source: <a href="${githubUrl("blob", record.commit, page.source)}"><code>${escapeHtml(page.source)}</code> at <code>${record.commit.slice(0, 7)}</code></a>. <a href="${upstream.url}/blob/main/${page.source}">Latest version on GitHub</a>.</p>`;
  const breadcrumb = page.path === "docs/"
    ? ""
    : `<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="${relativeUrl(page.path, "docs/")}">Docs</a></li><li>${escapeHtml(page.section)}</li></ol></nav>\n`;
  const article = `${breadcrumb}${html.replace("</h1>", `</h1>\n${contents}`)}`;
  const body = `<div class="container docs-layout">\n${docsNavigation(page.path)}\n<article class="doc">\n${article}\n<footer class="doc-footer">\n${source}\n${pager(page)}\n</footer>\n</article>\n</div>`;
  const description = page.path === "docs/" ? "Stainless documentation for users and contributors." : `${title}: Stainless documentation.`;
  return { title, body, description };
}

async function write(path, contents) {
  const file = join(output, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents);
}

export async function build() {
  const record = await readVendor(root);
  await readProvenance(root, record);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const home = await readFile(join(root, "src/home.html"), "utf8");
  await write("index.html", layout({ path: "", title: site.name, description: site.description, body: home, record }));
  const missing = await readFile(join(root, "src/404.html"), "utf8");
  await write("404.html", layout({ path: "404/", title: "Page not found", description: "This page doesn't exist.", body: missing, base: "/", record, index: false }));

  for (const page of pages) {
    const markdown = await readFile(join(root, "vendor/stainless", page.source), "utf8");
    const { title, body, description } = documentPage(page, markdown, record);
    await write(join(page.path, "index.html"), layout({ path: page.path, title, description, body, record }));
  }

  const urls = ["", ...pages.map((page) => page.path)].map((path) => `  <url><loc>${site.origin}/${path}</loc></url>`);
  await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
  await cp(join(root, "assets"), join(output, "assets"), { recursive: true, filter: (file) => !file.endsWith("provenance.json") });
  for (const file of publicFiles) await cp(join(root, file), join(output, file));
  return { record, pages: pages.length + 2 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { record, pages: count } = await build();
    console.log(`Built ${count} pages from ${upstream.repository}@${record.commit.slice(0, 7)} into dist/.`);
  } catch (error) {
    console.error("Build failed:", error.message);
    process.exitCode = 1;
  }
}
