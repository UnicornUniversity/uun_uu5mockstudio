import fs from "node:fs";
import path from "node:path";
import { PROJECT_FILE, setProjectText, setScreenText, extractFromRules } from "../renderer/projectDoc.js";

/** Project memory kept as plain Markdown next to the screens: BUSINESS_RULES.md (project-wide) and <screen>.notes.md (per screen). */
export const RULES_FILE = "BUSINESS_RULES.md";
export const TEMPLATE = `# Business rules

Rules, constraints and decisions that came up while designing the screens of this project. Maintained by Claude and by hand; later tasks that build the target components read this file.

## General

`;

const read = async (p) => { try { return await fs.promises.readFile(p, "utf8"); } catch { return ""; } };

export const readRules = (projectDir) => read(path.join(projectDir, RULES_FILE));
export async function writeRules(projectDir, text) { await fs.promises.writeFile(path.join(projectDir, RULES_FILE), text); }

// ---------------------------------------------------------------- PROJECT.md: the description of the project and of its screens (not a business rule)
export const readProject = (projectDir) => read(path.join(projectDir, PROJECT_FILE));
export async function writeProject(projectDir, text) { await fs.promises.writeFile(path.join(projectDir, PROJECT_FILE), text); }
/** Earlier versions kept descriptions inside BUSINESS_RULES.md: move them into PROJECT.md once (only when there is no PROJECT.md yet). */
export async function migrateDescriptions(projectDir) {
  if (fs.existsSync(path.join(projectDir, PROJECT_FILE))) return false;
  const moved = extractFromRules(await readRules(projectDir));
  if (!moved) return false;
  let md = moved.project ? setProjectText("", moved.project) : "";
  for (const [name, text] of Object.entries(moved.screens)) md = setScreenText(md, name, text);
  await writeProject(projectDir, md); await writeRules(projectDir, moved.rules);
  return true;
}

/** `R-012` style id following the highest one in the text (`G-nnn` for the rules of all projects). */
export function nextRuleId(text, prefix = "R") {
  const max = [...String(text).matchAll(new RegExp(`\\b${prefix}-(\\d{1,6})\\b`, "g"))].reduce((m, x) => Math.max(m, Number(x[1])), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/** Adds `- R-nnn text` to the section of the screen (or General); the section is created when missing. Returns the new content and the id. */
export async function appendRule(projectDir, text, screen) {
  const before = (await readRules(projectDir)) || TEMPLATE, { out, id } = addRule(before, text, screen, "R");
  await writeRules(projectDir, out);
  return { id, content: out };
}

// ---------------------------------------------------------------- the rules of all projects: GLOBAL_RULES.md in the folder that holds the projects
export const GLOBAL_FILE = "GLOBAL_RULES.md";
export const GLOBAL_TEMPLATE = `# Rules for all projects

Standing rules that apply to every project and every screen, for example how screens are composed of components. Maintained by Claude and by hand; every project reads this file.

## General

`;
export const readGlobalRules = (root) => read(path.join(root, GLOBAL_FILE));
export async function writeGlobalRules(root, text) { await fs.promises.writeFile(path.join(root, GLOBAL_FILE), text); }
export async function appendGlobalRule(root, text) {
  const before = (await readGlobalRules(root)) || GLOBAL_TEMPLATE, { out, id } = addRule(before, text, null, "G");
  await writeGlobalRules(root, out);
  return { id, content: out };
}

/** Adds `- <prefix>-nnn text` to the section of the screen (or General) of a rules text; the section is created when missing. */
function addRule(before, text, screen, prefix) {
  const rule = String(text).replace(/\s+/g, " ").trim();
  if (!rule) throw new Error("The rule is empty.");
  const id = nextRuleId(before, prefix), heading = screen ? `## Screen: ${screen}` : "## General";
  const lines = before.replace(/\s+$/, "").split("\n"), line = `- ${id}${screen ? ` (screen: ${screen})` : ""} ${rule}`;
  let at = lines.findIndex((l) => l.trim() === heading);
  if (at < 0) { lines.push("", heading, "", line); }
  else {
    let end = at + 1; while (end < lines.length && !/^## /.test(lines[end])) end++;
    while (end - 1 > at && lines[end - 1].trim() === "") end--;
    lines.splice(end, 0, ...(end === at + 1 ? ["", line] : [line])); // the first rule of a section is separated from its heading
  }
  return { out: lines.join("\n") + "\n", id };
}

/** Which lines were added / removed between two versions of a file (order and duplicates counted, blank lines ignored). */
export function summarizeChange(before, after) {
  const count = (t) => { const m = new Map(); for (const l of String(t).split("\n").map((x) => x.trim()).filter(Boolean)) m.set(l, (m.get(l) ?? 0) + 1); return m; };
  const a = count(before), b = count(after), added = [], removed = [];
  for (const [l, n] of b) for (let i = 0; i < n - (a.get(l) ?? 0); i++) added.push(l);
  for (const [l, n] of a) for (let i = 0; i < n - (b.get(l) ?? 0); i++) removed.push(l);
  return { added, removed };
}

// ---------------------------------------------------------------- notes of one screen (several per screen)
// <screen>.notes.md holds all notes of the screen, readable by people and by the agent:
//
//   # Notes: rooms
//
//   <!-- note n3f9a -->
//   First note text …
//
//   <!-- note k82ud -->
//   Second note text …
//
// The ids tie a note to its place on the canvas. A file without markers (older version, written by hand) is one note.
const NOTE_MARK = /<!--\s*note\s+([\w-]+)\s*-->/g;
const noteName = (file) => {
  const f = path.basename(String(file));
  if (!f.endsWith(".html")) throw new Error("Not a screen.");
  return `${f.slice(0, -5)}.notes.md`;
};
export const notePath = (projectDir, file) => path.join(projectDir, noteName(file));

/** Notes of a file's text: [{ id, text }] (blank notes are dropped). */
export function parseNotes(raw) {
  const text = String(raw ?? "");
  const marks = [...text.matchAll(NOTE_MARK)];
  if (!marks.length) { const t = text.replace(/^#[^\n]*\n/, "").trim(); return t ? [{ id: "main", text: t }] : []; }
  return marks.map((m, i) => ({ id: m[1], text: text.slice(m.index + m[0].length, marks[i + 1]?.index ?? text.length).trim() })).filter((n) => n.text);
}
export function serializeNotes(screen, notes) {
  const list = notes.filter((n) => String(n.text).trim());
  return list.length ? `# Notes: ${screen.replace(/\.html$/, "")}\n\n${list.map((n) => `<!-- note ${n.id} -->\n${String(n.text).trim()}\n`).join("\n")}` : "";
}
/** A fresh id that is not taken yet. */
export const newNoteId = (taken = []) => { let id; do id = `n${Math.random().toString(36).slice(2, 7)}`; while (taken.includes(id)); return id; };

export const readNotes = async (projectDir, file) => parseNotes(await read(notePath(projectDir, file)));
/** Writes all notes of a screen; no (non-blank) notes removes the file so that no empty files pile up. Returns the notes that were kept. */
export async function writeNotes(projectDir, file, notes) {
  const p = notePath(projectDir, file), kept = (notes ?? []).filter((n) => n && /^[\w-]+$/.test(String(n.id)) && String(n.text).trim()).map((n) => ({ id: String(n.id), text: String(n.text) }));
  if (!kept.length) { await fs.promises.rm(p, { force: true }); return []; }
  await fs.promises.writeFile(p, serializeNotes(path.basename(String(file)), kept)); return kept;
}
/** Names of the screens (file names) that have a note. */
export const screensWithNotes = (projectDir) => fs.readdirSync(projectDir).filter((f) => f.endsWith(".notes.md")).map((f) => `${f.slice(0, -9)}.html`);
