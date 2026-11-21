/**
 * How the components designed in the mockups are handed over when there is no plan: `.studio/links.json` of the project,
 * `{ components: { <Name>: { mockOnly?, source?, target?, props?, accept? } } }`. `source` links the component to an existing file of
 * the repository (a redesign: Modify), `target` is where a new one is created. The mockups themselves stay untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeProps, normalizeTarget, normalizeAccept, propsFromText } from "../renderer/planTree.js";

const fileOf = (projectDir) => path.join(projectDir, ".studio", "links.json");

export function readLinks(projectDir) {
  try { const j = JSON.parse(fs.readFileSync(fileOf(projectDir), "utf8")); return j && typeof j.components === "object" ? j.components : {}; } catch { return {}; }
}

/** One component's entry changed by `patch` (fields given as "" or null are removed; props/accept may be the lines of the dialog). Returns the entry. */
export function saveLink(projectDir, name, patch) {
  if (!/^[A-Za-z_$][\w$]*$/.test(String(name))) throw new Error("Unknown component.");
  const all = readLinks(projectDir), e = { ...(all[name] ?? {}) };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k === "mockOnly" || k === "keep" || k === "remove") { if (typeof v === "boolean") e[k] = v; else delete e[k]; } // keep / remove: a part of the baseline left as it is, or dropped
    else if (k === "source" || k === "target") { const t = normalizeTarget(v); if (t) e[k] = t; else delete e[k]; }
    else if (k === "props") { if (v === null || v === undefined) delete e.props; else e.props = typeof v === "string" ? propsFromText(v) : normalizeProps(v); } // [] is kept: "no props" on purpose
    else if (k === "accept") { const a = normalizeAccept(v); if (a.length) e.accept = a; else delete e.accept; }
  }
  if (Object.keys(e).length) all[name] = e; else delete all[name];
  fs.mkdirSync(path.dirname(fileOf(projectDir)), { recursive: true });
  fs.writeFileSync(fileOf(projectDir), `${JSON.stringify({ components: all }, null, 2)}\n`);
  return e;
}
