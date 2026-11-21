/**
 * The interface of components, read from code: what a component of a mockup gets (the props it destructures and the attributes it is
 * given where it is used) and what an existing component of the repository declares (propTypes, defaultProps). Used by the handoff to
 * prefill the props of a component designed in a mockup and to tell what changes against the component that already exists.
 */
import { parse } from "@babel/parser";
import { structureOf, parseElements } from "./jsxSource.mjs";

const PARSE = { sourceType: "module", plugins: ["jsx", "typescript", "classProperties", "objectRestSpread"], errorRecovery: true, allowReturnOutsideFunction: true };
export const parseCode = (code) => { try { return parse(code, PARSE); } catch { return null; } };
export function walk(node, fn) {
  if (!node || typeof node.type !== "string") return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, fn); else if (v && typeof v.type === "string") walk(v, fn);
  }
}
const scriptsOf = (html) => [...String(html).matchAll(/<script\b[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const keyName = (k) => (k?.type === "Identifier" ? k.name : k?.type === "StringLiteral" ? k.value : null);

/** The type of a prop from the value it is given in a mockup. */
export function typeOfAttr(a) {
  if (a.spread) return null;
  if (a.type === "string" || a.type === "number" || a.type === "boolean") return a.type === "boolean" ? "bool" : a.type;
  const code = String(a.code ?? a.value ?? "").trim();
  if (/^(async\s*)?(\([^)]*\)|[\w$]+)\s*=>/.test(code) || /^function\b/.test(code) || /^(on|handle)[A-Z]/.test(code) || /^on[A-Z]/.test(a.name)) return "func";
  if (/^</.test(code)) return "node";
  if (a.items || /^\[/.test(code) || Array.isArray(a.json) || /List$/.test(a.name)) return "array";
  if ((a.json && typeof a.json === "object") || /^\{/.test(code)) return "object";
  return null;
}

/** The names a component function takes from its props: `function X({ a, b })`, `const X = ({ a }) =>`, `render(props) { const { a } = props }`. */
function destructured(fn) {
  const p = fn?.params?.[0];
  if (!p) return [];
  if (p.type === "ObjectPattern") return p.properties.map((x) => (x.type === "ObjectProperty" ? keyName(x.key) : null)).filter(Boolean);
  if (p.type === "Identifier") { // const { a, b } = props
    const out = [];
    walk(fn.body, (n) => { if (n.type === "VariableDeclarator" && n.id.type === "ObjectPattern" && n.init?.type === "Identifier" && n.init.name === p.name) for (const x of n.id.properties) if (x.type === "ObjectProperty" && keyName(x.key)) out.push(keyName(x.key)); });
    walk(fn.body, (n) => { if (n.type === "MemberExpression" && n.object.type === "Identifier" && n.object.name === p.name && !n.computed && n.property.type === "Identifier" && !["children"].includes(n.property.name)) out.push(n.property.name); });
    return [...new Set(out)];
  }
  return [];
}
/** The function that renders component `name` in a module: a function declaration, an arrow, or the render of createVisualComponent / createComponent. */
function componentFunctions(ast) {
  const out = new Map();
  walk(ast.program, (n) => {
    if (n.type === "FunctionDeclaration" && n.id && /^[A-Z]/.test(n.id.name)) out.set(n.id.name, n);
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && /^[A-Z]/.test(n.id.name) && n.init) {
      const i = n.init;
      if (i.type === "ArrowFunctionExpression" || i.type === "FunctionExpression") out.set(n.id.name, i);
      else if (i.type === "CallExpression") { // createVisualComponent({ … render(props) {…} })
        const obj = i.arguments.find((a) => a.type === "ObjectExpression");
        const r = obj?.properties.find((p) => keyName(p.key) === "render");
        if (r) out.set(n.id.name, r.type === "ObjectMethod" ? r : r.value);
      }
    }
  });
  return out;
}

/**
 * The components a mockup screen defines itself, with where they are used and the props they get:
 * [{ name, used: ["Screen: x › Parent"], props: [{ name, type? }], note? }]. The screen node itself and library components are left out.
 */
export function mockupComponents(html, screen) {
  let tree = null; try { tree = structureOf(html, screen); } catch { return []; }
  const out = new Map();
  const visit = (n, chain) => {
    if ((n.kind === "new" || n.kind === "existing") && /^[A-Z][\w$]*$/.test(n.name ?? "")) {
      const c = out.get(n.name) ?? { name: n.name, used: [], props: [] };
      if (chain.length) c.used.push(chain.join(" › "));
      out.set(n.name, c);
    }
    for (const ch of n.children ?? []) visit(ch, [...chain, n.name]);
  };
  if (tree) visit(tree, []);
  if (!out.size) return [];
  // props: the attributes where it is used, then the names its function destructures
  const props = new Map([...out.keys()].map((k) => [k, new Map()]));
  for (const el of (() => { try { return parseElements(html); } catch { return []; } })()) {
    const m = props.get(el.name); if (!m) continue;
    for (const a of el.attrs) if (!a.spread && a.name && a.name !== "key" && !m.has(a.name)) m.set(a.name, typeOfAttr(a));
  }
  for (const code of scriptsOf(html)) {
    const ast = parseCode(code); if (!ast) continue;
    for (const [name, fn] of componentFunctions(ast)) { const m = props.get(name); if (m) for (const p of destructured(fn)) if (!m.has(p)) m.set(p, null); }
  }
  for (const [name, m] of props) out.get(name).props = [...m].filter(([p]) => p !== "children" || true).map(([p, t]) => (t ? { name: p, type: t } : { name: p }));
  return [...out.values()];
}

/** The type written in a propTypes entry: `PropTypes.string.isRequired` → { type: "string", required: true }; a call keeps its text. */
function propType(node, code) {
  let n = node, required = false;
  if (n?.type === "MemberExpression" && keyName(n.property) === "isRequired") { required = true; n = n.object; }
  let type = null;
  if (n?.type === "MemberExpression") type = keyName(n.property);
  else if (n?.type === "CallExpression") { type = code.slice(n.start, n.end).replace(/^(?:[\w$]+\.)*PropTypes\./, "").replace(/\s+/g, " ").slice(0, 80); }
  else if (n) type = code.slice(n.start, n.end).replace(/\s+/g, " ").slice(0, 80);
  return { type, required };
}
/**
 * The props an existing component of the repository declares: [{ name, type?, required?, default? }] from its propTypes (an object property
 * `propTypes: {…}` as in createVisualComponent, or `X.propTypes = {…}`) and defaultProps. Empty when it declares none or cannot be read.
 */
export function repoComponentProps(code) {
  const src = String(code ?? ""), ast = parseCode(src);
  if (!ast) return [];
  let types = null, defaults = null;
  walk(ast.program, (n) => {
    const take = (key, val) => { if (val?.type !== "ObjectExpression") return; if (key === "propTypes" && !types) types = val; if (key === "defaultProps" && !defaults) defaults = val; };
    if (n.type === "ObjectProperty") take(keyName(n.key), n.value);
    if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression") take(keyName(n.left.property), n.right);
    if (n.type === "ClassProperty" && n.static) take(keyName(n.key), n.value);
  });
  const out = new Map();
  for (const p of types?.properties ?? []) { const name = keyName(p.key); if (!name || p.type !== "ObjectProperty") continue; const t = propType(p.value, src); out.set(name, { name, ...(t.type ? { type: t.type } : {}), ...(t.required ? { required: true } : {}) }); }
  for (const p of defaults?.properties ?? []) { const name = keyName(p.key); if (!name || p.type !== "ObjectProperty") continue; const def = src.slice(p.value.start, p.value.end).replace(/\s+/g, " ").slice(0, 80); out.set(name, { ...(out.get(name) ?? { name }), default: def }); }
  return [...out.values()];
}

/** What changes in the interface of an existing component: { added, removed, changed: [{ name, from, to }] } (types compared loosely). */
export function propsDiff(current, wanted) {
  const cur = new Map((current ?? []).map((p) => [p.name, p])), want = new Map((wanted ?? []).map((p) => [p.name, p]));
  const norm = (p) => `${String(p?.type ?? "").toLowerCase().replace(/^bool(ean)?$/, "bool")}|${p?.required ? 1 : 0}|${p?.default ?? ""}`;
  const changed = [];
  for (const [n, w] of want) { const c = cur.get(n); if (c && (w.type || w.required || w.default) && norm(c) !== norm({ type: w.type ?? c.type, required: w.required, default: w.default ?? c.default })) changed.push({ name: n, from: c, to: w }); }
  return { added: [...want.values()].filter((w) => !cur.has(w.name)), removed: [...cur.values()].filter((c) => !want.has(c.name)), changed };
}

/** Files of the repository whose name matches a component name best: "CourseOverview" → course-overview.js, CourseOverview.jsx… */
export function suggestSource(name, files) {
  const kebab = String(name).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), flat = kebab.replace(/-/g, "");
  const score = (f) => { const base = f.split("/").pop().replace(/\.(jsx?|tsx?|mjs)$/i, "").toLowerCase(); if (!/\.(jsx?|tsx?|mjs)$/i.test(f) || /(^|\/)(test|tests|__tests__)\/|\.test\./.test(f)) return 0; return base === kebab ? 3 : base.replace(/[-_]/g, "") === flat ? 2 : base.includes(kebab) ? 1 : 0; };
  return files.map((f) => [f, score(f)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).map(([f]) => f).slice(0, 5);
}
