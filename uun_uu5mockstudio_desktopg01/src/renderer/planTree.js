/**
 * The component tree of a plan (decomposition of a screen into components, or the parts a bigger change touches) and everything that can be
 * done with it without a DOM: reading it from the answer of the agent, editing it, and telling the agent what the user changed.
 *
 * A node: { name, kind: "screen" | "new" | "library" | "existing", change?: "add" | "modify" | "remove" | "keep", note?, children?: node[] }.
 * A path is the list of child indexes from the root: [] is the root, [0, 2] its first child's third child.
 */
export const KINDS = ["screen", "new", "library", "existing"];
// Fields of the Unicorn decomposition notation (Jackson Structure Programming): relation "1:N" = the component is rendered once per item (iteration),
// render = condition under which it is rendered (label R), disabled = condition under which it is disabled (label D), label = the data it shows (// label),
// low = low importance (undecided or less important part), data = what it receives from its parent.
const TEXT_FIELDS = { render: 160, disabled: 160, label: 80, data: 160 };
export const CHANGES = ["add", "modify", "remove", "keep"];
const MAX_NODES = 300, MAX_DEPTH = 12;
const FENCE = /```uu5-tree[^\n]*\n([\s\S]*?)```/;

/** A tree from loose JSON: unknown keys dropped, texts clipped, the size limited. null when it is not a tree. */
export function normalizeTree(obj) {
  let count = 0;
  const walk = (o, depth) => {
    if (!o || typeof o !== "object" || typeof o.name !== "string" || !o.name.trim() || depth > MAX_DEPTH || ++count > MAX_NODES) return null;
    const n = { name: o.name.trim().slice(0, 120), kind: KINDS.includes(o.kind) ? o.kind : "new" };
    if (CHANGES.includes(o.change)) n.change = o.change;
    if (typeof o.note === "string" && o.note.trim()) n.note = o.note.trim().slice(0, 300);
    if (o.relation === "1:N") n.relation = "1:N";
    if (Number.isInteger(o.ordinal) && o.ordinal >= 0) n.ordinal = o.ordinal; // the JSX element of a node read from a screen
    if (o.low === true) n.low = true;
    for (const [k, max] of Object.entries(TEXT_FIELDS)) if (typeof o[k] === "string" && o[k].trim()) n[k] = o[k].trim().slice(0, max);
    const kids = Array.isArray(o.children) ? o.children.map((c) => walk(c, depth + 1)).filter(Boolean) : [];
    if (kids.length) n.children = kids;
    return n;
  };
  return walk(obj, 0);
}

/**
 * A tree drawn with branches (├─ └─ │), as the agent sometimes answers instead of the uu5-tree block, read into a tree.
 * The depth comes from the column of the branch, the name is the first word (or the text in […]), the rest becomes the note.
 */
export function parseAsciiTree(body) {
  const rows = [];
  for (const raw of String(body).split("\n")) {
    const m = /^([^├└]*?)([├└])[─-]+\s*(.*)$/.exec(raw);
    if (m) rows.push({ col: m[1].length, text: m[3].trim() });
    else if (!rows.length && raw.trim() && !/[│]/.test(raw)) rows.push({ col: -1, text: raw.trim() });
  }
  if (!rows.length || rows[0].col !== -1) return null;
  const toNode = (text, root) => {
    let name, rest, m;
    if ((m = /^\[([^\]]+)\]\s*(.*)$/.exec(text))) [name, rest] = [m[1], m[2]];
    else if ((m = /^([A-Za-z_][\w.]*)\s*:?\s*(.*)$/.exec(text))) [name, rest] = [m[1], m[2]];
    else [name, rest] = [text.slice(0, 60), ""];
    const n = { name, kind: root ? "screen" : /^(Uu5|Plus4U5)[A-Za-z0-9]*\./.test(name) ? "library" : "new" };
    if (/(?:×|\bx)\s*\d+|\bN\s*×/.test(rest) || /×/.test(text)) n.relation = "1:N";
    rest = rest.replace(/^(?:×|x)\s*\d+\s*/, "").replace(/^\((.*)\)$/, "$1").trim();
    if (rest) n.note = rest;
    return n;
  };
  const root = toNode(rows[0].text, true), stack = [{ col: -1, node: root }];
  for (const r of rows.slice(1)) {
    while (stack.length > 1 && stack.at(-1).col >= r.col) stack.pop();
    const parent = stack.at(-1).node, node = toNode(r.text, false);
    (parent.children ??= []).push(node); stack.push({ col: r.col, node });
  }
  return normalizeTree(root);
}

/** Questions of the agent (loose JSON) -> up to 4 questions with 2 to 6 options each. */
export function normalizeQuestions(obj) {
  const list = Array.isArray(obj) ? obj : obj?.questions;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const [i, q] of list.entries()) {
    if (!q || typeof q.question !== "string" || !q.question.trim() || out.length >= 4) continue;
    const options = (Array.isArray(q.options) ? q.options : []).map((o) => typeof o === "string" ? { label: o } : o)
      .filter((o) => o && typeof o.label === "string" && o.label.trim()).slice(0, 6)
      .map((o) => ({ label: o.label.trim().slice(0, 100), ...(typeof o.description === "string" && o.description.trim() ? { description: o.description.trim().slice(0, 300) } : {}) }));
    if (options.length < 2) continue;
    out.push({ id: typeof q.id === "string" && q.id ? q.id.slice(0, 40) : `q${i + 1}`, header: String(q.header ?? "").trim().slice(0, 20), question: q.question.trim().slice(0, 300), multiSelect: q.multiSelect === true, options });
  }
  return out;
}

const fenced = (text, lang) => new RegExp("```" + lang + "[^\\n]*\\n([\\s\\S]*?)```").exec(text);
const cut = (text, m) => (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\n{3,}/g, "\n\n").trim();

/** The answer of the agent -> { text: without the blocks, tree: or null, questions: [] }. A drawn (ASCII) tree is read too. */
export function extractPlan(answer) {
  let text = String(answer ?? ""), tree = null, questions = [];
  const q = fenced(text, "uu5-questions");
  if (q) { try { questions = normalizeQuestions(JSON.parse(q[1])); } catch { /* not valid JSON: stays text */ } if (questions.length) text = cut(text, q); }
  const m = fenced(text, "uu5-tree");
  if (m) { try { tree = normalizeTree(JSON.parse(m[1])); } catch { /* not valid JSON */ } if (tree) text = cut(text, m); }
  if (!tree) {
    for (const f of text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
      if (!/[├└]/.test(f[1])) continue;
      const t = parseAsciiTree(f[1]);
      if (t && countNodes(t) > 1) { tree = t; text = cut(text, f); break; }
    }
  }
  return { text: text.trim(), tree, questions };
}
export const extractTree = (answer) => { const { text, tree } = extractPlan(answer); return { text, tree }; };

// ---------------------------------------------------------------- answers to the questions: { [id]: { choices: [label], other?: string } }
export const isAnswered = (a) => Boolean(a && ((a.choices?.length ?? 0) > 0 || a.other?.trim()));
export const unanswered = (questions, answers) => (questions ?? []).filter((q) => !isAnswered(answers?.[q.id]));
export function answersText(questions, answers) {
  return (questions ?? []).filter((q) => isAnswered(answers?.[q.id])).map((q) => {
    const a = answers[q.id], parts = [...(a.choices ?? []), ...(a.other?.trim() ? [`other: ${a.other.trim()}`] : [])];
    return `- ${q.header ? `${q.header}: ` : ""}${q.question} → ${parts.join("; ")}`;
  }).join("\n");
}

export const serializeTree = (tree) => JSON.stringify(tree, null, 2);
export const countNodes = (tree) => 1 + (tree.children ?? []).reduce((s, c) => s + countNodes(c), 0);

// ---------------------------------------------------------------- reading and editing by path (every function returns a new tree)
const clone = (t) => JSON.parse(JSON.stringify(t));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
export const getNode = (tree, path) => path.reduce((n, i) => n?.children?.[i], tree) ?? null;
const parentOf = (t, path) => getNode(t, path.slice(0, -1));
const blank = () => ({ name: "New component", kind: "new" });

export function updateNode(tree, path, patch) {
  const t = clone(tree), n = getNode(t, path);
  if (!n) return tree;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "name") n.name = String(v).trim().slice(0, 120) || n.name;
    else if (k === "kind") n.kind = KINDS.includes(v) ? v : n.kind;
    else if (k === "change") { if (CHANGES.includes(v)) n.change = v; else delete n.change; }
    else if (k === "note") { const s = String(v ?? "").trim().slice(0, 300); if (s) n.note = s; else delete n.note; }
    else if (k === "relation") { if (v === "1:N") n.relation = "1:N"; else delete n.relation; }
    else if (k === "low") { if (v) n.low = true; else delete n.low; }
    else if (k in TEXT_FIELDS) { const s = String(v ?? "").trim().slice(0, TEXT_FIELDS[k]); if (s) n[k] = s; else delete n[k]; }
  }
  return t;
}

/** Adds a child as the last one of the node; returns { tree, path } of the new node. */
export function addChild(tree, path, node = blank()) {
  const t = clone(tree), n = getNode(t, path);
  if (!n || countNodes(t) >= MAX_NODES) return { tree, path };
  (n.children ??= []).push(clone(node));
  return { tree: t, path: [...path, n.children.length - 1] };
}

/** Adds a node right after the given one (not for the root). */
export function addSibling(tree, path, node = blank()) {
  if (!path.length || countNodes(tree) >= MAX_NODES) return { tree, path };
  const t = clone(tree), p = parentOf(t, path), i = path.at(-1) + 1;
  p.children.splice(i, 0, clone(node));
  return { tree: t, path: [...path.slice(0, -1), i] };
}

export function removeNode(tree, path) {
  if (!path.length) return tree;
  const t = clone(tree), p = parentOf(t, path);
  p.children.splice(path.at(-1), 1);
  if (!p.children.length) delete p.children;
  return t;
}

export function duplicateNode(tree, path) {
  const n = getNode(tree, path);
  return n && path.length ? addSibling(tree, path, n) : { tree, path };
}

/** One place up (delta -1) or down (+1) among the siblings; returns { tree, path }. */
export function moveNode(tree, path, delta) {
  if (!path.length) return { tree, path };
  const t = clone(tree), p = parentOf(t, path), from = path.at(-1), to = from + delta;
  if (to < 0 || to >= p.children.length) return { tree, path };
  p.children.splice(to, 0, p.children.splice(from, 1)[0]);
  return { tree: t, path: [...path.slice(0, -1), to] };
}

/** The node becomes the last child of the sibling in front of it. */
export function indentNode(tree, path) {
  const i = path.at(-1);
  if (!path.length || i === 0) return { tree, path };
  const t = clone(tree), p = parentOf(t, path), prev = p.children[i - 1], [n] = p.children.splice(i, 1);
  (prev.children ??= []).push(n);
  return { tree: t, path: [...path.slice(0, -1), i - 1, prev.children.length - 1] };
}

/** The node becomes the sibling that follows its parent (not for the children of the root: it has no parent to leave). */
export function outdentNode(tree, path) {
  if (path.length < 2) return { tree, path };
  const t = clone(tree), p = parentOf(t, path), [n] = p.children.splice(path.at(-1), 1);
  if (!p.children.length) delete p.children;
  const gp = parentOf(t, path.slice(0, -1)), at = path.at(-2) + 1;
  gp.children.splice(at, 0, n);
  return { tree: t, path: [...path.slice(0, -2), at] };
}

/**
 * Drag and drop: the node `from` goes before / after / inside the node `to`. A node cannot go into its own subtree and the root cannot move.
 * Returns { tree, path } with the new place of the node, or the unchanged tree when the move is not possible.
 */
export function moveTo(tree, from, to, position) {
  if (!from.length || !["before", "after", "inside"].includes(position)) return { tree, path: from };
  if (to.length >= from.length && same(to.slice(0, from.length), from)) return { tree, path: from }; // into itself or its own subtree
  if (!to.length && position !== "inside") return { tree, path: from }; // the root has no siblings
  const t = clone(tree), target = getNode(t, to), src = getNode(t, from);
  if (!target || !src) return { tree, path: from };
  const marker = Symbol("target"); target[marker] = true;
  const p = parentOf(t, from); p.children.splice(from.at(-1), 1);
  if (!p.children.length) delete p.children;
  const find = (n, path) => { if (n[marker]) return path; for (const [i, c] of (n.children ?? []).entries()) { const r = find(c, [...path, i]); if (r) return r; } return null; };
  const at = find(t, []); delete target[marker];
  if (position === "inside") { (target.children ??= []).push(src); return { tree: t, path: [...at, target.children.length - 1] }; }
  const q = parentOf(t, at), i = at.at(-1) + (position === "after" ? 1 : 0);
  q.children.splice(i, 0, src);
  return { tree: t, path: [...at.slice(0, -1), i] };
}

// ---------------------------------------------------------------- layout of the diagram (top-down; siblings left to right in the order of rendering)
export const BOX = { w: 168, h: 64, gapX: 18, gapY: 44 };
export const pathOf = (key) => (key === "" ? [] : key.split(".").map(Number));
/**
 * Positions of the boxes and the edges. `collapsed` = a Set of path keys whose children are hidden.
 * -> { nodes: [{ path, key, x, y, w, h, node, hidden: number of hidden descendants }], edges: [{ from, to, x1, y1, x2, y2 }], width, height }
 */
export function layoutTree(tree, { collapsed = new Set() } = {}) {
  const { w, h, gapX, gapY } = BOX, nodes = [], edges = [];
  const place = (n, path, depth, left) => {
    const key = path.join("."), kids = collapsed.has(key) ? [] : (n.children ?? []);
    let x = left, span = 0; const placed = [];
    for (const [i, c] of kids.entries()) { const r = place(c, [...path, i], depth + 1, x); placed.push(r); x += r.span + gapX; span += r.span + (i ? gapX : 0); }
    const width = Math.max(w, span), cx = kids.length ? (placed[0].cx + placed.at(-1).cx) / 2 : left + w / 2;
    const box = { path, key, x: cx - w / 2, y: depth * (h + gapY), w, h, node: n, hidden: collapsed.has(key) ? countNodes(n) - 1 : 0 };
    nodes.push(box);
    for (const r of placed) edges.push({ from: key, to: r.key, x1: cx, y1: box.y + h, x2: r.cx, y2: (depth + 1) * (h + gapY) });
    return { cx, span: width, key };
  };
  const r = place(tree, [], 0, 0);
  void r;
  const minX = Math.min(...nodes.map((b) => b.x)), shift = -minX;
  for (const b of nodes) b.x += shift;
  for (const e of edges) { e.x1 += shift; e.x2 += shift; }
  return { nodes, edges, width: Math.max(...nodes.map((b) => b.x + b.w)), height: Math.max(...nodes.map((b) => b.y + b.h)) };
}

/** Where a node dragged to the point (x, y) of the diagram would land: { path, position } or null. Left third = before, right third = after, middle = inside. */
export function dropTarget(layout, x, y, from = null) {
  const hit = layout.nodes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (!hit) return null;
  if (from && hit.path.length >= from.length && same(hit.path.slice(0, from.length), from)) return null;
  const f = (x - hit.x) / hit.w;
  const position = !hit.path.length ? "inside" : f < 0.35 ? "before" : f > 0.65 ? "after" : "inside";
  return { path: hit.path, position };
}

// ---------------------------------------------------------------- what the user changed, told to the agent
const signatures = (tree) => {
  const out = new Map();
  const walk = (n, parent) => { const s = `${parent} > ${n.name} [${n.kind}${n.change ? `, ${n.change}` : ""}${n.relation ? ", 1:N" : ""}${n.render ? `, R: ${n.render}` : ""}${n.disabled ? `, D: ${n.disabled}` : ""}${n.low ? ", low" : ""}${n.label ? `, // ${n.label}` : ""}]`; out.set(s, (out.get(s) ?? 0) + 1); (n.children ?? []).forEach((c) => walk(c, n.name)); };
  walk(tree, "(root)");
  return out;
};
/** Lines that say what differs between the plan of the agent and the one the user edited (nodes added / removed / changed, other places). */
export function describeEdits(original, edited) {
  if (!original || !edited) return [];
  const a = signatures(original), b = signatures(edited), lines = [];
  for (const [s, n] of a) if ((b.get(s) ?? 0) < n) lines.push(`removed or changed: ${s}`);
  for (const [s, n] of b) if ((a.get(s) ?? 0) < n) lines.push(`added or changed: ${s}`);
  // the same components in another order under a parent (the signatures above do not see it)
  const orders = (t) => { const m = new Map(); const w = (n, path) => { const key = `${path} > ${n.name}`; if (n.children?.length) { const k = m.get(key) ?? []; k.push(n.children.map((c) => (c.ordinal != null ? `${c.name} #${c.ordinal}` : c.name))); m.set(key, k); } (n.children ?? []).forEach((c) => w(c, key)); }; w(t, ""); return m; };
  const oa = orders(original), ob = orders(edited);
  for (const [key, lists] of ob) {
    const was = oa.get(key) ?? [];
    lists.forEach((names, i) => { const before = was[i]; if (before && before.length === names.length && before.join("\u0000") !== names.join("\u0000") && [...before].sort().join("\u0000") === [...names].sort().join("\u0000")) lines.push(`order changed in ${key.split(" > ").at(-1)}: ${before.join(", ")} -> ${names.join(", ")}`); });
  }
  const notes = (t) => { const o = []; const w = (n) => { if (n.note) o.push(`${n.name}: ${n.note}`); (n.children ?? []).forEach(w); }; w(t); return o.join("\n"); };
  if (!lines.length && notes(original) !== notes(edited)) lines.push("notes of components changed");
  return lines;
}

/**
 * The message that approves a plan. When the user changed the plan, the whole edited plan goes with it (the agent follows it exactly) and
 * a list of the differences; otherwise a short approval is enough, the agent has the plan in the conversation.
 */
export function approvalMessage({ text, tree, original, questions = [], answers = {} }) {
  const edits = describeEdits(original?.tree ?? null, tree), textChanged = original && String(original.text).trim() !== String(text).trim();
  const given = answersText(questions, answers), open = unanswered(questions, answers);
  const answered = [
    ...(given ? ["", "Answers of the user to your questions:", given] : []),
    ...(open.length && given ? ["", "Not answered (decide yourself and say what you chose):", ...open.map((q) => `- ${q.question}`)] : []),
  ];
  if (!edits.length && !textChanged) return ["Plan approved: build it exactly as planned.", ...answered].join("\n");
  return [
    "Plan approved. The user edited the plan, so follow this edited version exactly, not your first proposal.",
    "",
    String(text).trim(),
    ...(tree ? ["", "Component tree (JSON):", "```uu5-tree", serializeTree(tree), "```"] : []),
    ...(edits.length ? ["", "What the user changed in the tree:", ...edits.map((l) => `- ${l}`)] : []),
    ...(textChanged ? ["", "The text of the plan was edited too."] : []),
    ...answered,
  ].join("\n");
}

/** The tree as indented lines (names with the marks of the notation): what the agent reads as the structure before the change. */
export function outlineText(tree) {
  const lines = [];
  const walk = (n, d) => {
    const tags = [n.relation ? "×N" : "", n.render ? `[R: ${n.render}]` : "", n.disabled ? `[D: ${n.disabled}]` : "", n.label ? `// ${n.label}` : "", n.note ? `(${n.note})` : ""].filter(Boolean);
    lines.push(`${"  ".repeat(d)}${n.name}${tags.length ? ` ${tags.join(" ")}` : ""}`);
    (n.children ?? []).forEach((c) => walk(c, d + 1));
  };
  walk(tree, 0);
  return lines.join("\n");
}

/** The request to the agent to rebuild an existing screen after the user rearranged its structure (`original` = as read from the file, `tree` = as rearranged). */
export function regenerateMessage({ file, original, tree, notes = [], part = null }) {
  const edits = describeEdits(original, tree);
  return [
    ...(notes.length ? [`I rearranged the structure of the screen ${file}. The app already moved what it could in the file; these moves it could not make:`, ...notes.map((n) => `- ${n}`), ""] : []),
    ...(part ? [`This is the structure of one component of the screen, ${part} (the root of the tree below); the rest of the screen stays as it is.`] : []),
    `Change the screen ${file} so that its component structure becomes the one below. I rearranged the tree of the screen (drag and drop). Keep everything else as it is: the texts, data, props, behaviour, conditions and the look of the components. Only move the components (each with everything inside it) and adapt the code around them; a component that is defined in the file stays defined once.`,
    "",
    "What I changed (parent > component):",
    ...(edits.length ? edits.map((l) => `- ${l}`) : ["- (nothing)"]),
    "",
    "Structure before:",
    outlineText(original),
    "",
    "Structure now (JSON; \"ordinal\" is the position of the component's JSX element in the file):",
    "```uu5-tree",
    serializeTree(tree),
    "```",
    "Afterwards reload the screen and check that it renders without errors.",
  ].join("\n");
}
