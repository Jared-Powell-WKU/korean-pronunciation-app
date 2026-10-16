// Copies the shared code from the Chrome extension into this web app and builds
// index.html from the extension's popup.html. Run after changing the extension:
//   node tools/sync.mjs
// Files owned by the web app (platform.js, web.css, sw.js, manifest.webmanifest,
// icons/) are never overwritten.
import { cpSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ext = resolve(process.argv[2] || join(app, "..", "korean-pronunciation-extension"));
if (!existsSync(join(ext, "manifest.json"))) {
  console.error(`Extension not found at ${ext}. Pass its folder: node tools/sync.mjs <path>`);
  process.exit(1);
}

const SHARED = ["app.js", "cards.js", "conjugate.js", "extract.js", "srs.js", "translate.js", "popup.css"];
for (const f of SHARED) cpSync(join(ext, f), join(app, f));
cpSync(join(ext, "lib"), join(app, "lib"), { recursive: true });

// index.html = popup.html + phone/PWA additions.
let html = readFileSync(join(ext, "popup.html"), "utf8");
const replace = (from, to) => {
  if (!html.includes(from)) throw new Error(`popup.html changed; update tools/sync.mjs (missing: ${from})`);
  html = html.replace(from, to);
};
replace('<link rel="stylesheet" href="popup.css">', `<link rel="stylesheet" href="popup.css">
  <link rel="stylesheet" href="web.css">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icons/icon-192.png">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <meta name="theme-color" content="#2563eb">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Korean">`);
replace("📷 <b>Paste a screenshot</b> (Ctrl+V)<br>", "📷 <b>Take a photo or pick a screenshot</b><br>");
replace('or drop an image here, or <a href="#" id="pick">choose a file</a>',
  '<a href="#" id="pick">Tap here</a> to use the camera or your photos (or paste / drop an image)');
replace("</body>", `  <script>
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      // When an updated version installs, reload once so it's used right away.
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) location.reload(); });
      navigator.serviceWorker.register("sw.js");
    }
  </script>
</body>`);
writeFileSync(join(app, "index.html"), html);

// Bump the service worker cache version so installed copies update.
const hash = createHash("sha1");
for (const f of [...SHARED, "index.html", "platform.js", "web.css"]) hash.update(readFileSync(join(app, f)));
const sw = join(app, "sw.js");
writeFileSync(sw, readFileSync(sw, "utf8").replace(/const VERSION = ".*?";/, `const VERSION = "${hash.digest("hex").slice(0, 10)}";`));

console.log(`Synced ${SHARED.length} files + lib/ from ${ext}`);
