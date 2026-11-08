import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";

/** Pictures, videos and sounds a screen may point to. */
export const MEDIA_EXT = "png|jpe?g|gif|webp|avif|svg|bmp|ico|mp4|webm|mov|m4v|ogv|mp3|wav|ogg|m4a";
const REF = new RegExp(`(?:^|[\\s"'\`(=,>])([^\\s"'\`()<>,\\\\]*?\\.(?:${MEDIA_EXT}))(?=[?#\\s"'\`)<>,\\\\]|$)`, "gi");
const PACKED = /\.(?:png|jpe?g|gif|webp|avif|mp4|webm|mov|m4v|ogv|mp3|ogg|m4a)$/i; // already compressed: stored as they are
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** The raw references to local media files in a text (HTML or uu5String), each once. Remote links and data: URLs are not local. */
export function mediaRefs(text) {
  const out = new Set();
  for (const m of String(text).matchAll(REF)) if (!REMOTE.test(m[1])) out.add(m[1]);
  return [...out];
}

/** `raw` → the path inside the project (posix, no leading slash), or null when it leaves the project or points into a private folder. */
export function projectRelative(raw, projectName) {
  let p;
  try { p = decodeURIComponent(raw); } catch { p = raw; }
  p = p.split(/[?#]/)[0].replace(/\\/g, "/");
  const segs = [];
  for (const s of p.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") { if (!segs.length) return null; segs.pop(); continue; }
    segs.push(s);
  }
  if (p.startsWith("/") && segs[0] === projectName) segs.shift(); // the preview server serves the project under /<name>/
  if (!segs.length) return null;
  const hidden = segs.slice(0, -1).filter((s) => s.startsWith("."));
  if (hidden.length && segs.slice(0, 3).join("/") !== ".studio/sources/assets") return null; // .studio/ stays private, except the pictures of read documents
  if (segs[segs.length - 1].startsWith(".")) return null;
  return segs.join("/");
}

/**
 * The local media files the texts point to: [{ ref, rel, file, zipPath }]. `ref` is how a text writes it, `rel` the path in the
 * project, `zipPath` where it goes in an export (a picture of a read document, from .studio/sources/assets, goes to assets/sources).
 */
export async function findAssets(projectDir, texts) {
  const root = await realpath(projectDir), name = path.basename(projectDir), seen = new Map();
  for (const t of texts) {
    for (const ref of mediaRefs(t)) {
      if (seen.has(ref)) continue;
      const rel = projectRelative(ref, name);
      if (!rel) continue;
      try {
        const file = await realpath(path.join(projectDir, rel));
        if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) continue;
        const zipPath = rel.startsWith(".studio/") ? `assets/sources/${path.basename(rel)}` : rel;
        seen.set(ref, { ref, rel, file, zipPath });
      } catch { /* a link to a file that does not exist: nothing to bring */ }
    }
  }
  return [...seen.values()];
}

/** Zip entry for a file: media that is already compressed is stored. */
export async function zipEntry(file) {
  const data = new Uint8Array(await readFile(file));
  return PACKED.test(file) ? [data, { level: 0 }] : data;
}

const assetsReadme = (name, assets) => `# Files of ${name}

The uu5String refers to these files of the mockup. A document does not have them: upload each file to the document (or to a place
that serves it) and change the address in the uu5String to its new address.

${assets.map((a) => `- ${a.ref} → ${a.zipPath}`).join("\n")}
`;

/**
 * The files a uu5String refers to, as a ZIP at `dest` (README.md with the list, the files under the paths the text writes them with
 * where that is possible). Returns the number of files, or 0 when there is none (nothing is written).
 */
export async function writeUu5Assets(projectDir, text, dest, name = "screen") {
  const assets = await findAssets(projectDir, [text]);
  if (!assets.length) return 0;
  const entries = { "README.md": strToU8(assetsReadme(name, assets)) };
  for (const a of assets) entries[a.zipPath] = await zipEntry(a.file);
  await writeFile(dest, zipSync(entries, { level: 6 }));
  return assets.length;
}
