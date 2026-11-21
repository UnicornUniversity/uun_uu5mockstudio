import { readFile, readdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { findAssets, zipEntry } from "./assets.mjs";

export const SERVE = `// Minimal static server for the exported mockups (Node 18+, no dependencies).
// uu5 mockups need http://, not file://:  node serve.mjs
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4321;
http.createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(root, rel === "/" ? "/index.html" : rel);
    if (!file.startsWith(root + path.sep)) throw new Error("outside");
    const data = await readFile(file); // read first: a missing file must not leave a half-sent 200
    res.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end("Not found"); }
}).listen(port, () => console.log("Mockups: http://localhost:" + port + "/"));
`;

const readme = (files) => `# uu5 mockups

Exported from uu5Mock Studio (${files.length} screens).

    node serve.mjs

Then open http://localhost:4321/ (override the port with PORT=...).

- Mockups load uu5 and uuGDS from the plus4u CDN, so an internet connection is needed.
  Offline use works inside uu5Mock Studio (offline mode + CDN cache).
- Opening the .html files directly via file:// does not work with uu5.
`;

const indexHtml = (files) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>uu5 mockups</title>
<style>body{font:15px system-ui;margin:40px auto;max-width:560px}a{display:block;padding:8px 0}</style></head><body>
<h1>Mockups</h1>${files.map((f) => `<a href="mockups/${encodeURIComponent(f)}">${f.replace(/\.html$/, "")}</a>`).join("")}</body></html>`;

export const listMockups = async (projectDir) => (await readdir(projectDir)).filter((f) => f.endsWith(".html")).sort();

export async function exportHtml(projectDir, file, dest) {
  const name = path.basename(file);
  if (!name.endsWith(".html")) throw new Error("Only .html mockups can be exported.");
  await copyFile(path.join(projectDir, name), dest);
  return dest;
}

/**
 * The mockups with the pictures they use, as files of a folder where the screens lie side by side with assets/:
 * { files, entries: { "<screen>.html" | "<asset path>": Uint8Array }, assets }. Shared by the ZIP export and the handoff package.
 */
export async function mockupEntries(projectDir) {
  const files = await listMockups(projectDir);
  const entries = {}, texts = {};
  for (const f of files) texts[f] = await readFile(path.join(projectDir, f), "utf8");
  // pictures and videos the screens use: those the user put into the design (logo...) live in assets/, others are found by their
  // references (also the pictures of read documents, .studio/sources/assets)
  const used = await findAssets(projectDir, Object.values(texts));
  // a reference that would not work from the copy (an absolute path of the preview server) is rewritten to the file's place in it
  const rewrite = used.filter((a) => a.ref !== a.zipPath && (a.ref.startsWith("/") || a.rel.startsWith(".studio/")));
  for (const f of files) {
    let t = texts[f];
    for (const a of rewrite) t = t.split(a.ref).join(a.zipPath);
    entries[f] = strToU8(t);
  }
  for (const a of used) entries[a.zipPath] = await zipEntry(a.file);
  const assets = path.join(projectDir, "assets");
  for (const f of await readdir(assets).catch(() => [])) {
    if (f.startsWith(".") || entries[`assets/${f}`]) continue;
    const e = await zipEntry(path.join(assets, f)).catch(() => null); // a sub-folder is not a file
    if (e) entries[`assets/${f}`] = e;
  }
  return { files, entries, assets: used.length };
}

/** The project memory that travels with the mocks: description, business rules and the notes and comments of the screens: { name: Uint8Array }. */
export async function docEntries(projectDir) {
  const out = {};
  for (const f of (await readdir(projectDir)).filter((n) => n === "BUSINESS_RULES.md" || n === "PROJECT.md" || n.endsWith(".notes.md") || n.endsWith(".comments.json"))) out[f] = new Uint8Array(await readFile(path.join(projectDir, f)));
  return out;
}

export async function exportZip(projectDir, dest) {
  const { files, entries: mocks, assets } = await mockupEntries(projectDir);
  if (!files.length) throw new Error("There is no mockup to export.");
  const entries = {
    "README.md": strToU8(readme(files)),
    "serve.mjs": strToU8(SERVE),
    "index.html": strToU8(indexHtml(files)),
  };
  for (const [k, v] of Object.entries(mocks)) entries[`mockups/${k}`] = v; // the mockups sit in mockups/, the pictures beside them
  for (const [k, v] of Object.entries(await docEntries(projectDir))) entries[`docs/${k}`] = v;
  await writeFile(dest, zipSync(entries, { level: 6 }));
  return { dest, files: files.length, assets };
}
