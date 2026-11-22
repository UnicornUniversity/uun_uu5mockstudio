/**
 * Update from code: a screen made from an existing component follows the code again without losing what the user changed on it.
 * Three versions meet here: the tree of the code the screen was made from (`before`, kept in the project state), the tree read from the
 * code now (`after`) and the screen itself. Only the difference before → after goes to the agent; what the screen has beyond `before` is
 * the user's work and is listed as untouchable.
 */
import { asIsOutline, libraryRule, libraryDeviations, deviationLines, screenNameOf } from "./componentTree.mjs";
import { componentView, realStructure, normalizeTree } from "../renderer/planTree.js";
import fs from "node:fs";
import path from "node:path";
import { readState } from "./projects.mjs";
import { structureOf } from "./jsxSource.mjs";

const visual = (n) => !n.role || n.role === "visual";
const label = (n) => `${n.name}${n.role && n.role !== "visual" ? ` (${n.role === "data" ? "data loading" : n.role === "component" ? "non-visual component" : n.role})` : ""}`;
/** A place in the tree, the nearest parts only: "… › View › Plus4U5Elements.ContentContainer". */
const place = (path) => (path.length > 3 ? ["…", ...path.slice(-3)] : path).join(" › ");
const propKey = (p) => JSON.stringify([p.name, p.type ?? "", p.default ?? "", Boolean(p.required)]);

/**
 * The difference of two trees read from the code. Children are paired by name (and file), in order, so a component that is there twice
 * pairs with its own twin. → { added: [{ path, node }], removed: [{ path, node }], changed: [{ path, node, what: [text] }] }.
 */
export function treeDelta(before, after) {
  const out = { added: [], removed: [], changed: [] };
  if (!before || !after) return out;
  const key = (n) => `${n.name}|${n.source ?? ""}`;
  const compare = (a, b, path) => {
    const what = [];
    if ((a.role ?? "") !== (b.role ?? "")) what.push(`role ${a.role ?? "visual"} → ${b.role ?? "visual"}`);
    if ((a.render ?? "") !== (b.render ?? "")) what.push(b.render ? `shown when ${b.render}${a.render ? ` (was: ${a.render})` : ""}` : `always shown (was: when ${a.render})`);
    if ((a.relation ?? "") !== (b.relation ?? "")) what.push(b.relation ? "now repeated (×N)" : "no longer repeated");
    const pa = new Map((a.props ?? []).map((p) => [p.name, p])), pb = new Map((b.props ?? []).map((p) => [p.name, p]));
    const plus = [...pb.keys()].filter((k) => !pa.has(k)), minus = [...pa.keys()].filter((k) => !pb.has(k)), other = [...pb.keys()].filter((k) => pa.has(k) && propKey(pa.get(k)) !== propKey(pb.get(k)));
    if (plus.length) what.push(`new props: ${plus.join(", ")}`);
    if (minus.length) what.push(`props removed: ${minus.join(", ")}`);
    if (other.length) what.push(`props changed: ${other.map((k) => { const p = pb.get(k); return `${k}${p.type ? `: ${p.type}` : ""}${p.default ? ` = ${p.default}` : ""}`; }).join(", ")}`);
    if (what.length) out.changed.push({ path, node: b, what });
    const rest = [...(a.children ?? [])];
    for (const c of b.children ?? []) {
      const i = rest.findIndex((x) => key(x) === key(c));
      if (i < 0) { out.added.push({ path: [...path, c.name], node: c }); continue; }
      const [twin] = rest.splice(i, 1);
      compare(twin, c, [...path, c.name]);
    }
    for (const r of rest) out.removed.push({ path: [...path, r.name], node: r });
  };
  compare(before, after, [after.name]);
  return out;
}

/**
 * The baseline a screen was made from, when a project has screens of several existing components: the one whose screen name it has
 * (StudyProgrammes → study-programmes.html), else the one whose component the screen draws, else the only one. null when unclear.
 */
export function baselineFor(baselines, file, screenTree = null) {
  const list = (baselines ?? []).filter((b) => b.tree?.name);
  const byName = list.find((b) => `${screenNameOf(b.tree.name)}.html` === file);
  if (byName) return byName;
  const names = new Set(); const w = (n) => { if (n?.name) names.add(n.name); (n?.children ?? []).forEach(w); }; w(screenTree);
  const drawn = list.filter((b) => names.has(b.tree.name));
  if (drawn.length === 1) return drawn[0];
  return list.length === 1 ? list[0] : null;
}

/**
 * Which existing component each screen of a project shows: the link written when the screen was made from it (state.screenBaselines),
 * else baselineFor. A project may have screens of several components – each screen has its own. → Map(file → baseline | null).
 */
export async function screenBaselines(projectDir, baselines, files = null) {
  const out = new Map();
  if (!baselines?.length) return out;
  const links = (await readState(projectDir).catch(() => ({}))).screenBaselines ?? {};
  let list = files; if (!list) { try { list = fs.readdirSync(projectDir).filter((f) => f.endsWith(".html")); } catch { list = []; } }
  for (const f of list) {
    const linked = baselines.find((b) => b.slug === links[f]);
    if (linked) { out.set(f, linked); continue; }
    let tree = null;
    if (baselines.length > 1 && !baselines.some((b) => b.tree?.name && `${screenNameOf(b.tree.name)}.html` === f)) { try { tree = structureOf(fs.readFileSync(path.join(projectDir, f), "utf8"), f.replace(/\.html$/, "")); } catch { /* unreadable */ } }
    out.set(f, baselineFor(baselines, f, tree));
  }
  return out;
}
/** The baselines with the screens made from them (b.screens), for the agent and the menus. */
export async function baselinesWithScreens(projectDir, baselines) {
  const map = await screenBaselines(projectDir, baselines);
  return baselines.map((b) => ({ ...b, screens: [...map].filter(([, x]) => x === b).map(([f]) => f) }));
}

export const deltaSize = (d) => d.added.length + d.removed.length + d.changed.length;

/** The difference as lines for the agent and for people: what changed in the code, the drawn parts first. */
export function deltaLines(d) {
  const at = (p) => (p.length > 1 ? place(p.slice(0, -1)) : "the root");
  const sub = (n) => { const kids = []; const w = (x, depth) => { for (const c of x.children ?? []) { kids.push(`${"  ".repeat(depth)}${label(c)}`); w(c, depth + 1); } }; w(n, 2); return kids; };
  const order = (list) => [...list.filter((x) => visual(x.node)), ...list.filter((x) => !visual(x.node))];
  return [
    ...order(d.added).flatMap((x) => [`+ ${label(x.node)} added in ${at(x.path)}${x.node.render ? ` (shown when ${x.node.render})` : ""}${x.node.relation ? " ×N" : ""}${x.node.source ? ` — ${x.node.source}` : ""}`, ...sub(x.node)]),
    ...order(d.removed).map((x) => `- ${label(x.node)} removed from ${at(x.path)}`),
    ...order(d.changed).map((x) => `~ ${label(x.node)} in ${at(x.path)}: ${x.what.join("; ")}`),
  ];
}

/** The components the screen has beyond the code it was made from: the parts the user (or an earlier plan) added. */
export function screenAdditions(before, screenTree) {
  if (!before || !screenTree) return [];
  const view = componentView(normalizeTree(screenTree), { focus: [before.name] });
  const real = realStructure(before, view), out = [];
  const w = (n, path) => { if (n.change === "add") { out.push(`${n.name} in ${place(path) || before.name}`); return; } for (const c of n.children ?? []) w(c, [...path, n.name]); };
  if (real) w(real, []);
  return out;
}

/**
 * What an update needs: the difference of the code, the library components the screen still draws differently although the code has them,
 * and the parts the screen added. `upToDate` when there is nothing to bring over.
 */
export function planUpdate({ before, after, screenTree, html }) {
  const delta = treeDelta(before, after);
  const dev = screenTree ? libraryDeviations(after, componentView(normalizeTree(screenTree), { focus: [after.name] }), html, { kind: "baseline" }) : { standIns: [], drawnAs: [], notInCode: [], notOnScreen: [] };
  // what the screen uses beyond the code may be the user's own addition: not a reason to update, and not for the agent to replace;
  // what is in the code and not drawn is mostly a hidden state, so it only goes along when there is an update anyway
  const libs = deviationLines({ ...dev, notInCode: [] }, { origin: "the code" });
  return { delta, libs, additions: screenAdditions(before, screenTree), upToDate: !deltaSize(delta) && !dev.standIns.length && !dev.drawnAs.length };
}

/** The task for the agent: bring the difference of the code into the screen and keep everything else of it as it is. */
export function updateBrief({ name, file, screen, files = [], root = "", before, after, delta, libs = [], additions = [], known = true }) {
  const lines = deltaLines(delta);
  return [
    `UPDATE FROM CODE: the screen \`${screen}\` shows the existing component ${name} of the linked repository (\`${file}\`). The code has changed since the screen was made${known ? "" : " (or it is read better now)"}. Bring ONLY these changes into the screen; everything else on it stays exactly as it is.`,
    files.length ? `The files of the component (read-only): ${files.map((f) => `\`${root ? `${root}/` : ""}${f}\``).join(", ")}. Read the ones the changes are in.` : "",
    lines.length
      ? ["What changed in the code (+ added, - removed, ~ changed; visual parts first – the non-visual ones only change the fake data or the states the screen shows):", "```", ...lines, "```"].join("\n")
      : "The structure of the code is the same as when the screen was made.",
    libs.length ? `The library components of the screen and of the code (where the screen draws one of them with a look-alike, use the real one now; a part of the code that is only in a hidden state may stay undrawn): ${libs.join(" ")}` : "",
    known
      ? `THE USER'S CHANGES MUST STAY. The screen was made from the tree below (before); whatever the screen has beyond it – other texts, props, layout, colours, states, fake data, components – was changed on purpose by the user. Keep all of it.${additions.length ? ` These parts were added to the screen and must stay, in their places: ${additions.join("; ")}.` : ""}`
      : `THE USER'S CHANGES MUST STAY. It is not known exactly from which reading of the code the screen was made, so compare the screen with the code: where the screen differs from the code in something the changes above do not touch (texts, props, layout, colours, states, components), it is the user's change – keep it.${additions.length ? ` These parts are on the screen and not in the code; they stay: ${additions.join("; ")}.` : ""}`,
    "Where a change of the code and a change of the user meet in the same place, do not choose: keep the user's version and list it under Conflicts at the end.",
    "Keep the names of the components as they are in the code, so that the screen stays linked to it. Do not rebuild the screen, do not tidy it up and do not change the plans in plans/.",
    libraryRule(after),
    known && before ? ["The tree the screen was made from (before):", "```", asIsOutline(before), "```"].join("\n") : "",
    ["The tree of the code now:", "```", asIsOutline(after), "```"].join("\n"),
    "When done, say in one or two sentences what changed on the screen; then list Conflicts (if any) – the places where the code changed something the user had changed, with both versions.",
  ].filter(Boolean).join("\n");
}
