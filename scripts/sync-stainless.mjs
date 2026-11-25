// Copies the Stainless documents this site publishes from a local Stainless checkout at one
// commit, unchanged, and records the commit and checksums in vendor/stainless/SOURCE.json.
// Usage: node scripts/sync-stainless.mjs --source /absolute/path/to/stainless [--ref main]
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandingSources, upstream, vendoredDocuments } from "./catalogue.mjs";
import { sha256 } from "./vendor.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const usage = "Usage: node scripts/sync-stainless.mjs --source /absolute/path/to/stainless [--ref main]";

function options(argv) {
  const values = { ref: "HEAD" };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!["--source", "--ref"].includes(key) || !argv[index + 1]) throw new Error(usage);
    values[key.slice(2)] = argv[index + 1];
  }
  if (!values.source || !isAbsolute(values.source)) throw new Error(`${usage}\nMissing or relative --source.`);
  return values;
}

let staged;
try {
  const { source, ref } = options(process.argv.slice(2));
  const git = (...args) => execFileSync("git", ["-C", source, ...args], { maxBuffer: 1 << 26 });
  const commit = git("rev-parse", "--verify", `${ref}^{commit}`).toString().trim();
  const committedAt = git("show", "-s", "--format=%cI", commit).toString().trim();
  const file = (path) => git("show", `${commit}:${path}`);
  const { product } = JSON.parse(file("chromium/manifest.json").toString());

  const upstreamDocs = git("ls-tree", "--name-only", commit, "docs/").toString().split("\n").filter((path) => path.endsWith(".md"));
  const uncatalogued = upstreamDocs.filter((path) => !vendoredDocuments.includes(path));
  if (uncatalogued.length) throw new Error(`Add these upstream docs to scripts/catalogue.mjs first:\n${uncatalogued.join("\n")}`);

  staged = await mkdtemp(join(root, ".vendor-sync-"));
  const documents = {};
  for (const path of vendoredDocuments) {
    const bytes = file(path);
    await mkdir(dirname(join(staged, path)), { recursive: true });
    await writeFile(join(staged, path), bytes);
    documents[path] = sha256(bytes);
  }
  const branding = Object.fromEntries(brandingSources.map((path) => [path, sha256(file(path))]));
  const record = { repository: upstream.repository, ref, commit, committedAt, version: product.version, documents, branding };
  await writeFile(join(staged, "SOURCE.json"), `${JSON.stringify(record, null, 2)}\n`);

  const target = join(root, "vendor/stainless");
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await rename(staged, target);
  staged = undefined;
  console.log(`Synced ${vendoredDocuments.length} documents from ${upstream.repository}@${commit.slice(0, 7)} (${product.version}).`);

  const provenance = JSON.parse(await readFile(join(root, "assets/provenance.json"), "utf8"));
  const stale = Object.entries(provenance.files).filter(([, entry]) => branding[entry.source] !== entry.sourceSha256).map(([name]) => name);
  if (stale.length) console.warn(`The upstream artwork changed. Export these assets again (docs/maintenance.md): ${stale.join(", ")}`);
} catch (error) {
  console.error("Stainless sync failed:", error.message);
  process.exitCode = 1;
} finally {
  if (staged) await rm(staged, { recursive: true, force: true });
}
