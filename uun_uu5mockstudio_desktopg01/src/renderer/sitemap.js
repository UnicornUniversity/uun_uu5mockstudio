import { slugify } from "./planDoc.js";
import { parseLink } from "./docLinks.js";

/**
 * The sitemap of a portal or a web site: a tree of pages. In a plan it is the fenced block `uu5-sitemap`:
 * { "kind"?: "web" | "portal", "root": { "id", "title", "type": "page" | "sheet" | "section" | "group" | "external", "notSolved"?: true, "file"?: "x.html", "note"?, "source"?, "children"?: [ … ] } }.
 * `notSolved` is a flag of a page, a sheet or a section that exists but is not solved here: it stays in the map, no screen is built for it and it is not counted.
 * An external link is always not solved here (it leads out), so it looks the same. The old type "stub" is read as a page with the flag.
 * `kind` says what the map is: a web site (pages and their sections, the default, not written) or portals (documents of uuManagementKit: a portal is a node
 * of type page, it is made of sheets, a sheet of sections). A sheet has a screen of its own, as a page.
 * `source` is the address the page was taken from (a page of a book, a document, a web page): its content is read when the screen is built.
 * Everything here is pure; a node is addressed by its path (list of child indexes, the root is []).
 */
export const NODE_TYPES = ["page", "sheet", "section", "group", "external"];
/** The types that can be marked as not solved here. */
export const canFlag = (t) => t === "page" || t === "sheet" || t === "section";
/** What is not solved here: a node with the flag, and an external link always (it leads out). */
export const isOutside = (n) => Boolean(n && (n.type === "external" || (n.notSolved && canFlag(n.type))));
/** What the map is: a web site, or portals (documents of uuManagementKit made of sheets). */
export const MAP_KINDS = ["web", "portal"];
export const kindOf = (sm) => (sm?.kind === "portal" ? "portal" : "web");
/** The kinds of nodes that have a screen of their own. */
export const isScreenType = (t) => t === "page" || t === "sheet";
const TYPE_ALIAS = { portal: "page", document: "page", list: "sheet", stub: "page" }; // what the agent may write for a portal or a sheet
const typeOf = (t) => (NODE_TYPES.includes(t) ? t : TYPE_ALIAS[t]);
/** The names of the types as the user reads them, in a map of a web site or of portals. */
export function typeLabels(kind = "web") {
  const portal = kind === "portal";
  return {
    page: portal ? "Portal (document)" : "Page (own screen)",
    sheet: portal ? "Sheet (own screen)" : "Sheet (of a portal)",
    section: portal ? "Section (part of a sheet)" : "Section (part of a page)",
    group: "Group (menu only)", external: "External link",
  };
}
/** The short name of a type (the chip on a node, the counts). */
export const typeShort = (kind, t) => (({ page: kind === "portal" ? "Portal" : "Page", sheet: "Sheet", section: "Section", group: "Group", external: "Link" })[t] ?? t);
/** The types the map offers: a map of a web site has no sheets (unless it has one already). */
export const typesFor = (sm) => (kindOf(sm) === "portal" || countType(sm, (t) => t === "sheet") ? NODE_TYPES : NODE_TYPES.filter((t) => t !== "sheet"));
const MAX_NODES = 200, MAX_DEPTH = 8, FILE = /^[A-Za-z0-9][\w.-]*\.html$/;
/** Several comments on one page are kept in the one `comment` field, apart by this mark. */
export const CM_SEP = " ¦ ";
export const splitComments = (c) => String(c ?? "").split(CM_SEP).map((t) => t.trim()).filter(Boolean);
export const joinComments = (l) => l.map((t) => String(t).replace(/\s*¦\s*/g, " ").trim()).filter(Boolean).join(CM_SEP);
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** The address a page was taken from, when it is a link the app can read (http/https, at most 500 characters). */
const sourceOf = (v) => { const d = typeof v === "string" && v.length <= 500 ? parseLink(v) : null; return d ? d.url : undefined; };

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
    const type = typeOf(n.type) ?? "page", note = clip(n.note, 240), comment = clip(n.comment, 1000), source = sourceOf(n.source);
    const notSolved = (n.notSolved === true || n.type === "stub") && canFlag(type);
    return { id: myId, title, type, ...(notSolved ? { notSolved } : {}), ...(file ? { file } : {}), ...(note ? { note } : {}), ...(source ? { source } : {}), ...(comment ? { comment } : {}), children: kids };
  };
  const root = walk(src, 0), kind = raw?.kind === "portal" ? "portal" : null;
  return root ? { ...(kind ? { kind } : {}), root } : null;
}

export const serializeSitemap = (sm) => JSON.stringify(sm, null, 2);
/** All nodes of the map (the limit of its size). */
export const countNodes = (sm) => { let n = 0; const walk = (x) => { n++; x.children.forEach(walk); }; if (sm?.root) walk(sm.root); return n; };
const countType = (sm, ok) => { let n = 0; const walk = (x) => { if (ok(x.type) && !x.notSolved) n++; x.children.forEach(walk); }; if (sm?.root) walk(sm.root); return n; };
/** The pages (their own screens): sections are parts of a page, groups only gather pages in the menu, external ones lead out; what is not solved here is not counted. */
export const countPages = (sm) => countType(sm, (t) => t === "page");
export const countSections = (sm) => countType(sm, (t) => t === "section");
export const countSheets = (sm) => countType(sm, (t) => t === "sheet");
/** The nodes that have (or will have) a screen of their own: pages and sheets. */
export const countScreens = (sm) => countType(sm, isScreenType);
const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
/** What the map holds, in words: "12 pages, 4 sections" or, for portals, "3 portals, 18 sheets, 9 sections". */
export function mapSummary(sm) {
  const portal = kindOf(sm) === "portal", pages = countPages(sm), sheets = countSheets(sm), sections = countSections(sm);
  return [plural(pages, portal ? "portal" : "page"), ...(sheets || portal ? [plural(sheets, "sheet")] : []), ...(sections ? [plural(sections, "section")] : [])].join(", ");
}
/** The map of another kind (web site or portals); the nodes stay as they are. */
export function setKind(sm, kind) { const out = clone(sm); if (kind === "portal") return { kind, root: out.root }; return { root: out.root }; }

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
    else if (k === "type") { const t = typeOf(v); if (t) { n.type = t; if (!canFlag(t)) delete n.notSolved; } }
    else if (k === "notSolved") { if (v && canFlag(n.type)) n.notSolved = true; else delete n.notSolved; }
    else if (k === "file") { if (!v) delete n.file; else if (FILE.test(String(v))) n.file = String(v); }
    else if (k === "note") { const t = clip(v, 240); if (t) n.note = t; else delete n.note; }
    else if (k === "source") { const u = sourceOf(v); if (u) n.source = u; else delete n.source; }
    else if (k === "comment") { const t = clip(v, 1000); if (t) n.comment = t; else delete n.comment; }
  }
  return out;
}

/** The same patch on several nodes (their paths stay valid: nothing moves). */
export function updateNodes(sm, paths, patch) { return paths.reduce((acc, p) => updateNode(acc, p, patch), sm); }

const uniqueId = (sm, base) => { const ids = new Set(); const walk = (n) => { ids.add(n.id); n.children.forEach(walk); }; walk(sm.root); let v = base, i = 2; while (ids.has(v)) v = `${base}-${i++}`; return v; };
const blank = (sm, title, type = "page") => { const t = title || (kindOf(sm) === "portal" ? `New ${typeShort("portal", type).toLowerCase()}` : "New page"); return { id: uniqueId(sm, slugify(t)), title: t, type, children: [] }; };
/** In a map of portals a portal is made of sheets and a sheet of sections; in a web site a new node is a page. */
export function childType(sm, parent) { if (kindOf(sm) !== "portal") return "page"; return parent?.type === "page" ? "sheet" : parent?.type === "sheet" || parent?.type === "section" ? "section" : "page"; }
const siblingType = (sm, node) => (kindOf(sm) === "portal" && ["page", "sheet", "section"].includes(node?.type) ? node.type : "page");

/** A child at the end of the node; returns { sitemap, path } with the path of the new node. */
export function addChild(sm, path, title) {
  const out = clone(sm), n = getNode(out, path); if (!n || countNodes(out) >= MAX_NODES || path.length >= MAX_DEPTH) return { sitemap: sm, path };
  n.children.push(blank(out, title, childType(out, n))); return { sitemap: out, path: [...path, n.children.length - 1] };
}
/** A sibling right after the node (a child of the root for the root itself). */
export function addSibling(sm, path, title) {
  if (!path.length) return addChild(sm, path, title);
  const out = clone(sm), p = parentOf(out, path); if (!p || countNodes(out) >= MAX_NODES) return { sitemap: sm, path };
  const at = path[path.length - 1] + 1; p.children.splice(at, 0, blank(out, title, siblingType(out, getNode(out, path)))); return { sitemap: out, path: [...path.slice(0, -1), at] };
}
/** A copy of a leaf right after it: the same type and note, the title with "(copy)"; the screen file and the comments stay with the original. Nothing changes for the root or a page with sub-pages. */
export function duplicateNode(sm, path) {
  const src = getNode(sm, path); if (!path.length || !src || src.children.length || countNodes(sm) >= MAX_NODES) return { sitemap: sm, path };
  const out = clone(sm), p = parentOf(out, path), at = path[path.length - 1] + 1, title = clip(`${src.title.slice(0, 73)} (copy)`, 80);
  p.children.splice(at, 0, { id: uniqueId(out, slugify(title)), title, type: src.type, ...(src.notSolved ? { notSolved: true } : {}), ...(src.note ? { note: src.note } : {}), children: [] });
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
    ...(kindOf(sm) === "portal" ? ["", "It is a map of PORTALS (`\"kind\": \"portal\"`, keep it): a node of type `page` is a portal (a document of uuManagementKit), a `sheet` is a sheet of the portal above it with its own screen, a `section` is a part of the sheet above it."] : []),
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
/** How many pages and sheets (with a file) have a screen that exists. */
export function countBuilt(sm, exists) { let n = 0; const walk = (x) => { if (isScreenType(x.type) && !x.notSolved && x.file && exists(x.file)) n++; x.children.forEach(walk); }; if (sm?.root) walk(sm.root); return n; }
/** ids of the nodes below the first level that have children (what "Collapse all" folds; the root and its pages stay in sight). */
export function foldable(sm, minDepth = 1) { const ids = []; const walk = (x, d) => { if (d >= minDepth && x.children.length) ids.push(x.id); x.children.forEach((c) => walk(c, d + 1)); }; if (sm?.root) walk(sm.root, 0); return ids; }
/** A big map starts folded below its second level; a small one open. */
export const defaultCollapsed = (sm, limit = 40) => (countNodes(sm) > limit ? foldable(sm, 2) : []);
/** The number of nodes below a node. */
export const descendants = (n) => n.children.reduce((a, c) => a + 1 + descendants(c), 0);

/** Text without diacritics and case, to compare what the user types with the map. */
const fold = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/**
 * The pages that match a search: the title, the screen file, the note or the comment of a page contains every word of `query` (no case, no diacritics).
 * Returns { hits: [{ path, id }] in the order of the map, open: ids of the pages above the hits (they have to be unfolded to show them) }.
 */
export function searchNodes(sm, query) {
  const words = fold(query).split(/\s+/).filter(Boolean), hits = [], open = new Set();
  if (!words.length || !sm?.root) return { hits, open: [] };
  const walk = (n, path, up) => {
    const text = fold([n.title, n.file, n.note, n.comment].filter(Boolean).join(" "));
    if (words.every((w) => text.includes(w))) { hits.push({ path, id: n.id }); up.forEach((id) => open.add(id)); }
    n.children.forEach((c, i) => walk(c, [...path, i], [...up, n.id]));
  };
  walk(sm.root, [], []);
  return { hits, open: [...open] };
}

/** The map as indented lines for the agent: title, type, file, note and source of every node (what exists, what is planned). */
export function sitemapOutline(sm, { limit = 6000 } = {}) {
  const lines = [];
  const walk = (n, d) => { lines.push(`${"  ".repeat(d)}- ${n.title}${n.type !== "page" ? ` [${n.type}]` : ""}${n.notSolved ? " [not solved here: no screen]" : ""}${n.file ? ` -> ${n.file}` : ""}${n.note ? ` (${n.note})` : ""}${n.source ? ` [source: ${n.source}]` : ""}`); n.children.forEach((c) => walk(c, d + 1)); };
  if (kindOf(sm) === "portal") lines.push("(a map of portals: [page] nodes are portals, documents of uuManagementKit; a [sheet] is a sheet of the portal above, with its own screen; a [section] is a part of the sheet above)");
  if (sm?.root) walk(sm.root, 0);
  const text = lines.join("\n");
  return text.length > limit ? `${text.slice(0, limit)}\n… (shortened, read sitemap.json for the rest)` : text;
}

// ---------------------------------------------------------------- the map as a picture (to share it)
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cut = (t, n) => (String(t).length > n ? `${String(t).slice(0, n - 1)}…` : String(t));
/** The kinds of nodes the picture tells apart, in the order of the legend (what each one means for the user reading the picture). */
export function svgLegend(kind = "web") {
  const portal = kind === "portal", P = portal ? "Portal" : "Page";
  return [
    { key: "built", type: "page", label: `${P}, its screen is built` },
    { key: "planned", type: "page", label: `${P}, no screen yet` },
    { key: "sheet-built", type: "sheet", label: `Sheet${portal ? " of the portal" : ""}, its screen is built` },
    { key: "sheet-planned", type: "sheet", label: `Sheet${portal ? " of the portal" : ""}, no screen yet` },
    { key: "section", type: "section", label: portal ? "Section, part of the sheet above" : "Section, part of the page above" },
    { key: "group", type: "group", label: "Group, only a menu item" },
    { key: "external", type: "external", label: portal ? "Link out of the portal" : "Link out of the site" },
    { key: "outside", type: "page", ns: true, label: "Not solved here, no screen is built" },
    { key: "folded", type: "page", label: "Folded branch, pages below" },
  ];
}
export const SVG_LEGEND = svgLegend("web");
/** One node as SVG: the box, the accent bar, the mark (✔ ○ ↗ –), the title and, for a folded branch, the number below. */
function nodeSvg({ x, y, w, h, type: t, ns = false, built, title = "", folded = 0, maxChars = 31 }) {
  const grey = ns || t === "external"; // not solved here (an external link always): grey, whatever its type
  const out = [], accent = grey ? "#cdd3dd" : t === "page" ? "#2f6df6" : t === "sheet" ? "#14a3a3" : t === "group" ? "#98a2b3" : "#cdd3dd";
  const dash = t === "group" ? ` stroke-dasharray="5 3"` : "";
  const sec = t === "section"; // a block of a page: a tinted pill in full colour, without the bar of a page (grey is for what is not solved here)
  const fill = grey ? "#f4f5f7" : sec ? "#eef3fe" : "#ffffff", ink = grey || t === "group" ? "#667085" : "#1d1f24";
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${sec ? h / 2 : 8}" fill="${fill}" stroke="${sec && !grey ? "#b9cdfb" : "#d6dbe4"}"${dash}/>`);
  if (!sec) out.push(`<rect x="${x}" y="${y + 6}" width="3" height="${h - 12}" rx="1.5" fill="${accent}"/>`);
  let mark = "", col = "#667085";
  if (t === "external") mark = "↗"; else if (ns) mark = "–"; else if (isScreenType(t)) { mark = built ? "✔" : "○"; col = built ? "#2f8f49" : "#667085"; }
  if (mark) out.push(`<text x="${x + 14}" y="${y + h / 2 + 4.5}" fill="${col}">${mark}</text>`);
  if (title) out.push(`<text x="${x + (mark ? 32 : 14)}" y="${y + h / 2 + 4.5}" fill="${ink}"${sec ? ` font-size="12"` : ""}>${esc(cut(title, (mark ? maxChars - 3 : maxChars) - (folded ? 5 : 0)))}</text>`);
  if (folded) out.push(`<text x="${x + w - 12}" y="${y + h / 2 + 4}" text-anchor="end" fill="#667085" font-size="12">▸ ${folded}</text>`);
  return out.join("");
}
/**
 * The whole map (every branch unfolded) as an SVG picture, the root on the left and the pages to the right, as in the app. Review comments are not drawn.
 * `isScreen(file)` marks the pages that have a screen; the branches in `collapsed` (ids) stay folded, with the number of pages below, exactly as in the app.
 * Below the map a legend explains the kinds of nodes the map uses (only those; `legend: false` leaves it out). Returns { svg, width, height }.
 */
export function sitemapSvg(sm, { isScreen = () => false, collapsed = new Set(), legend = true } = {}) {
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
  const mapHeight = PAD * 2 + Math.max(NH, cursor - GY);
  let width = PAD * 2 + (maxDepth + 1) * NW + maxDepth * GX;
  // ----- the legend: the kinds used by this map, as small nodes with a text, in rows as wide as the map
  const used = new Set();
  for (const { n, folded } of flat) {
    const b = n.file && isScreen(n.file);
    used.add(n.notSolved ? "outside" : n.type === "page" ? (b ? "built" : "planned") : n.type === "sheet" ? (b ? "sheet-built" : "sheet-planned") : n.type);
    if (folded) used.add("folded");
  }
  const items = legend ? svgLegend(kindOf(sm)).filter((l) => used.has(l.key)) : [];
  const LW = 64, LH = 26, LGAP = 10, LROW = LH + 10, textW = (t) => Math.ceil(t.length * 6.6);
  width = Math.max(width, items.length ? PAD * 2 + LW + LGAP + Math.max(...items.map((l) => textW(l.label))) : 0);
  const placed = []; let lx = PAD, ly = 0;
  for (const l of items) {
    const w = LW + LGAP + textW(l.label);
    if (lx > PAD && lx + w > width - PAD) { lx = PAD; ly += LROW; }
    placed.push({ ...l, x: lx, y: ly }); lx += w + 28;
  }
  const legendTop = mapHeight, legendHeight = placed.length ? 24 + 18 + ly + LH + PAD : 0, height = mapHeight + legendHeight;
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}" font-size="13">`, `<rect width="100%" height="100%" fill="#ffffff"/>`];
  for (const [a, b] of edges) { const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, xm = x1 + GX / 2; out.push(`<path d="M${x1} ${y1}H${xm}V${y2}H${x2}" fill="none" stroke="#cdd3dd" stroke-width="1.5"/>`); }
  for (const { n, x, y, folded } of flat) out.push(nodeSvg({ x, y, w: NW, h: NH, type: n.type, ns: Boolean(n.notSolved), built: Boolean(n.file && isScreen(n.file)), title: n.title, folded: folded ? descendants(n) : 0 }));
  if (placed.length) {
    const top = legendTop + 4;
    out.push(`<g class="legend"><line x1="${PAD}" y1="${top}" x2="${width - PAD}" y2="${top}" stroke="#e4e7ec"/>`);
    out.push(`<text x="${PAD}" y="${top + 24}" fill="#667085" font-size="11" font-weight="600" letter-spacing=".06em">LEGEND</text>`);
    for (const l of placed) {
      const y = top + 24 + 14 + l.y;
      out.push(nodeSvg({ x: l.x, y, w: LW, h: LH, type: l.type, ns: Boolean(l.ns), built: l.key === "built" || l.key === "sheet-built", folded: l.key === "folded" ? "N" : 0 }));
      out.push(`<text x="${l.x + LW + LGAP}" y="${y + LH / 2 + 4}" fill="#344054" font-size="12">${esc(l.label)}</text>`);
    }
    out.push("</g>");
  }
  out.push("</svg>");
  return { svg: out.join(""), width, height };
}

// ---------------------------------------------------------------- the map as a uu5string (Uu5TreeBricks.Tree, to paste it into a book)
const U5_SCHEME = { page: "primary", sheet: "info", section: "neutral", group: "neutral", external: "neutral" };
const u5Text = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
/**
 * The whole map as a uu5string with `Uu5TreeBricks.Tree`: a title and a badge with the kind of each node, nested as in the map.
 * The branches in `collapsed` (ids) stay folded, as in the app. Comments, notes, files and sources are left out. Returns "" when there is no map.
 */
export function sitemapUu5String(sm, { collapsed = new Set() } = {}) {
  if (!sm?.root) return "";
  const kind = kindOf(sm);
  const item = (n) => {
    const out = isOutside(n), scheme = out ? "neutral" : U5_SCHEME[n.type] ?? "neutral", label = typeShort(kind, n.type).toUpperCase();
    const badge = (s, text) => `<Uu5Bricks.Badge colorScheme="${s}">${text}</Uu5Bricks.Badge>`;
    const it = { header: `<uu5string />${u5Text(n.title)} ${badge(scheme, label)}${n.notSolved ? ` ${badge("neutral", "NOT SOLVED")}` : ""}`, colorScheme: scheme };
    if (out || n.type === "group") it.significance = "subdued";
    if (n.children.length) { it.expanded = !collapsed.has(n.id); it.itemList = n.children.map(item); }
    return it;
  };
  const json = JSON.stringify([item(sm.root)]).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `<Uu5TreeBricks.Tree itemList="<uu5json/>${json}" itemSignificance="distinct"/>`;
}
