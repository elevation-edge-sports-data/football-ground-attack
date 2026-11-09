#!/usr/bin/env node
/**
 * Pack the 3D scene and pose editor for GitHub Pages.
 *
 * docs/r3f.html is the field. docs/pose-editor.html is the same bundle with
 * the editor forced on. docs/formation-library.html is that bundle with the
 * formation library forced on. docs/replay-viewer.html opens the replay viewer.
 * Does not write docs/index.html and does not touch
 * the canvas game (index.html, game.js, field.js, styles.css) or dist/.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist-pages");
const docs = join(root, "docs");
const viteBin = join(root, "node_modules/vite/bin/vite.js");

function run() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteBin, "build", "--config", "vite.pages.config.ts"], {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pages build exited ${code}`));
    });
  });
}

function escapeScript(js) {
  return js.replace(/<\/script/gi, "<\\/script");
}

function page(title, js, rootAttrs = "") {
  const attrs = rootAttrs ? ` ${rootAttrs}` : "";
  return `<!DOCTYPE html>
<html lang="en"${attrs}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&display=swap" rel="stylesheet" />
  <style>
    html, body, #root {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #1c3144;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
${escapeScript(js)}
  </script>
</body>
</html>
`;
}

await run();

const files = readdirSync(dist);
const jsName = files.find((f) => f === "r3f.js") ?? files.find((f) => f.endsWith(".js"));
if (!jsName) throw new Error("pack-pages: no JS bundle in dist-pages");
const jsFiles = files.filter((f) => f.endsWith(".js"));
if (jsFiles.length !== 1) {
  throw new Error(`pack-pages: expected one JS file, found ${jsFiles.join(", ")}`);
}
const stray = files.filter((f) => /\.(png|jpe?g|gif|webp|svg|wasm|css)$/i.test(f));
if (stray.length) {
  throw new Error(`pack-pages: assets were not inlined: ${stray.join(", ")}`);
}

const js = readFileSync(join(dist, jsName), "utf8");
if (/\bimport\.meta\b/.test(js)) {
  throw new Error("pack-pages: bundle still contains import.meta, which a classic script cannot run");
}

mkdirSync(docs, { recursive: true });
const scene = page("Football Ground Attack", js);
const editor = page("Pose Editor", js, 'data-pose-editor="1"');
const library = page("Formation Library", js, 'data-formation-library="1"');
const replay = page("Replay Viewer", js, 'data-replay-viewer="1"');
writeFileSync(join(docs, "r3f.html"), scene);
writeFileSync(join(docs, "pose-editor.html"), editor);
writeFileSync(join(docs, "formation-library.html"), library);
writeFileSync(join(docs, "replay-viewer.html"), replay);
writeFileSync(join(docs, ".nojekyll"), "");

console.log(`wrote docs/r3f.html (${Buffer.byteLength(scene)} bytes)`);
console.log(`wrote docs/pose-editor.html (${Buffer.byteLength(editor)} bytes)`);
console.log(`wrote docs/formation-library.html (${Buffer.byteLength(library)} bytes)`);
console.log(`wrote docs/replay-viewer.html (${Buffer.byteLength(replay)} bytes)`);
console.log("wrote docs/.nojekyll");
