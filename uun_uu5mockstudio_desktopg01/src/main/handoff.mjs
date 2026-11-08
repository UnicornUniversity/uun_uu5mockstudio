/**
 * The handoff specification: one Markdown document for the people who build the real application, assembled from what the project
 * already holds (description, business rules, the structure of every screen, its notes and comments, the linked repository).
 * `buildHandoff` is a pure function of the gathered data; `gatherHandoff` reads the project folder.
 */
import fs from "node:fs";
import path from "node:path";
import { structureOf, structureOutline } from "./jsxSource.mjs";
import { readRules, readProject, readNotes } from "./rules.mjs";
import { getProjectText, getScreenText } from "../renderer/projectDoc.js";
import { readComments } from "./comments.mjs";

const demote = (md, by = 2) => String(md ?? "").replace(/^(#{1,5}) /gm, (_, h) => `${"#".repeat(Math.min(6, h.length + by))} `);
const titleOf = (file) => file.replace(/\.html$/, "");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();

/** Library components used in a structure tree: [{ name, count }] by namespace, most used first within a namespace. */
export function libraryUsage(tree) {
  const counts = new Map();
  const walk = (n) => { if (n.kind === "library" && n.name) counts.set(n.name, (counts.get(n.name) ?? 0) + 1); for (const c of n.children ?? []) walk(c); };
  if (tree) walk(tree);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.split(".")[0].localeCompare(b.name.split(".")[0]) || b.count - a.count || a.name.localeCompare(b.name));
}
/** Components the screen defines itself (new or existing in the file), without the screen node. */
export function localComponents(tree) {
  const out = new Set();
  const walk = (n) => { if ((n.kind === "new" || n.kind === "existing") && /^[A-Z]/.test(n.name ?? "")) out.add(n.name); for (const c of n.children ?? []) walk(c); };
  if (tree) walk(tree);
  return [...out];
}

/** data: { project, date, description, rules, repo, screens: [{ file, description, outline, libraries, locals, notes, comments, error }] } */
export function buildHandoff(data) {
  const L = [];
  const screens = data.screens ?? [];
  L.push(`# Handoff: ${data.project}`, "", `Specification assembled by uu5Mock Studio on ${data.date}. The screens are mockups: this document says what they show, which rules they follow and what is still open.`, "");
  if (data.description) L.push("## Overview", "", data.description, "");
  if (data.repo) L.push("## Repository", "", `The real components are built in ${data.repo}. The mockups only read it.`, "");

  L.push("## Screens", "");
  if (!screens.length) L.push("There is no screen yet.", "");
  else {
    L.push("| Screen | Purpose | Libraries | Open comments |", "| --- | --- | --- | --- |");
    for (const s of screens) {
      const libs = [...new Set(s.libraries.map((l) => l.name.split(".")[0]))].join(", ") || "-";
      L.push(`| ${cell(titleOf(s.file))} | ${cell(s.description) || "-"} | ${libs} | ${s.comments.filter((c) => c.status === "open").length} |`);
    }
    L.push("");
  }

  const rules = String(data.rules ?? "").replace(/^#\s*Business rules\s*\n+(Rules, constraints[^\n]*\n+)?/i, "").trim();
  L.push("## Business rules", "", rules ? demote(rules, 1) : "No rule has been recorded.", "");

  for (const s of screens) {
    L.push(`## Screen: ${titleOf(s.file)}`, "");
    if (s.description) L.push(s.description, "");
    if (s.error) L.push(`The structure could not be read: ${s.error}`, "");
    else if (s.outline) {
      L.push("### Component structure", "", "Rendered top to bottom; ×N once per item of a list, [R: …] rendered when, [D: …] disabled when, ← the data it shows.", "", "```", s.outline, "```", "");
      if (s.libraries.length) L.push("### Library components", "", ...s.libraries.map((l) => `- \`${l.name}\`${l.count > 1 ? ` ×${l.count}` : ""}`), "");
      if (s.locals.length) L.push("### Components defined in the screen", "", ...s.locals.map((n) => `- \`${n}\``), "");
    }
    if (s.notes.length) L.push("### Notes", "", ...s.notes.map((n) => `- ${n.text.replace(/\n+/g, " ")}`), "");
    const open = s.comments.filter((c) => c.status === "open"), done = s.comments.filter((c) => c.status === "resolved");
    const line = (c) => `- **${c.target?.name || "screen"}**${c.target?.text ? ` “${c.target.text}”` : ""} (${c.author}): ${c.text.replace(/\n+/g, " ")}${c.replies.length ? ` · ${c.replies.length} ${c.replies.length === 1 ? "reply" : "replies"}: ${c.replies.map((r) => `${r.author}: ${r.text.replace(/\n+/g, " ")}`).join(" / ")}` : ""}`;
    if (open.length) L.push("### Open comments", "", ...open.map(line), "");
    if (done.length) L.push("### Resolved comments", "", ...done.map((c) => `${line(c)} ✓ ${c.resolvedBy ?? ""}`.trim()), "");
  }

  const all = new Map();
  for (const s of screens) for (const l of s.libraries) all.set(l.name, (all.get(l.name) ?? 0) + l.count);
  if (all.size) {
    L.push("## Components overall", "", "| Component | Uses |", "| --- | --- |", ...[...all].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n, c]) => `| \`${n}\` | ${c} |`), "");
  }
  const questions = screens.flatMap((s) => s.comments.filter((c) => c.status === "open").map((c) => `- ${titleOf(s.file)} / ${c.target?.name || "screen"}: ${c.text.replace(/\n+/g, " ")}`));
  L.push("## Open questions", "", questions.length ? questions.join("\n") : "No open comment.", "");
  return `${L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/** Reads the project folder: description, rules, every screen's structure, notes and comments. */
export async function gatherHandoff(projectDir, { project, repo = "", date = new Date().toISOString().slice(0, 10) } = {}) {
  const files = fs.readdirSync(projectDir).filter((f) => f.endsWith(".html")).sort();
  const proj = await readProject(projectDir);
  const screens = [];
  for (const file of files) {
    const name = titleOf(file);
    let tree = null, error = "";
    try { tree = structureOf(fs.readFileSync(path.join(projectDir, file), "utf8"), name); } catch (e) { error = e.message; }
    screens.push({
      file, description: getScreenText(proj, name), outline: tree ? structureOutline(tree) : "", libraries: libraryUsage(tree), locals: localComponents(tree),
      notes: await readNotes(projectDir, file), comments: await readComments(projectDir, file), error,
    });
  }
  return { project, date, description: getProjectText(proj), rules: await readRules(projectDir), repo, screens };
}
