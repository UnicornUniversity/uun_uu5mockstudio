import { slugify } from "./planDoc.js";

/**
 * The sitemap of a portal or a web site: a tree of pages. In a plan it is the fenced block `uu5-sitemap`:
 * { "root": { "id", "title", "type": "page" | "section" | "group" | "external" | "stub", "file"?: "x.html", "note"?, "children"?: [ … ] } }.
 * Everything here is pure; a node is addressed by its path (list of child indexes, the root is []).
 */
export const NODE_TYPES = ["page", "section", "group", "external", "stub"]; // a stub is a page that exists in the portal but is not solved here: it stays in the map, no screen is built for it and it is not counted
const MAX_NODES = 200, MAX_DEPTH = 8, FILE = /^[A-Za-z0-9][\w.-]*\.html$/;
/** Several comments on one page are kept in the one `comment` field, apart by this mark. */
export const CM_SEP = " ¦ ";
export const splitComments = (c) => String(c ?? "").split(CM_SEP).map((t) => t.trim()).filter(Boolean);
export const joinComments = (l) => l.map((t) => String(t).replace(/\s*¦\s*/g, " ").trim()).filter(Boolean).join(CM_SEP);
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** A valid sitemap ({ root }) from whatever the agent or an editor wrote, or null when there is nothing usable. Unknown keys are dropped, ids made unique. */
export function normalizeSitemap(raw) {
  const src = raw?.root ?? (raw && (raw.title || raw.name) ? raw : null);
  if (!src || typeof src !== "object") return null;
  const used = new Set(); let count = 0;
  const id = (want) => { let base = clip(want, 40).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "n", v = base; for (let i = 2; used.has(v); i++) v = `${base}-${i}`; used.add(v); return v; };
  const walk = (n, depth) => {
    if (!n || typeof n !== "object" || count >= MAX_NODES) return null;
    count++;
    const title = clip(n.title ?? n.name, 80) || "Page", myId = id(n.id ?? title); // the id before the children's: a parent keeps the plain one
    const kids = depth < MAX_DEPTH && Array.isArray(n.children) ? n.children.map((c) => walk(c, depth + 1)).filter(Boolean) : [];
    const file = FILE.test(String(n.file ?? "")) ? String(n.file) : undefined;
    const type = NODE_TYPES.includes(n.type) ? n.type : "page", note = clip(n.note, 240), comment = clip(n.comment, 1000);
    return { id: myId, title, type, ...(file ? { file } : {}), ...(note ? { note } : {}), ...(comment ? { comment } : {}), children: kids };
  };
  const root = walk(src, 0);
  return root ? { root } : null;
}

export const serializeSitemap = (sm) => JSON.stringify(sm, null, 2);
/** All nodes of the map (the limit of its size). */
export const countNodes = (sm) => { let n = 0; const walk = (x) => { n++; x.children.forEach(walk); }; if (sm?.root) walk(sm.root); return n; };
const countType = (sm, ok) => { let n = 0; const walk = (x) => { if (ok(x.type)) n++; x.children.forEach(walk); }; if (sm?.root) walk(sm.root); return n; };
/** The pages (their own screens): sections are parts of a page, groups only gather pages in the menu, external ones lead out. */
export const countPages = (sm) => countType(sm, (t) => t === "page");
export const countSections = (sm) => countType(sm, (t) => t === "section");

const block = /```uu5-sitemap[^\n]*\n([\s\S]*?)```/;
/** The text without the `uu5-sitemap` block, and the sitemap read from it (null when absent or not valid JSON: the block then stays in the text). */
export function extractSitemap(text) {
  const src = String(text ?? ""), m = block.exec(src);
  if (!m) return { text: src, sitemap: null };
  let sm = null; try { sm = normalizeSitemap(JSON.parse(m[1])); } catch { /* not valid JSON */ }
  if (!sm) return { text: src, sitemap: null };
  return { text: (src.slice(0, m.index) + src.slice(m.index + m[0].length)).replace(/\n{3,}/g, "\n\n").trim(), sitemap: sm };
}

/** The body of a plan with its sitemap block replaced (or appended when there was none). */
export function replaceSitemapBlock(body, sm) {
  const text = `\`\`\`uu5-sitemap\n${serializeSitemap(sm)}\n\`\`\``, src = String(body ?? "");
  return block.test(src) ? src.replace(block, () => text) : `${src.trimEnd()}\n\n${text}\n`;
}

// ---------------------------------------------------------------- reading and editing by path (every edit returns a new sitemap)
const clone = (x) => JSON.parse(JSON.stringify(x));
export const getNode = (sm, path) => path.reduce((n, i) => n?.children?.[i], sm?.root) ?? null;
const parentOf = (sm, path) => getNode(sm, path.slice(0, -1));

export function updateNode(sm, path, patch) {
  const out = clone(sm), n = getNode(out, path); if (!n) return sm;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "title") n.title = clip(v, 80) || n.title;
    else if (k === "type") { if (NODE_TYPES.includes(v)) n.type = v; }
    else if (k === "file") { if (!v) delete n.file; else if (FILE.test(String(v))) n.file = String(v); }
    else if (k === "note") { const t = clip(v, 240); if (t) n.note = t; else delete n.note; }
    else if (k === "comment") { const t = clip(v, 1000); if (t) n.comment = t; else delete n.comment; }
  }
  return out;
}

/** The same patch on several nodes (their paths stay valid: nothing moves). */
export function updateNodes(sm, paths, patch) { return paths.reduce((acc, p) => updateNode(acc, p, patch), sm); }

const uniqueId = (sm, base) => { const ids = new Set(); const walk = (n) => { ids.add(n.id); n.children.forEach(walk); }; walk(sm.root); let v = base, i = 2; while (ids.has(v)) v = `${base}-${i++}`; return v; };
const blank = (sm, title = "New page") => ({ id: uniqueId(sm, slugify(title)), title, type: "page", children: [] });

/** A child at the end of the node; returns { sitemap, path } with the path of the new node. */
export function addChild(sm, path, title) {
  const out = clone(sm), n = getNode(out, path); if (!n || countNodes(out) >= MAX_NODES || path.length >= MAX_DEPTH) return { sitemap: sm, path };
  n.children.push(blank(out, title)); return { sitemap: out, path: [...path, n.children.length - 1] };
}
/** A sibling right after the node (a child of the root for the root itself). */
export function addSibling(sm, path, title) {
  if (!path.length) return addChild(sm, path, title);
  const out = clone(sm), p = parentOf(out, path); if (!p || countNodes(out) >= MAX_NODES) return { sitemap: sm, path };
  const at = path[path.length - 1] + 1; p.children.splice(at, 0, blank(out, title)); return { sitemap: out, path: [...path.slice(0, -1), at] };
}
/** A copy of a leaf right after it: the same type and note, the title with "(copy)"; the screen file and the comments stay with the original. Nothing changes for the root or a page with sub-pages. */
export function duplicateNode(sm, path) {
  const src = getNode(sm, path); if (!path.length || !src || src.children.length || countNodes(sm) >= MAX_NODES) return { sitemap: sm, path };
  const out = clone(sm), p = parentOf(out, path), at = path[path.length - 1] + 1, title = clip(`${src.title.slice(0, 73)} (copy)`, 80);
  p.children.splice(at, 0, { id: uniqueId(out, slugify(title)), title, type: src.type, ...(src.note ? { note: src.note } : {}), children: [] });
  return { sitemap: out, path: [...path.slice(0, -1), at] };
}
/** Removes the node with its subtree (never the root); returns the path of the neighbour to select. */
export function removeNode(sm, path) {
  if (!path.length) return { sitemap: sm, path };
  const out = clone(sm), p = parentOf(out, path); if (!p) return { sitemap: sm, path };
  const i = path[path.length - 1]; p.children.splice(i, 1);
  return { sitemap: out, path: p.children.length ? [...path.slice(0, -1), Math.min(i, p.children.length - 1)] : path.slice(0, -1) };
}
/** Moves the node by `dir` (-1 / +1) among its siblings. */
export function moveNode(sm, path, dir) {
  if (!path.length) return { sitemap: sm, path };
  const out = clone(sm), p = parentOf(out, path), i = path[path.length - 1], j = i + dir;
  if (!p || j < 0 || j >= p.children.length) return { sitemap: sm, path };
  [p.children[i], p.children[j]] = [p.children[j], p.children[i]]; return { sitemap: out, path: [...path.slice(0, -1), j] };
}
/** The node becomes the last child of its previous sibling (indent) or the next sibling of its parent (outdent). */
export function indentNode(sm, path) {
  const i = path[path.length - 1]; if (!path.length || !i) return { sitemap: sm, path };
  const out = clone(sm), p = parentOf(out, path), prev = p.children[i - 1];
  if (path.length >= MAX_DEPTH) return { sitemap: sm, path };
  const [n] = p.children.splice(i, 1); prev.children.push(n); return { sitemap: out, path: [...path.slice(0, -1), i - 1, prev.children.length - 1] };
}
export function outdentNode(sm, path) {
  if (path.length < 2) return { sitemap: sm, path };
  const out = clone(sm), p = parentOf(out, path), gp = parentOf(out, path.slice(0, -1)), i = path[path.length - 1], pi = path[path.length - 2];
  const [n] = p.children.splice(i, 1); gp.children.splice(pi + 1, 0, n); return { sitemap: out, path: [...path.slice(0, -2), pi + 1] };
}

/**
 * Drag and drop: moves the node `from` before / after / inside the node `to` (with its subtree). Nothing changes (the same map comes back) for the root, for a drop
 * on the node itself or into its own subtree, or when the map would get too deep. Returns { sitemap, path } with the new path of the moved node.
 */
export function relocateNode(sm, from, to, where) {
  const none = { sitemap: sm, path: from };
  if (!from.length || isPrefix(from, to)) return none;
  const out = clone(sm), n = getNode(out, from), target = getNode(out, to); if (!n || !target) return none;
  const height = (x) => 1 + Math.max(0, ...x.children.map(height));
  const pathOf = (x, cur = out.root, path = []) => { if (cur === x) return path; for (let i = 0; i < cur.children.length; i++) { const r = pathOf(x, cur.children[i], [...path, i]); if (r) return r; } return null; };
  parentOf(out, from).children.splice(from[from.length - 1], 1);
  let at = where; if (!to.length) at = "inside"; // before / after the root: inside it
  if (at === "inside") target.children.push(n);
  else { const tp = pathOf(target), par = getNode(out, tp.slice(0, -1)); par.children.splice(tp[tp.length - 1] + (at === "after" ? 1 : 0), 0, n); }
  const np = pathOf(n); if (!np || np.length + height(n) - 1 > MAX_DEPTH) return none;
  return { sitemap: out, path: np };
}

/** A file name for a page without one: the title in kebab case, not used by another node. */
export function fileFor(sm, node) {
  const used = new Set(); const walk = (n) => { if (n.file) used.add(n.file); n.children.forEach(walk); }; walk(sm.root);
  const base = slugify(node.title); let f = `${base}.html`, i = 2; while (used.has(f)) f = `${base}-${i++}.html`; return f;
}
/** The titles from the root down to the node, joined (" > "): where the page is in the portal. */
export function pathTitles(sm, path) { const out = []; let n = sm.root; out.push(n.title); for (const i of path) { n = n.children[i]; if (!n) break; out.push(n.title); } return out.join(" > "); }

/** The open review comments of the user on the pages: [{ path, where: "Portal > Study > Exams", comment }]. */
export function commentsOf(sm) {
  const out = [];
  const walk = (n, path, titles) => { const t = [...titles, n.title]; if (n.comment) out.push({ path, where: t.join(" > "), comment: n.comment }); n.children.forEach((c, i) => walk(c, [...path, i], t)); };
  if (sm?.root) walk(sm.root, [], []);
  return out;
}

/** The comments grouped by their text: pages the user commented on together share one comment: [{ comment, wheres: [...] }]. */
export function groupComments(sm) {
  const by = new Map();
  for (const c of commentsOf(sm)) { const g = by.get(c.comment) ?? { comment: c.comment, wheres: [] }; g.wheres.push(c.where); by.set(c.comment, g); }
  return [...by.values()];
}

/** The request to the agent to revise the map: the comments of the user on pages and/or a general wish, with the plan as it is now. */
export function reviseMessage({ slug, sm, extra = "", body = "" }) {
  const list = groupComments(sm), wish = String(extra).trim();
  const head = slug ? `Revise the SITEMAP of this plan, it is the file plans/${slug}.md (the user may have edited it, so start from this text).` : "Revise the SITEMAP of this project, it is the file sitemap.json (the user may have edited it, so start from the map below, comments included).";
  return [
    head,
    ...(list.length ? ["", "The user commented on these pages of the map (the `comment` field of each node). Resolve every comment: change the map as it asks (rename, move, merge, split, make a page a section or the other way round, add or remove pages), or when you disagree say why in the `note` of that node. Then leave the `comment` fields out of the new map.", ...list.map((c) => `- ${c.wheres.join("; ")}${c.wheres.length > 1 ? " (together)" : ""}: ${c.comment}`)] : []),
    ...(wish ? ["", `The user also asks, about the map as a whole: ${wish}`] : []),
    "", slug ? "Keep the rest of the plan as it is, and answer with the whole plan, the changed `uu5-sitemap` block included." : "Answer with a short plan in the usual format: what you changed and why, and the whole revised map as the `uu5-sitemap` block (no component tree). The user reviews it and approves it; only then it replaces the sitemap of the project.",
    "", slug ? String(body).trim() : "```uu5-sitemap\n" + serializeSitemap(sm) + "\n```",
  ].join("\n");
}

// ---------------------------------------------------------------- the map and the screens that really exist
/** file -> path of the node that names it. */
export function fileNodes(sm) {
  const m = new Map();
  const walk = (n, path) => { if (n.file && !m.has(n.file)) m.set(n.file, path); n.children.forEach((c, i) => walk(c, [...path, i])); };
  if (sm?.root) walk(sm.root, []);
  return m;
}
const isPrefix = (a, b) => a.length <= b.length && a.every((x, i) => x === b[i]);

/**
 * What the screens do that the map does not say: `extra` = links between two pages of the map that are not in the map (the map shows no relation
 * between them: not parent and child, not on one path, not siblings), `unmapped` = screens that no page names, `missing` = files of the map without a screen.
 * `edges` = [{ from, to }] as the flow of the screens finds them.
 */
export function linkDiff(sm, edges, screens = []) {
  const where = fileNodes(sm), extra = [], seen = new Set();
  for (const e of edges ?? []) {
    const a = where.get(e.from), b = where.get(e.to); if (!a || !b || e.from === e.to) continue;
    const covered = isPrefix(a, b) || isPrefix(b, a) || (a.length === b.length && a.slice(0, -1).join(".") === b.slice(0, -1).join("."));
    const key = `${e.from}>${e.to}`; if (!covered && !seen.has(key)) { seen.add(key); extra.push({ from: e.from, to: e.to }); }
  }
  return { extra, unmapped: screens.filter((f) => !where.has(f)), missing: [...where.keys()].filter((f) => !screens.includes(f)) };
}

/** "room-list.html" -> "Room list". */
export const titleFromFile = (file) => { const t = String(file).replace(/\.html$/, "").replace(/[-_]+/g, " ").trim(); return t ? t[0].toUpperCase() + t.slice(1) : "Page"; };

/**
 * A first map made of the screens that exist: the root is index / home (or the screen that links to most others), the pages below it follow the
 * links of the content (the menu links, which every screen has, would make everything a child of the root); screens that no content link reaches go under the root.
 * `edges` = [{ from, to, nav }]. Returns a sitemap or null without screens.
 */
export function sitemapFromScreens({ screens, edges = [] }) {
  const list = [...new Set(screens ?? [])]; if (!list.length) return null;
  const links = new Map(list.map((f) => [f, []]));
  const count = new Map(list.map((f) => [f, 0]));
  for (const e of edges) { if (e.from === e.to || !links.has(e.from) || !links.has(e.to)) continue; count.set(e.from, count.get(e.from) + 1); if (!e.nav && !links.get(e.from).includes(e.to)) links.get(e.from).push(e.to); }
  const root = list.find((f) => /^(index|home|start|main)\.html$/.test(f)) ?? [...list].sort((a, b) => count.get(b) - count.get(a))[0];
  const children = new Map(list.map((f) => [f, []])), q2 = [root], vis = new Set([root]); // breadth first: a screen belongs to the first one that links to it
  while (q2.length) { const f = q2.shift(); for (const t of links.get(f)) if (!vis.has(t)) { vis.add(t); children.get(f).push(t); q2.push(t); } }
  for (const f of list) if (!vis.has(f)) { vis.add(f); children.get(root).push(f); }
  const node = (f) => ({ title: titleFromFile(f), type: "page", file: f, children: children.get(f).map(node) });
  return normalizeSitemap({ root: node(root) });
}

/** The map with a page for a screen added under the page at `path` (the root by default). */
export function addScreenPage(sm, file, path = []) {
  const out = clone(sm), n = getNode(out, path) ?? out.root;
  n.children.push({ id: uniqueId(out, slugify(titleFromFile(file))), title: titleFromFile(file), type: "page", file, children: [] });
  return out;
}

// ---------------------------------------------------------------- where a sitemap is offered
export const SCOPES = ["single", "site"];
/** The levels that have a second choice on the dashboard (one page, or the whole web site / portal). */
export const hasScope = (level) => level === "web" || level === "page";
/**
 * Whether the app offers the sitemap in a project (the button of the toolbar, the hint on a plan). A sitemap that exists is always shown;
 * otherwise only a project started as a whole web site or portal (scope "site") gets it, not one page, an application, a route or a component.
 * A project made before the scope was stored (no scope) is judged by its level: Web and Document keep the button.
 */
export function sitemapOffered({ hasSitemap = false, scope = null, level = null } = {}) {
  if (hasSitemap) return true;
  if (scope === "site") return true;
  if (scope === "single") return false;
  return hasScope(level);
}

// ---------------------------------------------------------------- progress and folding
/** How many pages (type page with a file) have a screen that exists. */
export function countBuilt(sm, exists) { let n = 0; const walk = (x) => { if (x.type === "page" && x.file && exists(x.file)) n++; x.children.forEach(walk); }; if (sm?.root) walk(sm.root); return n; }
/** ids of the nodes below the first level that have children (what "Collapse all" folds; the root and its pages stay in sight). */
export function foldable(sm, minDepth = 1) { const ids = []; const walk = (x, d) => { if (d >= minDepth && x.children.length) ids.push(x.id); x.children.forEach((c) => walk(c, d + 1)); }; if (sm?.root) walk(sm.root, 0); return ids; }
/** A big map starts folded below its second level; a small one open. */
export const defaultCollapsed = (sm, limit = 40) => (countNodes(sm) > limit ? foldable(sm, 2) : []);
/** The number of nodes below a node. */
export const descendants = (n) => n.children.reduce((a, c) => a + 1 + descendants(c), 0);

/** The map as indented lines for the agent: title, type, file and note of every node (what exists, what is planned). */
export function sitemapOutline(sm, { limit = 6000 } = {}) {
  const lines = [];
  const walk = (n, d) => { lines.push(`${"  ".repeat(d)}- ${n.title}${n.type !== "page" ? ` [${n.type}]` : ""}${n.file ? ` -> ${n.file}` : ""}${n.note ? ` (${n.note})` : ""}`); n.children.forEach((c) => walk(c, d + 1)); };
  if (sm?.root) walk(sm.root, 0);
  const text = lines.join("\n");
  return text.length > limit ? `${text.slice(0, limit)}\n… (shortened, read sitemap.json for the rest)` : text;
}

// ---------------------------------------------------------------- the map as a picture (to share it)
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cut = (t, n) => (String(t).length > n ? `${String(t).slice(0, n - 1)}…` : String(t));
/**
 * The whole map (every branch unfolded) as an SVG picture, the root on the left and the pages to the right, as in the app. Review comments are not drawn.
 * `isScreen(file)` marks the pages that have a screen; the branches in `collapsed` (ids) stay folded, with the number of pages below, exactly as in the app. Returns { svg, width, height }.
 */
export function sitemapSvg(sm, { isScreen = () => false, collapsed = new Set() } = {}) {
  const NW = 236, NH = 34, GX = 44, GY = 12, PAD = 28;
  if (!sm?.root) return { svg: "", width: 0, height: 0 };
  let cursor = 0, maxDepth = 0; const flat = [], edges = [];
  const lay = (n, depth) => {
    maxDepth = Math.max(maxDepth, depth);
    const folded = n.children.length > 0 && collapsed.has(n.id), kids = folded ? [] : n.children.map((c) => lay(c, depth + 1)), box = { n, folded, x: PAD + depth * (NW + GX), y: 0 };
    if (kids.length) box.y = (kids[0].y + kids[kids.length - 1].y) / 2; else { box.y = PAD + cursor; cursor += NH + GY; }
    for (const k of kids) edges.push([box, k]); flat.push(box); return box;
  };
  lay(sm.root, 0);
  const width = PAD * 2 + (maxDepth + 1) * NW + maxDepth * GX, height = PAD * 2 + Math.max(NH, cursor - GY);
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}" font-size="13">`, `<rect width="100%" height="100%" fill="#ffffff"/>`];
  for (const [a, b] of edges) { const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, xm = x1 + GX / 2; out.push(`<path d="M${x1} ${y1}H${xm}V${y2}H${x2}" fill="none" stroke="#cdd3dd" stroke-width="1.5"/>`); }
  for (const { n, x, y, folded } of flat) {
    const t = n.type, accent = t === "external" ? "#e0912f" : t === "page" ? "#2f6df6" : t === "group" ? "#98a2b3" : "#cdd3dd";
    const dash = t === "group" ? ` stroke-dasharray="5 3"` : "";
    const sec = t === "section"; // a block of a page: a tinted pill in full colour, without the bar of a page (grey is for what is not solved here)
    const fill = t === "stub" ? "#f4f5f7" : sec ? "#eef3fe" : "#ffffff", ink = t === "stub" || t === "group" ? "#667085" : "#1d1f24";
    out.push(`<rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="${sec ? NH / 2 : 8}" fill="${fill}" stroke="${sec ? "#b9cdfb" : "#d6dbe4"}"${dash}/>`);
    if (!sec) out.push(`<rect x="${x}" y="${y + 6}" width="3" height="${NH - 12}" rx="1.5" fill="${accent}"/>`);
    let mark = "", col = "#667085";
    if (t === "external") mark = "↗"; else if (t === "stub") mark = "–"; else if (t === "page") { const ok = n.file && isScreen(n.file); mark = ok ? "✔" : "○"; col = ok ? "#2f8f49" : "#667085"; }
    if (mark) out.push(`<text x="${x + 14}" y="${y + NH / 2 + 4.5}" fill="${col}">${mark}</text>`);
    out.push(`<text x="${x + (mark ? 32 : 14)}" y="${y + NH / 2 + 4.5}" fill="${ink}"${t === "section" ? ` font-size="12"` : ""}>${esc(cut(n.title, (mark ? 28 : 31) - (folded ? 5 : 0)))}</text>`);
    if (folded) out.push(`<text x="${x + NW - 12}" y="${y + NH / 2 + 4}" text-anchor="end" fill="#667085" font-size="12">▸ ${descendants(n)}</text>`);
  }
  out.push("</svg>");
  return { svg: out.join(""), width, height };
}
