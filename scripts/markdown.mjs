// A small GitHub-flavored Markdown renderer for the vendored Stainless docs, using no packages.
// It covers the syntax those docs use: ATX headings with GitHub-compatible ids, paragraphs,
// fenced code, nested ordered, bullet and task lists, block quotes, pipe tables, thematic
// breaks, code spans, emphasis, strikethrough, links, images (rendered as links) and
// autolinks. Raw HTML is always escaped, never passed through.

const htmlEscapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (char) => htmlEscapes[char]);

const textEntities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
export const htmlToText = (html) => html.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => textEntities[entity]);

// Same ids as GitHub's heading anchors (github-slugger): lowercase, drop punctuation,
// spaces to hyphens, and number repeated slugs.
export function createSlugger() {
  const occurrences = new Map();
  return (text) => {
    const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
    let slug = base;
    while (occurrences.has(slug)) {
      occurrences.set(base, occurrences.get(base) + 1);
      slug = `${base}-${occurrences.get(base)}`;
    }
    occurrences.set(slug, 0);
    return slug;
  };
}

const patterns = {
  blank: /^[ \t]*$/,
  fence: /^( {0,3})(`{3,}|~{3,})[ \t]*([^`]*?)[ \t]*$/,
  heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  thematicBreak: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  quote: /^ {0,3}> ?/,
  listItem: /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/,
  tableDelimiter: /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/,
};

const expandTabs = (line) => line.replace(/^\t+/, (tabs) => "    ".repeat(tabs.length));
const indentOf = (line) => line.match(/^ */)[0].length;

function listMarker(line) {
  const match = patterns.listItem.exec(line);
  if (!match) return null;
  const [, indent, marker, spacing, rest] = match;
  const ordered = /\d/.test(marker);
  const gap = rest === "" ? 1 : spacing.length > 4 ? 1 : spacing.length;
  return {
    ordered,
    bullet: ordered ? marker.at(-1) : marker,
    start: ordered ? Number.parseInt(marker, 10) : 1,
    contentIndent: indent.length + marker.length + gap,
    first: rest === "" ? "" : " ".repeat(Math.max(0, spacing.length - gap)) + rest,
    empty: rest === "",
  };
}

// True when the line starts a block that ends an open paragraph.
function interruptsParagraph(line) {
  if (patterns.fence.test(line) || patterns.heading.test(line) || patterns.quote.test(line)) return true;
  if (patterns.thematicBreak.test(line)) return true;
  const marker = listMarker(line);
  return Boolean(marker && !marker.empty && (!marker.ordered || marker.start === 1));
}

const splitRow = (line) => {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
};

function parseBlocks(lines) {
  const blocks = [];
  let sawBlank = false;
  const push = (block) => {
    block.blankBefore = sawBlank && blocks.length > 0;
    sawBlank = false;
    blocks.push(block);
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (patterns.blank.test(line)) {
      sawBlank = true;
      index += 1;
      continue;
    }

    const fence = patterns.fence.exec(line);
    if (fence) {
      const [, indent, marker, info] = fence;
      const body = [];
      index += 1;
      while (index < lines.length) {
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[index]);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) {
          index += 1;
          break;
        }
        body.push(lines[index].replace(new RegExp(`^ {0,${indent.length}}`), ""));
        index += 1;
      }
      push({ type: "code", language: info.split(/\s+/)[0], text: body.join("\n") });
      continue;
    }

    const heading = patterns.heading.exec(line);
    if (heading) {
      push({ type: "heading", level: heading[1].length, text: (heading[2] ?? "").trim() });
      index += 1;
      continue;
    }

    if (patterns.thematicBreak.test(line)) {
      push({ type: "rule" });
      index += 1;
      continue;
    }

    if (patterns.quote.test(line)) {
      const inner = [];
      while (index < lines.length && !patterns.blank.test(lines[index])) {
        const current = lines[index];
        if (patterns.quote.test(current)) inner.push(current.replace(patterns.quote, ""));
        else if (inner.length && !interruptsParagraph(current)) inner.push(current);
        else break;
        index += 1;
      }
      push({ type: "quote", children: parseBlocks(inner) });
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && patterns.tableDelimiter.test(lines[index + 1]) && lines[index + 1].includes("-")) {
      const header = splitRow(line);
      const align = splitRow(lines[index + 1]).map((cell) => {
        if (cell.startsWith(":") && cell.endsWith(":")) return "center";
        if (cell.endsWith(":")) return "right";
        if (cell.startsWith(":")) return "left";
        return "";
      });
      if (align.length === header.length) {
        const rows = [];
        index += 2;
        while (index < lines.length && !patterns.blank.test(lines[index]) && !interruptsParagraph(lines[index])) {
          const cells = splitRow(lines[index]);
          rows.push(header.map((_, column) => cells[column] ?? ""));
          index += 1;
        }
        push({ type: "table", header, align, rows });
        continue;
      }
    }

    let current = listMarker(line);
    if (current) {
      const list = { type: "list", ordered: current.ordered, start: current.start, loose: false, items: [] };
      while (current) {
        const body = [current.first];
        let inFence = patterns.fence.test(current.first);
        let lazy = !current.empty && !inFence;
        index += 1;
        while (index < lines.length) {
          const next = lines[index];
          if (patterns.blank.test(next)) {
            body.push("");
            lazy = false;
          } else if (indentOf(next) >= current.contentIndent) {
            const content = next.slice(current.contentIndent);
            if (patterns.fence.test(content)) inFence = !inFence;
            body.push(content);
            lazy = !inFence;
          } else if (lazy && !interruptsParagraph(next) && !listMarker(next)) {
            body.push(next.trimStart());
          } else {
            break;
          }
          index += 1;
        }
        // Trailing blank lines belong to whatever follows the item.
        while (body.length > 1 && body.at(-1) === "") {
          body.pop();
          index -= 1;
        }
        const item = { task: null, children: [] };
        const task = /^\[([ xX])\][ \t]+/.exec(body[0]);
        if (task) {
          item.task = task[1] !== " ";
          body[0] = body[0].slice(task[0].length);
        }
        item.children = parseBlocks(body);
        if (item.children.some((child) => child.blankBefore)) list.loose = true;
        list.items.push(item);

        let next = index;
        while (next < lines.length && patterns.blank.test(lines[next])) next += 1;
        const following = next < lines.length && indentOf(lines[next]) < 4 ? listMarker(lines[next]) : null;
        if (!following || following.ordered !== list.ordered || following.bullet !== current.bullet) break;
        if (next > index) list.loose = true;
        index = next;
        current = following;
      }
      push(list);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && !patterns.blank.test(lines[index]) && !interruptsParagraph(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    push({ type: "paragraph", text: paragraph.map((text) => text.trim()).join("\n") });
  }
  return blocks;
}

// Finds the closing bracket for the "[" at `start`, honoring nesting, escapes and code spans.
function closingBracket(text, start) {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") index += 1;
    else if (char === "[") depth += 1;
    else if (char === "]" && --depth === 0) return index;
  }
  return -1;
}

// Parses "(destination "title")" at `start`; returns the destination, title and end index.
function linkTarget(text, start) {
  if (text[start] !== "(") return null;
  let index = start + 1;
  while (/[ \t\n]/.test(text[index] ?? "")) index += 1;
  let destination = "";
  if (text[index] === "<") {
    const end = text.indexOf(">", index);
    if (end < 0) return null;
    destination = text.slice(index + 1, end);
    index = end + 1;
  } else {
    let depth = 0;
    while (index < text.length) {
      const char = text[index];
      if (char === "\\" && index + 1 < text.length) {
        destination += text[index + 1];
        index += 2;
        continue;
      }
      if (/[ \t\n]/.test(char)) break;
      if (char === "(") depth += 1;
      if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
      destination += char;
      index += 1;
    }
  }
  while (/[ \t\n]/.test(text[index] ?? "")) index += 1;
  let title = null;
  const quote = { '"': '"', "'": "'", "(": ")" }[text[index]];
  if (quote) {
    const end = text.indexOf(quote, index + 1);
    if (end < 0) return null;
    title = text.slice(index + 1, end);
    index = end + 1;
    while (/[ \t\n]/.test(text[index] ?? "")) index += 1;
  }
  if (text[index] !== ")") return null;
  return { destination, title, end: index + 1 };
}

export function renderInline(source, options) {
  const tokens = [];
  const hold = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  // Escapes plain text and applies emphasis; held tokens pass through untouched.
  const format = (value) => {
    let html = escapeHtml(value);
    html = html.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, (match, marker, body, offset, whole) => {
      if (marker === "__" && (/\w/.test(whole[offset - 1] ?? "") || /\w/.test(whole[offset + match.length] ?? ""))) return match;
      return `<strong>${body}</strong>`;
    });
    html = html.replace(/(^|[^*\w])\*(?=[^\s*])([^*]*?[^\s*])\*(?![*\w])/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/g, "$1<em>$2</em>");
    return html.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  };
  let text = source;

  // Code spans first, so nothing inside them is interpreted.
  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, ticks, code) => {
    let body = code.replace(/\n/g, " ");
    if (/^ [\s\S]*[^ ][\s\S]* $/.test(body)) body = body.slice(1, -1);
    return hold(`<code>${escapeHtml(body)}</code>`);
  });
  text = text.replace(/\\([!-/:-@[-`{-~])/g, (_, char) => hold(escapeHtml(char)));
  text = text.replace(/\\\n/g, () => hold("<br>\n"));
  text = text.replace(/ {2,}\n/g, () => hold("<br>\n"));
  text = text.replace(/<((?:https?|mailto):[^\s<>]+)>/g, (_, url) => hold(options.link(url, escapeHtml(url), null, {})));

  let output = "";
  let index = 0;
  while (index < text.length) {
    const image = text[index] === "!" && text[index + 1] === "[";
    const open = image ? index + 1 : index;
    if (text[open] === "[") {
      const close = closingBracket(text, open);
      const target = close > 0 ? linkTarget(text, close + 1) : null;
      if (target) {
        const label = text.slice(open + 1, close);
        const html = image ? escapeHtml(htmlToText(restore(label, tokens))) || "Image" : format(label);
        output += hold(options.link(target.destination, html, target.title, { image }));
        index = target.end;
        continue;
      }
    }
    output += text[index];
    index += 1;
  }
  text = output.replace(/(^|[\s(])(https?:\/\/[^\s<\u0000]*[^\s<\u0000.,:;"')\]*_~?!])/g, (_, before, url) => before + hold(options.link(url, escapeHtml(url), null, {})));
  return restore(format(text), tokens);
}

function restore(text, tokens) {
  let output = text;
  while (/\u0000\d+\u0000/.test(output)) output = output.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
  return output;
}

function renderBlocks(blocks, options, state, tight = false) {
  return blocks.map((block) => {
    switch (block.type) {
      case "heading": {
        const html = renderInline(block.text, options);
        const text = htmlToText(html).trim();
        const id = state.slug(text);
        state.headings.push({ level: block.level, id, text, html });
        return options.heading({ level: block.level, id, html, text });
      }
      case "paragraph": {
        const html = renderInline(block.text, options);
        return tight ? html : `<p>${html}</p>`;
      }
      case "code":
        return options.code(block);
      case "rule":
        return "<hr>";
      case "quote":
        return `<blockquote>\n${renderBlocks(block.children, options, state)}\n</blockquote>`;
      case "table": {
        const cell = (tag, value, column) => {
          const align = block.align[column] ? ` class="align-${block.align[column]}"` : "";
          return `<${tag}${tag === "th" ? ' scope="col"' : ""}${align}>${renderInline(value, options)}</${tag}>`;
        };
        const head = `<thead>\n<tr>${block.header.map((value, column) => cell("th", value, column)).join("")}</tr>\n</thead>`;
        const body = block.rows.length ? `\n<tbody>\n${block.rows.map((row) => `<tr>${row.map((value, column) => cell("td", value, column)).join("")}</tr>`).join("\n")}\n</tbody>` : "";
        const label = state.headings.at(-1)?.text ?? state.title ?? "Table";
        return `<div class="table-scroll" role="region" aria-label="${escapeHtml(`Table: ${label}`)}" tabindex="0">\n<table>\n${head}${body}\n</table>\n</div>`;
      }
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
        const tasks = block.items.some((item) => item.task !== null);
        const items = block.items.map((item) => {
          const body = renderBlocks(item.children, options, state, !block.loose);
          if (item.task === null) return `<li>${body}</li>`;
          const box = item.task ? '<span class="task-state" role="img" aria-label="Done">☑</span> ' : '<span class="task-state" role="img" aria-label="Not done">☐</span> ';
          return `<li class="task">${box}${body}</li>`;
        });
        return `<${tag}${start}${tasks ? ' class="tasks"' : ""}>\n${items.join("\n")}\n</${tag}>`;
      }
      default:
        throw new Error(`Unknown block type ${block.type}`);
    }
  }).join("\n");
}

const defaults = {
  link: (href, html, title) => `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</a>`,
  heading: ({ level, id, html }) => `<h${level} id="${id}">${html}</h${level}>`,
  code: ({ language, text }) => `<pre${language ? ` data-language="${escapeHtml(language)}"` : ""}><code>${escapeHtml(text)}</code></pre>`,
};

// Renders a Markdown document. Returns the HTML and the headings it contains.
export function renderMarkdown(markdown, overrides = {}) {
  const options = { ...defaults, ...overrides };
  const state = { slug: createSlugger(), headings: [], title: overrides.title };
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n").map(expandTabs);
  const html = renderBlocks(parseBlocks(lines), options, state);
  return { html, headings: state.headings };
}
