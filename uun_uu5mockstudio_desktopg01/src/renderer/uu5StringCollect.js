/**
 * Page-side half of "Copy as uu5String": reads the rendered screen from the React fiber tree and returns a plain JSON tree of what the
 * author wrote, with every value already resolved (lists expanded by `.map`, computed texts, the current state).
 *
 * - a component of a uu5 library (`Uu5Elements.Panel`, `Uu5Forms.FormText`, …) becomes a node with its props; its own internal render is
 *   not walked, only what was passed to it (`children`, props that hold JSX);
 * - a component defined in the screen (`Hero`, `Container`, …) is transparent: only what it rendered goes on;
 * - a plain HTML element stays, with its `style` and the rules of its CSS classes from the page's own style sheets turned into a style object.
 *
 * `collectUu5Tree` is executed in the page through `collectCode()` (its source is sent as text), so it must not use anything outside its body.
 * Result: `{ nodes, report, missing }`; a node is `{ t: "text", v }` or `{ t: "el", name, host?, props, children }`, a prop value is a primitive,
 * `{ $json: data }` (data may contain `{ $nodes }` where JSX was found) or `{ $nodes: [...] }` (JSX in a prop).
 */
export function collectUu5Tree(opts = {}) {
  const SRC = "data-uu5-src";
  const FRAG = Symbol.for("react.fragment");
  const MAX_NODES = 20000;
  const report = { fn: {}, closed: {}, unresolved: {}, renderProp: 0, cssLost: {}, cssClasses: 0, skipped: {}, truncated: false };
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  let count = 0;

  const tname = (t) => (!t || typeof t === "string" ? "" : String(t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)) || ""));
  const pub = (t) => { const m = tname(t).match(/((?:Uu5|Plus4U5)[A-Za-z0-9]*\.[A-Z][\w.]*)\)*$/); return m ? m[1] : null; };
  const isEl = (v) => !!v && typeof v === "object" && typeof v.$$typeof === "symbol" && "type" in v && "props" in v;
  const isPlain = (v) => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
  const COMPONENT_TAGS = [0, 1, 11, 14, 15];
  // providers and buses only pass their children on; a closed overlay shows nothing
  const transparent = (name) => /(^|\.)(AlertBus|[A-Za-z]*Provider)$/.test(name);
  const OVERLAYS = /\.(Modal|Drawer|Popover|Dialog|ContextMenu)$/;

  // ---------- the fiber tree ----------
  const findRoot = () => {
    if (opts.rootFiber) return opts.rootFiber;
    const doc = document, cands = [doc.getElementById("uu5"), ...doc.querySelectorAll("body *")];
    for (const el of cands) {
      if (!el) continue;
      const k = Object.keys(el).find((x) => x.startsWith("__reactContainer$"));
      if (k && el[k]) { const r = el[k]; return (r.stateNode && r.stateNode.current) || r; }
    }
    return null;
  };
  const root = findRoot();
  if (!root) return { error: "No React tree was found in the screen." };
  const byProps = new Map(), all = [];
  (function index(f) {
    for (let n = f; n; n = n.sibling) {
      all.push(n);
      if (n.memoizedProps && typeof n.memoizedProps === "object" && !byProps.has(n.memoizedProps)) byProps.set(n.memoizedProps, n);
      if (n.child) index(n.child);
    }
  })(root.child);

  // ---------- CSS classes of the page → style objects ----------
  const camel = (p) => (p.startsWith("--") ? p : p.replace(/^-ms-/, "ms-").replace(/-([a-z])/g, (m, c) => c.toUpperCase()));
  const declarations = (cssText) => {
    const out = {}; let depth = 0, cur = "";
    const flush = () => { const i = cur.indexOf(":"); if (i > 0) { const k = cur.slice(0, i).trim(), v = cur.slice(i + 1).replace(/!important\s*$/, "").trim(); if (k && v) out[camel(k)] = v; } cur = ""; };
    for (const ch of cssText) { if (ch === "(") depth++; else if (ch === ")") depth--; if (ch === ";" && depth === 0) flush(); else cur += ch; }
    flush(); return out;
  };
  const classRules = { plain: {}, other: {} }; // class -> declarations; class -> selectors that cannot be inlined (:hover, descendants, …)
  const rules = opts.styleRules || (() => {
    const list = [];
    const walk = (rs) => { for (const r of rs) { if (r.selectorText !== undefined && r.style) list.push({ selector: r.selectorText, cssText: r.style.cssText }); else if (r.cssRules && !r.media) walk(r.cssRules); } };
    for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* another origin */ } }
    return list;
  })();
  for (const r of rules) {
    for (const sel of String(r.selector).split(",").map((x) => x.trim())) {
      const m = sel.match(/^\.([\w-]+)$/);
      if (m) { classRules.plain[m[1]] = Object.assign(classRules.plain[m[1]] || {}, declarations(r.cssText)); continue; }
      for (const c of sel.match(/\.[\w-]+/g) || []) (classRules.other[c.slice(1)] = classRules.other[c.slice(1)] || []).push(sel);
    }
  }
  const styleOfClasses = (className) => {
    if (typeof className !== "string") return null;
    let style = null;
    for (const c of className.split(/\s+/).filter(Boolean)) {
      if (classRules.plain[c]) { style = Object.assign(style || {}, classRules.plain[c]); report.cssClasses++; }
      for (const sel of classRules.other[c] || []) report.cssLost[sel] = true;
      if (!classRules.plain[c] && !classRules.other[c]) report.cssLost["." + c] = true;
    }
    return style;
  };

  // ---------- values ----------
  const toData = (v, path, depth) => {
    if (depth > 12) { bump(report.skipped, path); return undefined; }
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
    if (typeof v === "function") { bump(report.fn, path); return undefined; }
    if (isEl(v)) return { $nodes: ofChildren(v) };
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map((x) => toData(x, path + "[]", depth + 1)).filter((x) => x !== undefined);
    if (typeof v === "object" && isPlain(v)) {
      const o = {};
      for (const k of Object.keys(v)) { const d = toData(v[k], path + "." + k, depth + 1); if (d !== undefined) o[k] = d; }
      return o;
    }
    if (v !== undefined) bump(report.skipped, path);
    return undefined;
  };
  const encode = (v, key) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
    if (typeof v === "function") { bump(report.fn, key); return undefined; }
    if (isEl(v) || (Array.isArray(v) && v.some(isEl))) return { $nodes: ofChildren(v) };
    const d = toData(v, key, 0);
    return d === undefined ? undefined : { $json: d };
  };
  const withStyle = (props, classStyle, out) => {
    const own = props.style && typeof props.style === "object" && !Array.isArray(props.style) ? toData(props.style, "style", 0) : null;
    if (classStyle || own) out.style = { $json: Object.assign({}, classStyle, own) };
  };

  // ---------- nodes ----------
  const push = (list, x) => { if (Array.isArray(x)) x.forEach((y) => push(list, y)); else if (x) list.push(x); };
  function ofChildren(children) {
    const list = [];
    const visit = (c) => {
      if (c === null || c === undefined || typeof c === "boolean") return;
      if (typeof c === "string" || typeof c === "number") return void list.push({ t: "text", v: String(c) });
      if (Array.isArray(c)) return void c.forEach(visit);
      if (isEl(c)) return void push(list, ofElement(c));
      if (typeof c === "function") { report.renderProp++; return; }
      bump(report.skipped, "children");
    };
    visit(children);
    return list;
  }
  function hostNode(tag, props, children) {
    if (++count > MAX_NODES) { report.truncated = true; return null; }
    const p = {};
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (k === "children" || k === "className" || k === "style" || k === "key" || k === "ref" || k === SRC || k === "dangerouslySetInnerHTML") continue;
      if (typeof v === "function") { if (/^on[A-Z]/.test(k)) bump(report.fn, k); continue; }
      if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean") p[k] = v;
    }
    withStyle(props, styleOfClasses(props.className), p);
    if (!children.length && !Object.keys(p).length && !/^(br|hr|img)$/.test(tag)) return null;
    return { t: "el", name: tag, host: true, props: p, children };
  }
  function compNode(name, props, type) {
    if (OVERLAYS.test(name) && !props.open) { bump(report.closed, name); return null; }
    if (transparent(name)) return typeof props.children === "function" ? null : ofChildren(props.children);
    if (++count > MAX_NODES) { report.truncated = true; return null; }
    const p = {}, defaults = (type && type.defaultProps) || {};
    for (const k of Object.keys(props)) {
      if (k === "children" || k === "key" || k === "ref" || k === SRC || k === "className" || k === "style") continue;
      if (k in defaults && Object.is(defaults[k], props[k])) continue; // filled in by the component, not written by the author
      const e = encode(props[k], k);
      if (e !== undefined) p[k] = e;
    }
    withStyle(props, styleOfClasses(props.className), p);
    let children = [];
    if (typeof props.children === "function") report.renderProp++;
    else children = ofChildren(props.children);
    return { t: "el", name, props: p, children };
  }
  function ofFiber(f) {
    if (f.tag === 6) return { t: "text", v: String(f.memoizedProps) };
    const props = f.memoizedProps || {};
    if (f.tag === 5) {
      const own = typeof props.children === "string" || typeof props.children === "number" ? [{ t: "text", v: String(props.children) }] : childFibers(f);
      return hostNode(f.type, props, own);
    }
    const name = COMPONENT_TAGS.includes(f.tag) ? pub(f.type) : null;
    if (name) return compNode(name, props, f.type);
    return childFibers(f); // a component of the screen, a context, a fragment, a portal: only what it rendered
  }
  function childFibers(f) { const list = []; for (let c = f.child; c; c = c.sibling) push(list, ofFiber(c)); return list; }
  function ofElement(el) {
    const f = byProps.get(el.props);
    if (f) return ofFiber(f);
    const t = el.type;
    if (t === FRAG) return ofChildren(el.props.children);
    if (typeof t === "string") return hostNode(t, el.props, ofChildren(el.props.children));
    const name = pub(t);
    if (name) return compNode(name, el.props, t);
    bump(report.unresolved, tname(t) || "anonymous"); // a component of the screen that is not rendered (in a closed dialog, a hidden tab, …)
    return null;
  }

  // ---------- whole screen, or the chosen components ----------
  const nodes = [], missing = [];
  if (Array.isArray(opts.ordinals) && opts.ordinals.length) {
    const ordOf = (f) => { const v = f.memoizedProps && typeof f.memoizedProps === "object" ? f.memoizedProps[SRC] : undefined; return v === undefined || v === null ? null : Number(v); };
    for (const ord of [...new Set(opts.ordinals.map(Number))].sort((a, b) => a - b)) {
      // the outermost fiber of that element; an element inside `.map` is rendered once per item, so every rendered copy goes in
      const found = all.filter((x) => ordOf(x) === ord && !(x.return && ordOf(x.return) === ord));
      if (found.length) found.forEach((f) => push(nodes, ofFiber(f))); else missing.push(ord);
    }
  } else push(nodes, childFibers(root));
  return { nodes, report: { ...report, cssLost: Object.keys(report.cssLost) }, missing };
}

/** The expression to execute in a screen (`webview.executeJavaScript`). `ordinals`: only these components (empty = the whole screen). */
export const collectCode = (ordinals = []) => `(${collectUu5Tree.toString()})(${JSON.stringify({ ordinals: ordinals.map(Number).filter(Number.isFinite) })})`;
