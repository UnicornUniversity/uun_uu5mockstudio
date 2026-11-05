import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Templates for a new project: App (uu5Uve), Route (uu5Route), Component (form, list, detail, dashboard, ...) or Page (a content page
 * made of uu5Bricks that is copied as uu5String into a document: portal, landing page, product detail, ...).
 * A template is a folder: `template.json` (manifest), `TEMPLATE.md` (instructions for the agent) and the starter `*.html` file(s).
 * Sources, later ones win by id: built-in < installed plugins < mine (a folder of the user).
 */

export const LEVELS = ["app", "route", "component", "page"];
export const LEVEL_LABELS = { app: "Application", route: "Route", component: "Component", page: "Page" };
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
 * Puts a template into a project as a reference for the agent, not as screens: the starter files go to `.studio/template/files/` with the
 * manifest and the instructions next to them. The agent writes the screens the user asked for (named after them) from that example, so
 * the canvas never shows the sample screen of the template (a "Product detail" template asked for a course page used to leave a
 * product.html next to the course page). Returns { starter: [file names] }.
 */
export async function applyTemplate(t, projectDir) {
  const meta = path.join(projectDir, ".studio", "template"), files = path.join(meta, "files");
  await fs.rm(files, { recursive: true, force: true });
  await fs.mkdir(files, { recursive: true });
  for (const f of t.files) await fs.writeFile(path.join(files, f.name), f.html);
  const { files: list, instructions, dir, ...manifest } = t;
  const starter = list.map((f) => f.name);
  await fs.writeFile(path.join(meta, "template.json"), JSON.stringify({ ...manifest, files: starter, starterDir: ".studio/template/files", appliedAt: new Date().toISOString() }, null, 2));
  await fs.writeFile(path.join(meta, "TEMPLATE.md"), instructions || `# ${t.title}\n\nNo instructions were given with this template: use the starter files as the base and ask the user what is missing.\n`);
  return { starter };
}

/** What the agent must get right on each level, whatever the instructions of a particular template say. */
const LEVEL_RULES = {
  app: "This is an application (uu5Uve): it consists of several routes with one shared shell. Every route has its own route header (RouteHeader with a title naming the subject of the page, and an ActionGroup with the actions of that route), the same simulated Top and the same local navigation; never leave the placeholder header, title or actions, and never use Plus4U5App.Top or PositionBar. Follow the mockup-route-layout skill when it is available.",
  page: "This is a Page: a content page that the user copies as uu5String (Copy as uu5String) into a document such as a uuBookKit page or a uuManagementKit portal. Build it only from components of the Bricks libraries (Uu5Bricks, Uu5RichTextBricks, Uu5ImagingBricks, Uu5ChartsBricks, Uu5TilesBricks, Uu5CodeKitBricks …) and plain HTML for text; look every component and prop up in the uu5bricks-knowledge skill before you use it (do not take props from Uu5Elements: the Bricks are a different generation). No state, no event handlers, no components of your own with logic and no className styling: they do not survive the uu5String; put the data straight into the props. No simulated Top, RouteHeader or app shell. Every library used needs its entry in uu5DemoDependencies and an `import * as Name from \"package\"` line.",
  route: "This is one route (uu5Route): keep the simulated Top and give it a real route header (RouteHeader with a title naming the subject of the page, and an ActionGroup with the actions of the route: main actions first, overflow actions collapsed); never leave the placeholder header, title or actions, and never use Plus4U5App.Top or PositionBar. Follow the mockup-route-layout skill when it is available.",
};

/** The part of the system prompt about the template a project was started from. */
export function templatePrompt(meta) {
  if (!meta?.id) return "";
  const files = (meta.files ?? []).join(", ");
  const where = meta.starterDir ?? ".studio/template/files";
  return [
    `This project was started from the ${LEVEL_LABELS[meta.level] ?? meta.level} template "${meta.title}" (${meta.id}).`,
    `Its instructions are in .studio/template/TEMPLATE.md and its starter files (${files}) in ${where}/: read them first. They are a worked example, not screens of this project.`,
    "Build exactly what the user asked for, starting from the example: write each screen of the request directly into the project folder under a kebab-case name that says what it is (for a course page course-detail.html, not the name of the starter file), keep the head, the libraries, the structure and the conventions of the example, and replace its sample content with the user's subject. Never copy the example unchanged into the project and never leave a screen with the template's sample content; if the request needs fewer or other parts than the example, leave them out or add them.",
    LEVEL_RULES[meta.level] ?? "",
  ].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- my templates: made from screens of a project

/** The kinds offered when a template is saved (they choose the icon of the chip). */
export const KINDS = ["form", "list", "detail", "dashboard", "portal", "landing", "home", "product", "article", "report"];

/** A kebab-case id from a title ("Course detail" -> "course-detail"), "" when nothing is left. */
export function slugify(title) {
  return String(title ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");
}

/** The level a template made of these screens probably has: several screens an application, Bricks only a Page, a route header a Route, else a Component. */
export function guessLevel(htmls) {
  const list = [].concat(htmls ?? []).map(String);
  if (list.length > 1) return "app";
  const html = list[0] ?? "";
  const libs = new Set([...html.matchAll(/<\/?((?:Uu5|Plus4U5)\w*)\./g)].map((m) => m[1]));
  if (libs.size && [...libs].every((l) => /Bricks$/.test(l))) return "page";
  if (/RouteHeader/.test(html)) return "route";
  return "component";
}

/**
 * TEMPLATE.md of a template made from screens: the author's instructions, then what the screens were made under (the business rules of the
 * project and the notes of the screens), so that the conventions travel with the template.
 */
export function buildInstructions({ title, description = "", instructions = "", rules = "", notes = [], createdFrom = "" }) {
  const parts = [`# ${title}`, ""];
  if (description.trim()) parts.push(description.trim(), "");
  parts.push("The starter files are a worked example: write the screens the user asks for from them (names of their own, the user's subject), keep the head, the libraries, the structure and the conventions where they fit.", "");
  if (instructions.trim()) parts.push("## Instructions", "", instructions.trim(), "");
  const r = String(rules).replace(/^#\s*Business rules\s*\n+(Rules, constraints[^\n]*\n+)?/i, "").replace(/^(#{1,5}) /gm, "#$1 ").trim(); // its headings go one level down
  if (r) parts.push("## Rules of the project it was made in", "", "Follow them where they still apply to the new request.", "", r, "");
  const ns = notes.filter((n) => n?.text?.trim());
  if (ns.length) parts.push("## Notes on the screens", "", ...ns.map((n) => `- ${n.screen}: ${n.text.trim().replace(/\n+/g, " ")}`), "");
  if (createdFrom) parts.push(`_Made from ${createdFrom}._`, "");
  return parts.join("\n");
}

/**
 * Writes a template folder `<root>/<id>`: template.json, TEMPLATE.md and the screens (`files`: [{ name, html }]). The same checks as
 * `parseTemplate`. An existing template of that id is replaced only with `overwrite`; otherwise -> { exists: true }. -> { id, dir }.
 */
export async function saveTemplate(root, t, { overwrite = false } = {}) {
  if (!String(t.title ?? "").trim()) throw new Error("The template needs a title.");
  const id = String(t.id ?? slugify(t.title));
  if (!ID_RE.test(id)) throw new Error("The id must be kebab-case (a-z, 0-9, -).");
  if (!LEVELS.includes(t.level)) throw new Error(`The level must be one of ${LEVELS.join(", ")}.`);
  const files = t.files ?? [];
  if (!files.length) throw new Error("Choose at least one screen.");
  if (files.length > MAX_FILES) throw new Error(`At most ${MAX_FILES} screens.`);
  for (const f of files) {
    if (!FILE_RE.test(f.name)) throw new Error(`Unsafe file name ${f.name}.`);
    if (Buffer.byteLength(String(f.html)) > MAX_FILE) throw new Error(`${f.name} is bigger than ${MAX_FILE / 1024} KB.`);
  }
  const dir = path.join(root, id);
  if (existsSync(dir) && !overwrite) return { exists: true, id, dir };
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  for (const f of files) await fs.writeFile(path.join(dir, f.name), String(f.html));
  const manifest = {
    id, title: clip(t.title, 80).trim(), level: t.level, ...(t.kind ? { kind: clip(t.kind, 40), icon: clip(t.kind, 40) } : {}),
    description: clip(t.description, 300), prompt: clip(t.prompt, 400), order: 50, files: files.map((f) => f.name),
    ...(t.createdFrom ? { createdFrom: clip(t.createdFrom, 200) } : {}), createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(dir, "template.json"), JSON.stringify(manifest, null, 2) + "\n");
  await fs.writeFile(path.join(dir, "TEMPLATE.md"), String(t.instructions ?? "").slice(0, MAX_INSTRUCTIONS));
  return { id, dir };
}

/** The folder of one of my templates (only a direct sub-folder of `root` that holds a template.json), or null. */
export function mineDir(root, id) {
  if (!ID_RE.test(String(id))) return null;
  const dir = path.join(root, String(id));
  return existsSync(path.join(dir, "template.json")) ? dir : null;
}

/** Deletes one of my templates. */
export async function removeTemplate(root, id) {
  const dir = mineDir(root, id);
  if (!dir) throw new Error("That template is not one of yours.");
  await fs.rm(dir, { recursive: true, force: true });
  return { id };
}

/** One of my templates for editing: the manifest and the whole TEMPLATE.md. */
export async function readMine(root, id) {
  const dir = mineDir(root, id);
  if (!dir) throw new Error("That template is not one of yours.");
  const r = await parseTemplate(dir, "mine");
  if (r.error) throw new Error(r.error);
  const markdown = r.template.hasInstructions ? await fs.readFile(path.join(dir, "TEMPLATE.md"), "utf8") : "";
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "template.json"), "utf8"));
  const { dir: _d, ...t } = r.template;
  return { ...t, createdFrom: manifest.createdFrom ?? "", markdown };
}
