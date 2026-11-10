/** The pure part of the plan files (front matter, slugs, status): shared by the main process (plans.mjs) and the canvas cards of the renderer. */
export const STATUSES = ["draft", "approved", "built", "discarded"];
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;

export const isSlug = (s) => typeof s === "string" && SLUG.test(s);

/** A file-name-safe slug from a title (accents dropped); "plan" when nothing is left. */
export function slugify(title) {
  const s = String(title ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
  return s || "plan";
}

/** { meta: { title, status, created, … }, body } from the text of a plan; a text without front matter is all body. */
export function parsePlan(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) { const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/); if (kv) meta[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1"); }
  return { meta, body: src.slice(m[0].length) };
}

export function serializePlan({ meta = {}, body = "" }) {
  const lines = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}: ${String(v).replace(/\r?\n/g, " ")}`);
  return `---\n${lines.join("\n")}\n---\n${String(body).replace(/^\n+/, "")}`;
}

/** The title of a plan: the front matter, else the first heading, else the slug. */
export function planTitle({ meta, body }, slug = "") {
  return meta.title || body.match(/^#{1,6}\s+(.+)$/m)?.[1].trim() || slug;
}

/** The same text with another status (front matter created when missing). */
export function withStatus(text, status) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
  const p = parsePlan(text);
  return serializePlan({ meta: { ...p.meta, status }, body: p.body });
}
