/**
 * PROJECT.md: the user's own description of the project and of its screens, separate from the business rules.
 *
 *   # Project description
 *
 *   What the project is about …
 *
 *   ## Screen: rooms
 *
 *   What this screen is for …
 *
 * The file is parsed into blocks (the intro, then one block per `## ` heading), so a section somebody added by hand survives every edit.
 */
export const PROJECT_FILE = "PROJECT.md";
const TITLE = "# Project description";
const SCREEN = /^##\s+Screen:\s*(.+?)\s*$/i;
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function blocks(md) {
  const out = [{ head: null, body: [] }];
  for (const line of String(md ?? "").split("\n")) {
    if (/^##\s/.test(line)) out.push({ head: line, body: [] }); else out.at(-1).body.push(line);
  }
  return out;
}
const join = (bs) => `${bs.flatMap((b) => (b.head == null ? b.body : [b.head, ...b.body])).join("\n").replace(/\s+$/, "")}\n`;
/** Text of a block: no title line, no markers that would turn a line into a heading or a list, trimmed. */
const clean = (text) => String(text ?? "").replace(/\r/g, "").split("\n").map((l) => l.replace(/^(\s*)(?:[-*#]+|```)\s*/, "$1")).join("\n").trim();
const textOf = (lines) => lines.filter((l) => !/^#\s/.test(l)).join("\n").trim();

export const getProjectText = (md) => textOf(blocks(md)[0].body);
export const getScreenText = (md, name) => {
  const b = blocks(md).find((x) => x.head && same(x.head.match(SCREEN)?.[1] ?? "\0", name));
  return b ? textOf(b.body) : "";
};

export function setProjectText(md, text) {
  const bs = blocks(md), body = clean(text), intro = bs[0];
  const title = intro.body.find((l) => /^#\s/.test(l)) ?? TITLE;
  intro.body = [title, "", ...(body ? [...body.split("\n"), ""] : [])];
  if (bs.length > 1 && intro.body.at(-1) !== "") intro.body.push("");
  return join(bs);
}
export function setScreenText(md, name, text) {
  const bs = blocks(md), body = clean(text), at = bs.findIndex((x) => x.head && same(x.head.match(SCREEN)?.[1] ?? "\0", name));
  if (at < 0) { if (!body) return String(md ?? ""); bs.at(-1).body.push(...(bs.at(-1).body.at(-1)?.trim() === "" || bs.length === 1 && !bs[0].body.length ? [] : [""])); bs.push({ head: `## Screen: ${name}`, body: ["", ...body.split("\n"), ""] }); return join(bs); }
  if (!body) bs.splice(at, 1); else bs[at].body = ["", ...body.split("\n"), ""];
  return join(bs);
}

/**
 * Earlier versions kept descriptions inside BUSINESS_RULES.md (a `## Description` section, prose below a `## Screen:` heading).
 * Returns what to move into PROJECT.md and the rules text without it, or null when there is nothing to move.
 */
export function extractFromRules(rulesMd) {
  const lines = String(rulesMd ?? "").split("\n"), keep = [], screens = {}; let project = "", cur = null, lead = false, code = false;
  const push = (name, l) => { screens[name] = `${screens[name] ?? ""}${l}\n`; };
  for (const line of lines) {
    if (!code && /^##\s/.test(line)) {
      cur = /^##\s+Description\s*$/i.test(line) ? { kind: "project" } : SCREEN.test(line) ? { kind: "screen", name: line.match(SCREEN)[1] } : null;
      lead = cur?.kind === "screen"; if (cur?.kind === "project") continue; keep.push(line); continue;
    }
    if (cur?.kind === "project") { project += `${line}\n`; continue; }
    if (/^\s*```/.test(line)) code = !code;
    if (lead && !code && !/^\s*(?:[-*]\s|#|```)/.test(line)) { if (line.trim()) push(cur.name, line); else if (screens[cur.name]) push(cur.name, line); continue; }
    if (lead && (code || /^\s*(?:[-*]\s|#|```)/.test(line))) lead = false;
    keep.push(line);
  }
  const out = { project: project.trim(), screens: Object.fromEntries(Object.entries(screens).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) };
  if (!out.project && !Object.keys(out.screens).length) return null;
  const rules = keep.join("\n").replace(/^(##\s+Screen:.*)\n(?=\S)/gim, "$1\n\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
  return { ...out, rules: `${rules}\n` };
}
