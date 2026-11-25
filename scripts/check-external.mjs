// Requests every external URL the built site links to. Needs network access, so it runs in
// its own CI job and on a schedule rather than in the offline checks. Run the build first.
import { fileURLToPath } from "node:url";
import { checkSite } from "./check.mjs";

const directory = fileURLToPath(new URL("../dist/", import.meta.url));
const timeout = 20_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function status(url) {
  for (let attempt = 1; ; attempt += 1) {
    let code;
    for (const method of ["HEAD", "GET"]) {
      const response = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(timeout), headers: { "User-Agent": "stainless.synctune.it link check" } });
      await response.body?.cancel();
      code = response.status;
      if (method === "HEAD" && [403, 404, 405, 501].includes(code)) continue;
      if ((code === 429 || code >= 500) && attempt < 4) {
        const wait = Math.min(Number(response.headers.get("retry-after")) || 5 * attempt, 60);
        await sleep(wait * 1000);
        code = undefined;
      }
      break;
    }
    if (code !== undefined) return code;
  }
}

try {
  const { externals } = await checkSite(directory);
  const urls = [...externals.keys()].sort();
  const failures = [];
  for (let index = 0; index < urls.length; index += 4) {
    await Promise.all(urls.slice(index, index + 4).map(async (url) => {
      let result;
      try {
        result = await status(url);
      } catch (error) {
        result = error.cause?.code ?? error.name;
      }
      if (typeof result === "number" && result >= 200 && result < 400) return;
      failures.push(`${url} returned ${result} (linked from ${externals.get(url).slice(0, 3).join(", ")})`);
    }));
  }
  if (failures.length) {
    console.error(`External link check failed for ${failures.length} of ${urls.length} URLs:\n${failures.sort().join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`All ${urls.length} external URLs responded.`);
  }
} catch (error) {
  console.error("External link check failed:", error.code === "ENOENT" ? "dist/ is missing. Run node scripts/build.mjs first." : error.message);
  process.exitCode = 1;
}
