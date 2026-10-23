import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Templates for a new project: App (uu5Uve), Route (uu5Route) or Component (form, list, detail, dashboard, ...).
 * A template is a folder: `template.json` (manifest), `TEMPLATE.md` (instructions for the agent) and the starter `*.html` file(s).
 * Sources, later ones win by id: built-in < installed plugins < mine (a folder of the user).
 */

export const LEVELS = ["app", "route", "component"];
export const LEVEL_LABELS = { app: "Application", route: "Route", component: "Component" };
const MAX_FILE = 512 * 1024, MAX_INSTRUCTIONS = 64 * 1024, MAX_FILES = 24;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/, FILE_RE = /^[\w][\w.-]{0,100}\.html$/;
const clip = (v, n) => String(v ?? "").slice(0, n);

/** Reads one template folder: { template } or { error }. Nothing outside the folder is read; symbolic links and big files are refused. */
export async function parseTemplate(dir, source = "mine") {
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(dir, "template.json"), "utf8")); } catch (e) { return { error: `${path.basename(dir)}: template.json is missing or not valid JSON` }; }
  const id = clip(manifest.id ?? path.basename(dir), 64);
  const bad = (m) => ({ error: `${id || path.basename(dir)}: ${m}` });
  if (!ID_RE.test(id)) return bad("the id must be kebab-case (a-z, 0-9, -)");
  if (!LEVELS.includes(manifest.level)) return bad(`level must be one of ${LEVELS.join(", ")}`);
  if (!manifest.title || typeof manifest.title !== "string") return bad("the title is missing");
  let names = Array.isArray(manifest.files) ? manifest.files.map(String) : (await fs.readdir(dir)).filter((n) => n.endsWith(".html")).sort();
  if (!names.length) return bad("it has no starter .html file");
  if (names.length > MAX_FILES) return bad(`too many files (max ${MAX_FILES})`);
  for (const n of names) {
    if (!FILE_RE.test(n)) return bad(`unsafe file name ${n}`);
    const st = await fs.lstat(path.join(dir, n)).catch(() => null);
    if (!st || !st.isFile()) return bad(`${n} is missing or is not a plain file`);
    if (st.size > MAX_FILE) return bad(`${n} is bigger than ${MAX_FILE / 1024} KB`);
  }
  const hasInstructions = Boolean(await fs.lstat(path.join(dir, "TEMPLATE.md")).then((s) => s.isFile()).catch(() => false));
  return {
    template: {
      id, source, dir, level: manifest.level, kind: manifest.kind ? clip(manifest.kind, 40) : null, title: clip(manifest.title, 80),
      description: clip(manifest.description, 300), icon: manifest.icon ? clip(manifest.icon, 40) : null, prompt: clip(manifest.prompt, 400),
      order: Number.isFinite(manifest.order) ? manifest.order : 50, tags: Array.isArray(manifest.tags) ? manifest.tags.slice(0, 12).map((t) => clip(t, 30)) : [],
      files: names, hasInstructions,
    },
  };
}

/** Every template folder directly inside `dir`: { templates, errors }. */
export async function loadSource(dir, source) {
  const out = { templates: [], errors: [] };
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const r = await parseTemplate(path.join(dir, e.name), source);
    if (r.template) out.templates.push(r.template); else out.errors.push(r.error);
  }
  return out;
}

/** Templates of installed Claude Code plugins: `templates/<id>/template.json`, and the plain skeletons of uu5-mockup's create-mockup skill (as components). */
export async function loadPlugins({ pluginsFile = path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json") } = {}) {
  const out = { templates: [], errors: [] };
  let reg = {};
  try { reg = JSON.parse(readFileSync(pluginsFile, "utf8")).plugins ?? {}; } catch { return out; }
  for (const [key, installs] of Object.entries(reg)) {
    const name = key.split("@")[0], inst = [...(installs ?? [])].reverse().find((i) => i.installPath && existsSync(i.installPath));
    if (!inst) continue;
    const source = `plugin:${name}`;
    const a = await loadSource(path.join(inst.installPath, "templates"), source);
    out.templates.push(...a.templates); out.errors.push(...a.errors);
    const legacy = path.join(inst.installPath, "skills", "create-mockup", "assets", "templates");
    if (name === "uu5-mockup" && existsSync(legacy)) {
      for (const f of (await fs.readdir(legacy)).filter((n) => FILE_RE.test(n)).sort()) {
        const base = f.replace(/\.html$/, ""), st = await fs.lstat(path.join(legacy, f));
        if (!st.isFile() || st.size > MAX_FILE) continue;
        const title = /<title>([^<]*)<\/title>/i.exec(await fs.readFile(path.join(legacy, f), "utf8"))?.[1]?.trim() || base;
        out.templates.push({ id: `uu5-mockup-${base}`, source, dir: legacy, level: "component", kind: base, title: clip(title.replace(/^UuMockupKit\s+/i, "").replace(/\s+Template$/i, ""), 80), description: `The ${base} skeleton of the uu5-mockup plugin.`, icon: null, prompt: "", order: 90, tags: [], files: [f], hasInstructions: false, legacy: true });
      }
    }
  }
  return out;
}

/** The templates of all sources: a later list wins over an earlier one by id; sorted by level, order, title. */
export function mergeSources(lists) {
  const byId = new Map();
  for (const list of lists) for (const t of list) byId.set(t.id, t);
  const rank = (t) => LEVELS.indexOf(t.level);
  const covered = new Set([...byId.values()].filter((t) => !t.legacy).map((t) => `${t.level}/${t.kind}`)); // a bare skeleton of a plugin is only offered where nothing better exists
  return [...byId.values()].filter((t) => !t.legacy || !covered.has(`${t.level}/${t.kind}`)).sort((a, b) => rank(a) - rank(b) || a.order - b.order || a.title.localeCompare(b.title, "en"));
}

/** A template with its starter files and instructions read (for applying it to a project). */
export async function readTemplate(t) {
  const files = [];
  for (const name of t.files) {
    if (!FILE_RE.test(name)) throw new Error(`Unsafe file name ${name}.`);
    files.push({ name, html: await fs.readFile(path.join(t.dir, name), "utf8") });
  }
  const instructions = t.hasInstructions ? (await fs.readFile(path.join(t.dir, "TEMPLATE.md"), "utf8")).slice(0, MAX_INSTRUCTIONS) : "";
  return { ...t, files, instructions };
}

/**
 * Puts a template into a project: the starter files next to the screens (an existing file is never overwritten) and the manifest with
 * the instructions into `.studio/template/` (the agent reads them there). Returns { written, skipped }.
 */
export async function applyTemplate(t, projectDir) {
  const written = [], skipped = [];
  for (const f of t.files) {
    const dest = path.join(projectDir, f.name);
    if (existsSync(dest)) { skipped.push(f.name); continue; }
    await fs.writeFile(dest, f.html); written.push(f.name);
  }
  const meta = path.join(projectDir, ".studio", "template");
  await fs.mkdir(meta, { recursive: true });
  const { files, instructions, dir, ...manifest } = t;
  await fs.writeFile(path.join(meta, "template.json"), JSON.stringify({ ...manifest, files: files.map((f) => f.name), written, appliedAt: new Date().toISOString() }, null, 2));
  await fs.writeFile(path.join(meta, "TEMPLATE.md"), instructions || `# ${t.title}\n\nNo instructions were given with this template: use the starter files as the base and ask the user what is missing.\n`);
  return { written, skipped };
}

/** What the agent must get right on each level, whatever the instructions of a particular template say. */
const LEVEL_RULES = {
  app: "This is an application (uu5Uve): it consists of several routes with one shared shell. Every route has its own route header (RouteHeader with a title naming the subject of the page, and an ActionGroup with the actions of that route), the same simulated Top and the same local navigation; never leave the placeholder header, title or actions, and never use Plus4U5App.Top or PositionBar. Follow the mockup-route-layout skill when it is available.",
  route: "This is one route (uu5Route): keep the simulated Top and give it a real route header (RouteHeader with a title naming the subject of the page, and an ActionGroup with the actions of the route: main actions first, overflow actions collapsed); never leave the placeholder header, title or actions, and never use Plus4U5App.Top or PositionBar. Follow the mockup-route-layout skill when it is available.",
};

/** The part of the system prompt about the template a project was started from. */
export function templatePrompt(meta) {
  if (!meta?.id) return "";
  const files = (meta.written?.length ? meta.written : meta.files ?? []).join(", ");
  return [
    `This project was started from the ${LEVEL_LABELS[meta.level] ?? meta.level} template "${meta.title}" (${meta.id}).`,
    `Its starter files are: ${files}. Its instructions are in .studio/template/TEMPLATE.md: read them first.`,
    "Build the user's request by changing the starter files (keep their structure, shell and conventions), not from scratch. Rename the files after the real screens when the instructions say so.",
    LEVEL_RULES[meta.level] ?? "",
  ].filter(Boolean).join(" ");
}
