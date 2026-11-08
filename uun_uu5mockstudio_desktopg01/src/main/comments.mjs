/**
 * Comments on a screen: each one is anchored to a component (its name and text), has an author, a status (open / resolved) and replies.
 * They live next to the screen as `<screen>.comments.json`, so they travel with the project (ZIP export, a shared folder) like the notes do.
 * The app is desktop-only: people exchange the project as files, there is no server; the author is the name set in the app (or the system user).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const commentPath = (projectDir, file) => {
  if (!String(file).endsWith(".html")) throw new Error("Not a screen.");
  return path.join(projectDir, `${String(file).slice(0, -5)}.comments.json`);
};
const clip = (v, n) => String(v ?? "").slice(0, n);
export const defaultAuthor = () => { try { return os.userInfo().username || "me"; } catch { return "me"; } };
export const newCommentId = (taken = []) => { let id; do id = `c${Math.random().toString(36).slice(2, 7)}`; while (taken.includes(id)); return id; };

/** A comment of a file, cleaned: unknown fields dropped, texts clipped, bad entries removed. */
export function cleanComment(c) {
  if (!c || typeof c !== "object" || !String(c.text ?? "").trim()) return null;
  return {
    id: clip(c.id, 24) || newCommentId(),
    author: clip(c.author, 60) || "me",
    created: Number.isFinite(c.created) ? c.created : Date.now(),
    target: { name: clip(c.target?.name, 120), text: clip(c.target?.text, 160), ...(Number.isInteger(c.target?.ordinal) ? { ordinal: c.target.ordinal } : {}) },
    text: clip(c.text, 4000).trim(),
    status: c.status === "resolved" ? "resolved" : "open",
    ...(c.status === "resolved" && c.resolvedBy ? { resolvedBy: clip(c.resolvedBy, 60) } : {}),
    replies: (Array.isArray(c.replies) ? c.replies : []).filter((r) => r && String(r.text ?? "").trim()).slice(0, 100).map((r) => ({ author: clip(r.author, 60) || "me", created: Number.isFinite(r.created) ? r.created : Date.now(), text: clip(r.text, 4000).trim() })),
  };
}

export async function readComments(projectDir, file) {
  try {
    const raw = JSON.parse(await fs.promises.readFile(commentPath(projectDir, file), "utf8"));
    return (Array.isArray(raw) ? raw : []).map(cleanComment).filter(Boolean);
  } catch { return []; }
}
export async function writeComments(projectDir, file, list) {
  const p = commentPath(projectDir, file), clean = list.map(cleanComment).filter(Boolean);
  if (!clean.length) { await fs.promises.rm(p, { force: true }); return []; }
  await fs.promises.writeFile(p, `${JSON.stringify(clean, null, 2)}\n`);
  return clean;
}

/** The operations of the dialog on one screen's comments; each returns the new list. */
export async function changeComments(projectDir, file, op, { author = defaultAuthor() } = {}) {
  const list = await readComments(projectDir, file), by = (id) => list.find((c) => c.id === id);
  if (op.type === "add") list.push({ id: newCommentId(list.map((c) => c.id)), author, created: Date.now(), target: op.target ?? {}, text: op.text, status: "open", replies: [] });
  else if (op.type === "reply") { const c = by(op.id); if (!c) throw new Error("No such comment."); c.replies.push({ author, created: Date.now(), text: op.text }); }
  else if (op.type === "resolve") { const c = by(op.id); if (!c) throw new Error("No such comment."); c.status = "resolved"; c.resolvedBy = author; }
  else if (op.type === "reopen") { const c = by(op.id); if (!c) throw new Error("No such comment."); c.status = "open"; delete c.resolvedBy; }
  else if (op.type === "delete") { const i = list.findIndex((c) => c.id === op.id); if (i < 0) throw new Error("No such comment."); list.splice(i, 1); }
  else throw new Error("Unknown operation.");
  return writeComments(projectDir, file, list);
}

export const screensWithComments = (projectDir) => fs.readdirSync(projectDir).filter((f) => f.endsWith(".comments.json")).map((f) => `${f.slice(0, -14)}.html`);
export const countOpen = (list) => list.filter((c) => c.status === "open").length;
