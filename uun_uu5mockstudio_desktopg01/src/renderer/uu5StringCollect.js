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
  const report = { fn: {}, closed: {}, unresolved: {}, renderProp: 0, cssLost: {}, cssClasses: 0, hover: 0, skipped: {}, truncated: false };
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
  /** Declarations of a rule; `important` (a Set), when given, gets the names of those written with `!important`. */
  const declarations = (cssText, important) => {
    const out = {}; let depth = 0, cur = "";
    const flush = () => { const i = cur.indexOf(":"); if (i > 0) { const k = cur.slice(0, i).trim(), raw = cur.slice(i + 1).trim(), v = raw.replace(/\s*!important\s*$/, "").trim(); if (k && v) { out[camel(k)] = v; if (important && v !== raw) important.add(camel(k)); } } cur = ""; };
    for (const ch of cssText) { if (ch === "(") depth++; else if (ch === ")") depth--; if (ch === ";" && depth === 0) flush(); else cur += ch; }
    flush(); return out;
  };
  const classRules = { plain: {}, important: {}, hover: {}, other: {} }; // class -> declarations (and which of them are !important); class -> `.name:hover` declarations; class -> selectors that cannot be inlined (descendants, …)
  const matchable = []; // rules with a selector beyond `.name` that the real element can be tested against (`.hero h1`, `.grid > .card`)
  const DYNAMIC = /::|:(hover|focus|focus-within|focus-visible|active|visited|before|after|first-line|first-letter|placeholder)/;
  const mediaMatches = opts.mediaMatches || ((text) => { try { return matchMedia(text).matches; } catch { return false; } });
  // rules in the order of the sheets; the ones inside `@media` carry its text and count only while it matches (the screen's current width)
  const rules = (opts.styleRules || (() => {
    const list = [];
    const walk = (rs, media) => { for (const r of rs) { if (r.selectorText !== undefined && r.style) list.push({ selector: r.selectorText, cssText: r.style.cssText, media }); else if (r.cssRules) walk(r.cssRules, r.media ? r.media.mediaText : media); } };
    for (const s of document.styleSheets) { try { walk(s.cssRules, null); } catch { /* another origin */ } }
    return list;
  })()).filter((r) => !r.media || mediaMatches(r.media));
  const mergeClass = (c, decl, imp) => { // the later rule wins, unless the earlier one is !important and it is not
    const target = (classRules.plain[c] = classRules.plain[c] || {}), seen = (classRules.important[c] = classRules.important[c] || new Set());
    for (const k of Object.keys(decl)) { if (seen.has(k) && !imp.has(k)) continue; target[k] = decl[k]; if (imp.has(k)) seen.add(k); }
  };
  for (const r of rules) {
    for (const sel of String(r.selector).split(",").map((x) => x.trim())) {
      const m = sel.match(/^\.([\w-]+)$/);
      if (m) { const imp = new Set(); mergeClass(m[1], declarations(r.cssText, imp), imp); continue; }
      const h = sel.match(/^\.([\w-]+):hover$/); // a hover style cannot be inlined or written into a uu5String; it is only counted
      if (h) { classRules.hover[h[1]] = Object.assign(classRules.hover[h[1]] || {}, declarations(r.cssText)); continue; }
      if (!DYNAMIC.test(sel)) matchable.push({ selector: sel, style: declarations(r.cssText) });
      for (const c of sel.match(/\.[\w-]+/g) || []) (classRules.other[c.slice(1)] = classRules.other[c.slice(1)] || []).push(sel);
    }
  }
  const getComputed = opts.computed || ((d) => getComputedStyle(d));
  const hasDom = (d) => Boolean(d && typeof d.matches === "function");
  /** Style of a host element: its plain classes, then (with the real element at hand) the other rules that match it, `var()` replaced by the computed value, and a colour that differs from the parent's because it is inherited. */
  const styleOfClasses = (className, dom) => {
    let style = null;
    if (typeof className === "string") {
      for (const c of className.split(/\s+/).filter(Boolean)) {
        if (classRules.plain[c]) { style = Object.assign(style || {}, classRules.plain[c]); report.cssClasses++; }
        for (const sel of classRules.other[c] || []) if (!hasDom(dom) || DYNAMIC.test(sel)) report.cssLost[sel] = true;
        if (!classRules.plain[c] && !classRules.other[c] && !classRules.hover[c]) report.cssLost["." + c] = true;
      }
    }
    if (!hasDom(dom)) return style;
    const matched = {};
    for (const r of matchable) { let ok = false; try { ok = dom.matches(r.selector); } catch { /* a selector this engine does not know */ } if (ok) Object.assign(matched, r.style); }
    if (Object.keys(matched).length) { style = Object.assign(style || {}, matched); report.cssClasses++; }
    let cs = null; try { cs = getComputed(dom); } catch { /* detached */ }
    if (cs) {
      for (const k of Object.keys(style || {})) if (typeof style[k] === "string" && style[k].includes("var(") && cs[k]) style[k] = cs[k];
      const parent = dom.parentElement;
      if (parent && !(style && style.color)) { let ps = null; try { ps = getComputed(parent); } catch { /* detached */ } if (ps && cs.color && cs.color !== ps.color) style = Object.assign(style || {}, { color: cs.color }); }
    }
    return style;
  };

  const classesOf = (className) => (typeof className === "string" ? className.split(/\s+/).filter(Boolean) : []);
  /** The `.name:hover` declarations of the classes of an element (shadow, lift, …), or null. They cannot be written into a uu5String. */
  const hoverOf = (className) => {
    let h = null;
    for (const c of classesOf(className)) if (classRules.hover[c]) h = Object.assign(h || {}, classRules.hover[c]);
    return h;
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
  /** A document does not define the custom properties of the screen (`--brand-…`): every `var(--x, fallback)` in a style is written as its value, from the element, else from the page root. */
  const varLookup = opts.varLookup || ((name, dom) => {
    for (const d of [dom, typeof document !== "undefined" ? document.documentElement : null]) {
      if (!d) continue;
      try { const v = getComputed(d).getPropertyValue(name).trim(); if (v) return v; } catch { /* detached */ }
    }
    return "";
  });
  const resolveVars = (v, dom, depth = 0) => {
    if (typeof v !== "string" || !v.includes("var(") || depth > 8) return v;
    const out = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (m, name, fallback) => varLookup(name, dom) || (fallback !== undefined ? fallback.trim() : m));
    return out === v ? v : resolveVars(out, dom, depth + 1);
  };
  const withStyle = (props, classStyle, out, dom) => {
    const own = props.style && typeof props.style === "object" && !Array.isArray(props.style) ? toData(props.style, "style", 0) : null;
    if (classStyle || own) {
      const st = Object.assign({}, classStyle, own);
      for (const k of Object.keys(st)) st[k] = resolveVars(st[k], dom);
      out.style = { $json: st };
    }
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
  function hostNode(tag, props, children, dom) {
    if (++count > MAX_NODES) { report.truncated = true; return null; }
    const p = {};
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (k === "children" || k === "className" || k === "style" || k === "key" || k === "ref" || k === SRC || k === "dangerouslySetInnerHTML") continue;
      if (typeof v === "function") { if (/^on[A-Z]/.test(k)) bump(report.fn, k); continue; }
      if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean") p[k] = v;
    }
    withStyle(props, styleOfClasses(props.className, dom), p, dom);
    if (hoverOf(props.className)) report.hover++; // a uu5String cannot hold :hover: only counted, for the note
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
    for (const c of classesOf(props.className)) if (classRules.hover[c]) report.cssLost["." + c + ":hover"] = true; // a library component keeps its own hover; the one of the class is lost
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
      return hostNode(f.type, props, own, f.stateNode);
    }
    const name = COMPONENT_TAGS.includes(f.tag) ? pub(f.type) : null;
    if (name) return compNode(name, props, f.type);
    return childFibers(f); // a component of the screen, a context, a fragment, a portal: only what it rendered
  }
  function childFibers(f) { const list = []; for (let c = f.child; c; c = c.sibling) push(list, ofFiber(c)); return list; }
  let depth = 0;
  function ofElement(el) {
    const f = byProps.get(el.props);
    if (f) return ofFiber(f);
    const t = el.type;
    if (t === FRAG) return ofChildren(el.props.children);
    if (typeof t === "string") return hostNode(t, el.props, ofChildren(el.props.children));
    const name = pub(t);
    if (name) return compNode(name, el.props, t);
    // a component of the screen that is not rendered (a hidden tab, …): a plain function component is called for the elements it returns;
    // one that needs hooks or context throws outside React, and is reported
    if (typeof t === "function" && !(t.prototype && t.prototype.isReactComponent) && depth < 40) {
      let out, ok = false;
      depth++;
      try { out = t({ ...(t.defaultProps || {}), ...el.props }); ok = out !== undefined; } catch { /* needs hooks or context */ }
      try { if (ok) return ofChildren(out); } finally { depth--; }
      if (!ok) depth--;
    }
    bump(report.unresolved, tname(t) || "anonymous");
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
