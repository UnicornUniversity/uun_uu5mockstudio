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
export async function saveAttachments(projectDir, items) {
  if (!Array.isArray(items) || !items.length) return [];
  if (items.length > MAX_FILES) throw new Error(`You can attach at most ${MAX_FILES} images at a time.`);
  // validate everything first: a bad item must not leave the good ones behind
  const bufs = items.map((it) => {
    const ext = EXT[it?.mime];
    if (!ext) throw new Error(`Unsupported image type: ${it?.mime}`);
    const buf = Buffer.from(String(it.data ?? ""), "base64");
    if (!buf.length) throw new Error("The image is empty.");
    if (buf.length > MAX_BYTES) throw new Error("The image is larger than 10 MB.");
    if (sniff(buf) !== it.mime) throw new Error("The file content does not match the image type.");
    return { buf, ext };
  });
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
