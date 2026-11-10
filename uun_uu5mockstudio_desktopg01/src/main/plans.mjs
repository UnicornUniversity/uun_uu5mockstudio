import fs from "node:fs";
import path from "node:path";
import { STATUSES, isSlug, slugify, parsePlan, serializePlan, planTitle, withStatus } from "../renderer/planDoc.js";

/** Plans are Markdown files in <project>/plans/<slug>.md: a small front matter (title, status, created) and the text. The file is the source of truth. */
export const PLANS_DIR = "plans";
const MAX_BYTES = 1_000_000;
export { STATUSES, isSlug, slugify, parsePlan, serializePlan, planTitle, withStatus };

const file = (projectDir, slug) => {
  if (!isSlug(slug)) throw new Error("Invalid plan name.");
  return path.join(projectDir, PLANS_DIR, `${slug}.md`);
};

export async function listPlans(projectDir) {
  let names = [];
  try { names = await fs.promises.readdir(path.join(projectDir, PLANS_DIR)); } catch { return []; }
  const out = [];
  for (const n of names) {
    const slug = n.replace(/\.md$/, "");
    if (!n.endsWith(".md") || !isSlug(slug)) continue;
    try {
      const f = path.join(projectDir, PLANS_DIR, n), p = parsePlan(await fs.promises.readFile(f, "utf8"));
      const heading = p.body.match(/^#{1,6}\s+(.+)$/m)?.[1].trim(), generic = !p.meta.title || /^plan$/i.test(p.meta.title);
      out.push({ slug, title: generic ? heading || p.meta.title || slug : p.meta.title, status: p.meta.status ?? "draft", created: p.meta.created ?? "", mtime: (await fs.promises.stat(f)).mtimeMs });
    } catch { /* unreadable: skipped */ }
  }
  // plans with the same title are told apart: by the date they were made, and when that is the same too, by the name of the file
  const groups = new Map();
  for (const x of out) groups.set(x.title, [...(groups.get(x.title) ?? []), x]);
  for (const [t, g] of groups) if (g.length > 1) { const byDate = new Set(g.map((x) => x.created)).size === g.length && g.every((x) => x.created); for (const x of g) x.title = `${t} (${byDate ? x.created : x.slug})`; }
  return out.sort((a, b) => a.created.localeCompare(b.created) || a.slug.localeCompare(b.slug));
}

export async function readPlan(projectDir, slug) {
  const text = await fs.promises.readFile(file(projectDir, slug), "utf8");
  const p = parsePlan(text);
  return { slug, text, meta: p.meta, body: p.body, title: planTitle(p, slug), status: p.meta.status ?? "draft" };
}

/** Writes the whole text of an existing plan (the editor of the card). */
export async function writePlan(projectDir, slug, text) {
  if (Buffer.byteLength(String(text)) > MAX_BYTES) throw new Error("The plan is too long.");
  const f = file(projectDir, slug);
  await fs.promises.access(f);
  await fs.promises.writeFile(f, String(text));
}

/** A new plan, or (with `slug` of an existing one) a new version of it. `markdown` may carry its own front matter. Returns { slug, created }. */
export async function savePlan(projectDir, { slug, title, markdown, status, today = new Date().toISOString().slice(0, 10) }) {
  if (Buffer.byteLength(String(markdown ?? "")) > MAX_BYTES) throw new Error("The plan is too long.");
  const p = parsePlan(markdown);
  if (slug && !isSlug(slug)) throw new Error("Invalid plan name.");
  await fs.promises.mkdir(path.join(projectDir, PLANS_DIR), { recursive: true });
  const exists = (s) => fs.promises.access(file(projectDir, s)).then(() => true, () => false);
  const heading = p.body.match(/^#{1,6}\s+(.+)$/m)?.[1].trim();
  let use = slug, existing = false, prev = {};
  if (slug) { existing = await exists(slug); if (existing) prev = parsePlan(await fs.promises.readFile(file(projectDir, slug), "utf8")).meta; }
  else { use = slugify(title || p.meta.title || heading || "Plan"); const base = use; for (let i = 2; await exists(use); i++) use = `${base}-${i}`; }
  const name = title || p.meta.title || prev.title || heading || "Plan"; // an update without a title keeps the title the plan has
  const meta = { ...p.meta, title: name, status: status ?? p.meta.status ?? prev.status ?? "draft", created: prev.created ?? p.meta.created ?? today };
  await fs.promises.writeFile(file(projectDir, use), serializePlan({ meta, body: p.body }));
  return { slug: use, created: !existing };
}

/** Moves a plan to the trash of the system (`trash`) or deletes it. */
export async function removePlan(projectDir, slug, { trash } = {}) {
  const f = file(projectDir, slug);
  await fs.promises.access(f);
  if (trash) await trash(f); else await fs.promises.rm(f);
}
