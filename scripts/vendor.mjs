import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brandingSources, upstream, vendoredDocuments } from "./catalogue.mjs";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sameList = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

// Reads vendor/stainless/SOURCE.json and proves the vendored files are complete and unedited.
export async function readVendor(root) {
  const record = JSON.parse(await readFile(join(root, "vendor/stainless/SOURCE.json"), "utf8"));
  if (record.repository !== upstream.repository || !/^[0-9a-f]{40}$/.test(record.commit ?? "")) {
    throw new Error("vendor/stainless/SOURCE.json needs the upstream repository and full source commit.");
  }
  if (typeof record.version !== "string" || !record.version || Number.isNaN(Date.parse(record.committedAt))) {
    throw new Error("vendor/stainless/SOURCE.json needs the source version and commit date.");
  }
  if (!sameList(Object.keys(record.documents ?? {}), vendoredDocuments)) {
    throw new Error("vendor/stainless/SOURCE.json doesn't match scripts/catalogue.mjs. Run the sync (see docs/maintenance.md).");
  }
  if (!sameList(Object.keys(record.branding ?? {}), brandingSources)) {
    throw new Error("vendor/stainless/SOURCE.json doesn't record the upstream brand artwork. Run the sync.");
  }
  for (const [file, hash] of Object.entries(record.documents)) {
    if (sha256(await readFile(join(root, "vendor/stainless", file))) !== hash) {
      throw new Error(`vendor/stainless/${file} differs from the recorded source. Change it upstream and sync again.`);
    }
  }
  return record;
}

// Reads assets/provenance.json and proves each derived image matches the pinned upstream artwork.
export async function readProvenance(root, record) {
  const provenance = JSON.parse(await readFile(join(root, "assets/provenance.json"), "utf8"));
  for (const [file, entry] of Object.entries(provenance.files ?? {})) {
    if (record.branding[entry.source] !== entry.sourceSha256) {
      throw new Error(`assets/${file} was exported from different ${entry.source} artwork than the pinned source. Export it again.`);
    }
    if (sha256(await readFile(join(root, "assets", file))) !== entry.sha256) {
      throw new Error(`assets/${file} doesn't match assets/provenance.json.`);
    }
  }
  return provenance;
}
