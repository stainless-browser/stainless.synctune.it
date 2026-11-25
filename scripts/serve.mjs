// Serves dist/ on http://127.0.0.1:8080 for a local preview. Run the build first.
// Usage: node scripts/serve.mjs [port]
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.argv[2] ?? 8080);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8" };

async function resolve(pathname) {
  const path = normalize(join(root, decodeURIComponent(pathname)));
  if (!path.startsWith(root)) return null;
  const info = await stat(path).catch(() => null);
  if (info?.isFile()) return path;
  if (info?.isDirectory()) return pathname.endsWith("/") ? resolve(`${pathname}index.html`) : { redirect: `${pathname}/` };
  return null;
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");
  const found = await resolve(pathname);
  if (found?.redirect) {
    response.writeHead(301, { Location: found.redirect }).end();
    return;
  }
  const file = found ?? join(root, "404.html");
  response.writeHead(found ? 200 : 404, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).on("error", () => response.end()).pipe(response);
})
  .on("error", (error) => {
    console.error(error.code === "EADDRINUSE" ? `Port ${port} is in use. Pass another port: node scripts/serve.mjs 8081` : `Preview server failed: ${error.message}`);
    process.exitCode = 1;
  })
  .listen(port, "127.0.0.1", () => console.log(`Previewing dist/ at http://127.0.0.1:${port}/ (Ctrl+C to stop)`));
