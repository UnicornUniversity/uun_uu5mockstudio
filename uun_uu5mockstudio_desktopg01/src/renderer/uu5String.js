/**
 * Turns the tree collected from a screen (`uu5StringCollect.js`) into a uu5String that can be pasted into a document, and describes
 * what could not go in. Pure functions, no DOM.
 *
 * Rules: `<uu5string/>` prefix; numbers and booleans unquoted; data as `'<uu5json/>…'`; JSX in a prop as a nested `"<uu5string/>…"`;
 * strings in the quotes they do not contain (double, else single, else double with `\"`); children with text stay on one line exactly
 * as they are, children that are only elements go one per line.
 */
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "source", "wbr", "col", "area"]);

export function quote(s) {
  s = String(s);
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const escapeText = (s) => s.replace(/<(?=[A-Za-z/!])/g, "&lt;");
/**
 * A space at the edge of a text, next to a tag (`Zbývá <span>7 míst</span> za`), is trimmed by the uu5String parsers of documents;
 * written as `&nbsp;` it survives (uu5g05 renders the entity as a space). Spaces inside a text stay as they are.
 */
const keepEdgeSpaces = (s) => s.replace(/^[ \t\r\n]+(?=\S)/, "&nbsp;").replace(/(?<=\S)[ \t\r\n]+$/, "&nbsp;").replace(/^[ \t\r\n]+$/, "&nbsp;");

/** Adjacent texts merged (JSX splits `{" "}text` into two). */
function normalize(nodes = []) {
  const out = [];
  for (const n of nodes) {
    if (!n) continue;
    if (n.t === "text") { if (n.v === "") continue; const last = out.at(-1); if (last?.t === "text") last.v += n.v; else out.push({ ...n }); }
    else out.push(n);
  }
  return out;
}

export function createSerializer() {
  const stats = { components: 0, html: 0, jsxInData: 0 };
  const names = new Set();

  const nested = (nodes) => {
    const list = normalize(nodes);
    if (list.every((n) => n.t === "text")) return list.map((n) => n.v).join("");
    return "<uu5string/>" + list.map((n) => node(n, "", true)).join("");
  };
  const data = (v) => {
    if (Array.isArray(v)) return v.map(data);
    if (v && typeof v === "object") {
      if (v.$nodes) { stats.jsxInData++; return nested(v.$nodes); }
      const o = {}; for (const k of Object.keys(v)) o[k] = data(v[k]); return o;
    }
    return v;
  };
  const attr = (v) => {
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "string") return quote(v);
    if (v && v.$json !== undefined) return quote("<uu5json/>" + JSON.stringify(data(v.$json)));
    if (v && v.$nodes) return quote(nested(v.$nodes));
    return quote(String(v));
  };
  function children(list, indent, inline) {
    const nodes = normalize(list);
    if (inline || nodes.some((n) => n.t === "text" && n.v.trim())) return nodes.map((n) => node(n, "", true)).join("");
    return "\n" + nodes.filter((n) => n.t !== "text").map((n) => indent + "  " + node(n, indent + "  ", false)).join("\n") + "\n" + indent;
  }
  function node(n, indent, inline) {
    if (n.t === "text") return keepEdgeSpaces(escapeText(n.v));
    if (n.host) stats.html++; else { stats.components++; names.add(n.name); }
    const attrs = Object.entries(n.props ?? {}).map(([k, v]) => ` ${k}=${attr(v)}`).join("");
    const kids = normalize(n.children);
    if (!kids.length) return n.host && !VOID.has(n.name) ? `<${n.name}${attrs}></${n.name}>` : `<${n.name}${attrs}/>`;
    return `<${n.name}${attrs}>${children(kids, indent, inline)}</${n.name}>`;
  }
  const render = (nodes) => normalize(nodes).filter((n) => n.t !== "text" || n.v.trim()).map((n) => node(n, "", false)).join("\n");
  return { render, stats, names };
}

/** `tree` = the result of `collectUu5Tree`. Returns `{ text, stats, notes }` (`notes`: what was left out or may not render, for the user). */
export function toUu5String(tree) {
  const s = createSerializer();
  const body = s.render(tree?.nodes ?? []);
  return { text: body ? `<uu5string/>\n${body}\n` : "", stats: { ...s.stats, names: [...s.names].sort() }, notes: notesOf(tree?.report ?? {}, s.stats, tree?.missing ?? []) };
}

const times = (o) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
const list = (a, max = 6) => (a.length > max ? `${a.slice(0, max).join(", ")} and ${a.length - max} more` : a.join(", "));

export function notesOf(report, stats = {}, missing = []) {
  const notes = [];
  const fn = times(report.fn);
  if (fn.length) notes.push(`Left out functions (event handlers do not go into uu5String): ${list(fn)}.`);
  const closed = times(report.closed);
  if (closed.length) notes.push(`Left out closed dialogs: ${list(closed)}. Open one in the screen and copy again to include it.`);
  const unresolved = times(report.unresolved);
  if (unresolved.length) notes.push(`Not rendered, so left out: ${list(unresolved)}.`);
  if (report.renderProp) notes.push(`Left out ${report.renderProp} child render function${report.renderProp > 1 ? "s" : ""}.`);
  if (report.cssLost?.length) notes.push(`CSS that cannot be written inline (hover, nested selectors, missing rules): ${list(report.cssLost)}.`);
  if (stats.jsxInData) notes.push(`${stats.jsxInData} piece${stats.jsxInData > 1 ? "s" : ""} of JSX inside data written as nested uu5String; it may show as text.`);
  const skipped = times(report.skipped);
  if (skipped.length) notes.push(`Values that are not plain data were left out: ${list(skipped)}.`);
  if (missing.length) notes.push(`${missing.length} chosen component${missing.length > 1 ? "s are" : " is"} not rendered in the screen now.`);
  if (report.truncated) notes.push("The screen is too large: the result was cut off.");
  return notes;
}

/** One line for a toast. */
export function summaryOf(result, { scope = "screen" } = {}) {
  const what = scope === "screen" ? "The screen" : scope;
  const n = result.stats.components;
  const left = result.notes.length ? ` ${result.notes.length} note${result.notes.length > 1 ? "s" : ""} on what was left out.` : "";
  return `${what} copied as uu5String (${n} component${n === 1 ? "" : "s"}, ${Math.max(1, Math.round(result.text.length / 1024))} kB).${left}`;
}

/** Several collected trees (components marked in more screens) as one: nodes one after another, the reports added up. */
export function mergeTrees(trees) {
  const add = (a = {}, b = {}) => { const o = { ...a }; for (const [k, n] of Object.entries(b)) o[k] = (o[k] ?? 0) + n; return o; };
  return trees.reduce((m, t) => ({
    nodes: [...m.nodes, ...(t.nodes ?? [])],
    missing: [...m.missing, ...(t.missing ?? [])],
    report: {
      fn: add(m.report.fn, t.report?.fn), closed: add(m.report.closed, t.report?.closed), unresolved: add(m.report.unresolved, t.report?.unresolved), skipped: add(m.report.skipped, t.report?.skipped),
      renderProp: m.report.renderProp + (t.report?.renderProp ?? 0), cssClasses: m.report.cssClasses + (t.report?.cssClasses ?? 0),
      cssLost: [...new Set([...m.report.cssLost, ...(t.report?.cssLost ?? [])])], truncated: m.report.truncated || Boolean(t.report?.truncated),
    },
  }), { nodes: [], missing: [], report: { fn: {}, closed: {}, unresolved: {}, skipped: {}, renderProp: 0, cssClasses: 0, cssLost: [], truncated: false } });
}
