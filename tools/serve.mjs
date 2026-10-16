// Minimal static server for trying the app on this computer or a phone on the same Wi-Fi:
//   node tools/serve.mjs [port]
// Note: phones only allow the microphone (🎤 Say it), offline mode and "Install app"
// on https:// pages, so for everyday phone use deploy the folder (see README).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2]) || 8080;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png",
  ".svg": "image/svg+xml", ".wasm": "application/wasm", ".gz": "application/gzip",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(root, path.endsWith("/") ? path + "index.html" : path));
  if (!file.startsWith(root) || file.includes(`${join(root, "tools")}`)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, () => {
  console.log(`Korean Pronunciation app: http://localhost:${port}`);
  for (const nets of Object.values(networkInterfaces())) {
    for (const n of nets || []) if (n.family === "IPv4" && !n.internal) console.log(`  on your phone (same Wi-Fi): http://${n.address}:${port}`);
  }
});
