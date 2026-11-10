import fs from "node:fs";
import path from "node:path";
import { normalizeSitemap, serializeSitemap } from "../renderer/sitemap.js";

/** The sitemap of a project (its pages and how they relate) is one file, <project>/sitemap.json; the one before the last replacement is kept in .studio/sitemap.prev.json. */
export const SITEMAP_FILE = "sitemap.json";
const PREV = path.join(".studio", "sitemap.prev.json");
const MAX_BYTES = 1_000_000;

const read = async (f) => { try { return normalizeSitemap(JSON.parse(await fs.promises.readFile(f, "utf8"))); } catch { return null; } };

/** { sitemap, hasPrev } or null when the project has no (valid) sitemap. */
export async function readSitemap(projectDir) {
  const sitemap = await read(path.join(projectDir, SITEMAP_FILE));
  if (!sitemap) return null;
  return { sitemap, hasPrev: Boolean(await read(path.join(projectDir, PREV))) };
}

/** Writes the sitemap (normalized). `backup`: the file it replaces is kept so that the replacement can be taken back. Returns the sitemap as written. */
export async function writeSitemap(projectDir, sitemap, { backup = false } = {}) {
  const sm = normalizeSitemap(sitemap);
  if (!sm) throw new Error("The sitemap has no pages.");
  const text = serializeSitemap(sm) + "\n";
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error("The sitemap is too big.");
  const file = path.join(projectDir, SITEMAP_FILE);
  if (backup) {
    const old = await fs.promises.readFile(file, "utf8").catch(() => null);
    if (old) { await fs.promises.mkdir(path.join(projectDir, ".studio"), { recursive: true }); await fs.promises.writeFile(path.join(projectDir, PREV), old); }
  }
  await fs.promises.writeFile(file, text);
  return sm;
}

/** Takes the last replacement back: the kept version becomes the sitemap (and the one replaced is kept, so that it can be taken back again). Returns the result or null. */
export async function restoreSitemap(projectDir) {
  const prev = await read(path.join(projectDir, PREV)); if (!prev) return null;
  const cur = await fs.promises.readFile(path.join(projectDir, SITEMAP_FILE), "utf8").catch(() => null);
  await fs.promises.writeFile(path.join(projectDir, SITEMAP_FILE), serializeSitemap(prev) + "\n");
  if (cur) await fs.promises.writeFile(path.join(projectDir, PREV), cur);
  return readSitemap(projectDir);
}
