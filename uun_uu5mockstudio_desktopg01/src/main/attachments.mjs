import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_FILES = 8, MAX_BYTES = 10 * 1024 * 1024;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** Magic numbers: the declared type has to match the bytes, so junk cannot be written as an "image". */
export function sniff(buf) {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 6 && buf.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  if (buf.length > 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Stores images the user attached to a chat message as files in <project>/.studio/attachments (hidden, not served,
 * not a screen) so the agent can open them with its Read tool. File names are generated here, never taken from input.
 * items: [{ mime, data (base64) }] -> absolute paths.
 */
/**
 * SVG is text that can carry script, so it is only accepted for assets (a picture placed into the design), and only when it
 * is a plain drawing: an <svg> root and no script, event handler, javascript: link, foreignObject or external reference.
 */
export function checkSvg(buf) {
  const t = buf.toString("utf8");
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?<svg[\s>]/i.test(t)) throw new Error("The file is not a valid SVG.");
  if (/<\s*(?:script|foreignObject|iframe|object|embed)\b|\son\w+\s*=|javascript:|<!ENTITY|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:text)/i.test(t)) throw new Error("The SVG contains script or an external reference, so it cannot be used.");
}

const validate = (items, { svg = false } = {}) => {
  if (items.length > MAX_FILES) throw new Error(`You can attach at most ${MAX_FILES} images at a time.`);
  // validate everything first: a bad item must not leave the good ones behind
  return items.map((it) => {
    const ext = svg && it?.mime === "image/svg+xml" ? "svg" : EXT[it?.mime];
    if (!ext) throw new Error(`Unsupported image type: ${it?.mime}`);
    const buf = Buffer.from(String(it.data ?? ""), "base64");
    if (!buf.length) throw new Error("The image is empty.");
    if (buf.length > MAX_BYTES) throw new Error("The image is larger than 10 MB.");
    if (ext === "svg") checkSvg(buf);
    else if (sniff(buf) !== it.mime) throw new Error("The file content does not match the image type.");
    return { buf, ext, name: it.name };
  });
};

export async function saveAttachments(projectDir, items) {
  if (!Array.isArray(items) || !items.length) return [];
  const bufs = validate(items);
  const dir = path.join(projectDir, ".studio", "attachments");
  await mkdir(dir, { recursive: true });
  const out = [];
  for (const { buf, ext } of bufs) {
    const file = path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`);
    await writeFile(file, buf);
    out.push(file);
  }
  return out;
}

/** A safe file stem from the name the user's file had ("My Logo (2).png" -> "my-logo-2"). */
export const assetStem = (name) => String(name ?? "").split(/[\\/]/).pop().replace(/\.[^.]*$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";

/**
 * Images the user wants USED in the design (a logo, a specific picture), not just looked at: unlike the screenshots they
 * become a normal, served part of the project, <project>/assets/<name>.<ext>, which a screen refers to as
 * `assets/<name>.<ext>`. The app writes them, so the agent never has to copy a file. Names come from the file name,
 * cleaned, and never overwrite an earlier asset. items: [{ mime, data (base64), name }] -> relative paths.
 */
export async function saveAssets(projectDir, items) {
  if (!Array.isArray(items) || !items.length) return [];
  const bufs = validate(items, { svg: true });
  const dir = path.join(projectDir, "assets");
  await mkdir(dir, { recursive: true });
  const out = [];
  for (const { buf, ext, name } of bufs) {
    const stem = assetStem(name);
    let n = 1, file;
    for (;;) { // wx: never overwrite what is already there
      file = `${stem}${n > 1 ? `-${n}` : ""}.${ext}`;
      try { await writeFile(path.join(dir, file), buf, { flag: "wx" }); break; } catch (e) { if (e.code !== "EEXIST") throw e; n++; }
    }
    out.push(`assets/${file}`);
  }
  return out;
}
