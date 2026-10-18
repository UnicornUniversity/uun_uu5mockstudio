import { parse, parseExpression } from "@babel/parser";

/**
 * Reads and edits the JSX inside the `<script type="text/babel">` blocks of a mockup HTML file.
 * A uu5 mockup is a React program: the user's mental model is "component + props", not DOM. This module
 *  - numbers every JSX element of the file (document order = its `ordinal`),
 *  - tags the uu5 components with `data-uu5-src="<ordinal>"` in the copy served to the preview, so the inspector can map a
 *    running React component back to its JSX element,
 *  - reads / sets / removes the props of one JSX element directly in the file text (only that attribute is touched).
 */

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const isBabel = (attrs) => /\btype\s*=\s*["']?text\/babel["']?/i.test(attrs);
const UU5_SOURCE = /^(uu5|uu_|plus4u)/i;
export const SRC_ATTR = "data-uu5-src";

function babelScripts(html) {
  const out = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    if (!isBabel(m[1])) continue;
    const start = m.index + m[0].indexOf(">") + 1;
    out.push({ start, end: start + m[2].length, code: m[2] });
  }
  return out;
}

function jsxName(n) {
  if (!n) return "";
  if (n.type === "JSXIdentifier") return n.name;
  if (n.type === "JSXMemberExpression") return `${jsxName(n.object)}.${n.property.name}`;
  if (n.type === "JSXNamespacedName") return `${n.namespace.name}:${n.name.name}`;
  return "";
}

function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "extra" || key.endsWith("Comments")) continue;
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walk(c, visit); else if (v && typeof v.type === "string") walk(v, visit);
  }
}

/** The value of a literal attribute expression, or null when the expression is real code. */
function literalOf(expr) {
  if (!expr) return null;
  if (expr.type === "StringLiteral") return { type: "string", value: expr.value };
  if (expr.type === "NumericLiteral") return { type: "number", value: expr.value };
  if (expr.type === "BooleanLiteral") return { type: "boolean", value: expr.value };
  if (expr.type === "NullLiteral") return { type: "null", value: null };
  if (expr.type === "UnaryExpression" && expr.operator === "-" && expr.argument.type === "NumericLiteral") return { type: "number", value: -expr.argument.value };
  if (expr.type === "TemplateLiteral" && !expr.expressions.length) return { type: "string", value: expr.quasis[0].value.cooked };
  return null;
}

const NOT_DATA = Symbol("not data");
/** Value of an expression that is plain data (objects, arrays, literals); throws NOT_DATA for anything computed (functions, identifiers, JSX). */
function dataOf(n) {
  switch (n.type) {
    case "StringLiteral": case "NumericLiteral": case "BooleanLiteral": return n.value;
    case "NullLiteral": return null;
    case "UnaryExpression": if (n.operator === "-" && n.argument.type === "NumericLiteral") return -n.argument.value; throw NOT_DATA;
    case "TemplateLiteral": if (!n.expressions.length) return n.quasis[0].value.cooked; throw NOT_DATA;
    case "ArrayExpression": return n.elements.map((e) => { if (!e || e.type === "SpreadElement") throw NOT_DATA; return dataOf(e); });
    case "ObjectExpression": {
      const o = {};
      for (const p of n.properties) {
        if (p.type !== "ObjectProperty" || p.computed) throw NOT_DATA;
        const k = p.key.type === "Identifier" ? p.key.name : p.key.type === "StringLiteral" ? p.key.value : p.key.type === "NumericLiteral" ? String(p.key.value) : null;
        if (k == null) throw NOT_DATA;
        o[k] = dataOf(p.value);
      }
      return o;
    }
    default: throw NOT_DATA;
  }
}
const jsonOf = (expr) => { if (!expr || (expr.type !== "ObjectExpression" && expr.type !== "ArrayExpression")) return undefined; try { return JSON.stringify(dataOf(expr), null, 2); } catch { return undefined; } };

/**
 * `cond ? "a" : "b"` (also nested): the values the prop can take and under which condition. Each row is
 * {label, type, value, editable, start, end}; only literal values can be edited in place.
 */
function branchesOf(expr, code, abs) {
  if (!expr || expr.type !== "ConditionalExpression") return undefined;
  const rows = [];
  const text = (n) => { const t = code.slice(n.start, n.end).replace(/\s+/g, " "); return t.length > 70 ? `${t.slice(0, 67)}…` : t; };
  const walkC = (e, conds) => {
    if (e.type === "ConditionalExpression") {
      walkC(e.consequent, [...conds, text(e.test)]);
      walkC(e.alternate, [...conds, `not (${text(e.test)})`]);
      return;
    }
    const label = conds.join(" and ");
    const lit = literalOf(e);
    rows.push(lit ? { label, ...lit, editable: true, start: abs(e.start), end: abs(e.end) } : { label, type: "code", value: code.slice(e.start, e.end), editable: false });
  };
  walkC(expr, []);
  return rows;
}

/** The properties of an object literal, with source ranges (offsets are made absolute by `abs`). */
function objectProps(obj, code, abs, cx) {
  return obj.properties.map((p) => {
    if (p.type !== "ObjectProperty" || p.computed) return { spread: true, start: abs(p.start), end: abs(p.end), text: code.slice(p.start, p.end) };
    const name = p.key.type === "Identifier" ? p.key.name : p.key.type === "StringLiteral" ? p.key.value : String(p.key.value ?? "");
    const base = { name, start: abs(p.start), end: abs(p.end), shorthand: Boolean(p.shorthand) };
    const v = p.value, lit = literalOf(v), c = code.slice(v.start, v.end);
    if (lit) return { ...base, ...lit, code: c };
    const resolved = cx && textOf(v, cx);
    return { ...base, type: "code", value: c, code: c, json: jsonOf(v), branches: branchesOf(v, code, abs), ...(resolved ? { resolved } : {}) };
  });
}
/** Array literal -> items; an item that is an object literal gets its properties, anything else is opaque. */
function arrayItems(arr, code, abs, cx) {
  return arr.elements.map((e, index) => {
    if (e && e.type === "ObjectExpression") return { index, kind: "object", start: abs(e.start), end: abs(e.end), openEnd: abs(e.start + 1), closeStart: abs(e.end - 1), props: objectProps(e, code, abs, cx), text: code.slice(e.start, e.end) };
    return { index, kind: "other", start: e ? abs(e.start) : null, end: e ? abs(e.end) : null, props: [], text: e ? code.slice(e.start, e.end) : "" };
  });
}


// ---------------------------------------------------------------- values that come from a variable
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod", "ClassMethod"]);
/** Every `const name = init` of the program with the function (or the program) it lives in: [{ name, init, start, scope: { start, end } }]. */
function collectDecls(ast) {
  const out = [];
  const visit = (node, scope) => {
    if (!node || typeof node.type !== "string") return;
    const here = FUNCTIONS.has(node.type) ? { start: node.start, end: node.end } : scope;
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init) out.push({ name: node.id.name, init: node.init, start: node.start, scope });
    if (node.type === "FunctionDeclaration" && node.id) out.push({ name: node.id.name, init: node, start: node.start, scope });
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "extra" || key.endsWith("Comments")) continue;
      const v = node[key];
      if (Array.isArray(v)) for (const c of v) visit(c, here); else if (v && typeof v.type === "string") visit(v, here);
    }
  };
  visit(ast.program, { start: 0, end: Infinity });
  return out;
}
/** The declaration `name` refers to at `pos`: from the innermost scope that contains `pos`, the last one before it. */
function lookupDecl(decls, name, pos) {
  const c = decls.filter((d) => d.name === name && d.scope.start <= pos && pos <= d.scope.end && d.start < pos);
  if (!c.length) return null;
  const inner = Math.max(...c.map((d) => d.scope.start));
  return c.filter((d) => d.scope.start === inner).at(-1);
}
const keyOf = (p) => (p.key.type === "Identifier" ? p.key.name : p.key.type === "StringLiteral" ? p.key.value : null);
const propOf = (obj, key) => obj?.type === "ObjectExpression" ? obj.properties.find((p) => p.type === "ObjectProperty" && !p.computed && keyOf(p) === key)?.value : undefined;
/** `a.b.c` -> ["a", "b", "c"], or null when the expression is anything else. */
function memberPath(ex) {
  const keys = [];
  let n = ex;
  while (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
    if (n.computed) { if (n.property.type !== "StringLiteral") return null; keys.unshift(n.property.value); } else if (n.property.type === "Identifier") keys.unshift(n.property.name); else return null;
    n = n.object;
  }
  return n.type === "Identifier" ? [n.name, ...keys] : null;
}
/**
 * A prop written as `title={ph.progressTitle}` or `label={TITLE}`: where the literal behind it is written. `ph` can be an object
 * literal, a constant, or `useLsi({ cs: {...}, en: {...} })` (then there is one target per language). Resolves to
 * { path, via, targets: [{ lang, type, value, start, end }] } or null when the value is not a literal somewhere in the file.
 */
function resolveValueRef(ex, decls, pos, abs) {
  const path = memberPath(ex); if (!path) return null;
  let d = lookupDecl(decls, path[0], pos), init = d?.init, via = null, hops = 0;
  while (init?.type === "Identifier" && hops++ < 3) init = lookupDecl(decls, init.name, d.start)?.init ?? null;
  if (!init) return null;
  let roots; // [{ lang, node }]
  const callee = init.type === "CallExpression" ? (init.callee.type === "Identifier" ? init.callee.name : init.callee.property?.name) ?? "" : "";
  if (/Lsi$/.test(callee)) { // useLsi({ cs: {...}, en: {...} }): the text of the current language
    let arg = init.arguments[0], h = 0;
    while (arg?.type === "Identifier" && h++ < 3) arg = lookupDecl(decls, arg.name, d.start)?.init;
    if (arg?.type !== "ObjectExpression") return null;
    via = "useLsi";
    roots = arg.properties.filter((p) => p.type === "ObjectProperty" && !p.computed && propOf(arg, keyOf(p))?.type === "ObjectExpression").map((p) => ({ lang: keyOf(p), node: p.value }));
  } else roots = [{ lang: null, node: init }];
  const targets = [];
  for (const { lang, node } of roots) {
    let cur = node;
    for (const k of path.slice(1)) cur = propOf(cur, k);
    const lit = cur && literalOf(cur);
    if (lit && lit.type !== "null") targets.push({ lang, ...lit, start: abs(cur.start), end: abs(cur.end) });
  }
  if (!targets.length && path.length === 1) { const lit = literalOf(init); if (lit && lit.type !== "null") targets.push({ lang: null, ...lit, start: abs(init.start), end: abs(init.end) }); }
  return targets.length ? { path: path.join("."), via, targets } : null;
}

// ---------------------------------------------------------------- texts: a string, an LSI (one text per language) and where each is written
const LANGS = new Set(["cs", "en", "sk", "de", "pl", "fr", "es", "it", "ru", "uk", "nl", "pt", "hu", "ro", "sl", "hr", "da", "sv", "fi", "no", "ja", "zh", "ko"]);
const strLit = (n) => (n?.type === "StringLiteral" ? n.value : n?.type === "TemplateLiteral" && !n.expressions.length ? n.quasis[0].value.cooked : undefined);
/** Functions whose first parameters are language codes – `const t = (cs, en) => …`, `L(cs, en)`: name -> ["cs", "en"]. A call with literal texts is an LSI. */
function langFunctions(decls) {
  const out = new Map();
  for (const d of decls) {
    const f = d.init;
    if (!f || !["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"].includes(f.type)) continue;
    const langs = []; for (const p of f.params) { if (p.type === "Identifier" && LANGS.has(p.name)) langs.push(p.name); else break; }
    if (langs.length >= 2) out.set(d.name, langs);
  }
  return out;
}
/**
 * What an expression says as a text: { kind: "string" | "lsi", via, langs: [{ lang, value, start, end }] } or null. A string literal; an LSI object
 * `{ cs: "…", en: "…" }`; a call of a function that takes language codes (`t("Ano", "Yes")`); an element with an `lsi` prop (`<T lsi={…} />`);
 * and a variable, constant or member of an object that holds one of these (`TITLE`, `LABEL.save`, `ph.title` of `useLsi({ cs: {…}, en: {…} })`).
 */
function textOf(ex, cx, depth = 0) {
  if (!ex || depth > 5) return null;
  const range = (n) => ({ start: cx.abs(n.start), end: cx.abs(n.end) });
  const s = strLit(ex);
  if (s !== undefined) return { kind: "string", via: null, langs: [{ lang: null, value: s, ...range(ex) }] };
  if (ex.type === "ObjectExpression") {
    const ps = ex.properties;
    if (ps.length && ps.every((p) => p.type === "ObjectProperty" && !p.computed && LANGS.has(keyOf(p)) && strLit(p.value) !== undefined)) return { kind: "lsi", via: null, langs: ps.map((p) => ({ lang: keyOf(p), value: strLit(p.value), ...range(p.value) })) };
    return null;
  }
  if (ex.type === "CallExpression" && ex.callee.type === "Identifier") {
    const langs = cx.langFns.get(ex.callee.name); if (!langs) return null;
    const got = langs.map((lang, i) => ({ lang, a: ex.arguments[i] })).filter((x) => strLit(x.a) !== undefined).map((x) => ({ lang: x.lang, value: strLit(x.a), ...range(x.a) }));
    return got.length >= 2 ? { kind: "lsi", via: `${ex.callee.name}(…)`, langs: got } : null;
  }
  if (ex.type === "JSXElement") {
    const at = ex.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name?.name === "lsi" && a.value?.type === "JSXExpressionContainer");
    const r = at && textOf(at.value.expression, cx, depth + 1);
    return r ? { ...r, via: r.via ?? `<${jsxName(ex.openingElement.name)} lsi>` } : null;
  }
  if (ex.type === "ConditionalExpression" || ex.type === "LogicalExpression") return null;
  const path = memberPath(ex);
  if (path) {
    const vr = resolveValueRef(ex, cx.decls, ex.start, cx.abs); // `ph.title` of useLsi({ cs: {…}, en: {…} }), `LABEL.save`, `TITLE`
    if (vr) return { kind: vr.targets.some((t) => t.lang) ? "lsi" : "string", via: vr.path, langs: vr.targets.map(({ lang, value, start, end }) => ({ lang, value, start, end })) };
    let d = lookupDecl(cx.decls, path[0], ex.start), init = d?.init, hops = 0;
    while (init?.type === "Identifier" && hops++ < 3) init = lookupDecl(cx.decls, init.name, d.start)?.init;
    for (const k of path.slice(1)) init = propOf(init, k);
    const r = init && init !== ex ? textOf(init, cx, depth + 1) : null;
    return r ? { ...r, via: path.join(".") } : null; // the variable the prop points to, not what is inside it
  }
  return null;
}
const publicText = (t) => (t ? { kind: t.kind, via: t.via, langs: t.langs.map(({ lang, value }) => ({ lang, value })) } : undefined);

/** All JSX elements of the file in document order, with their attributes and source ranges (offsets into `html`). */
export function parseElements(html) {
  const elements = [];
  for (const script of babelScripts(html)) {
    let ast;
    try { ast = parse(script.code, { sourceType: "module", plugins: ["jsx"], errorRecovery: true, allowReturnOutsideFunction: true }); } catch { continue; }
    const imported = new Set();
    for (const s of ast.program.body) {
      if (s.type === "ImportDeclaration" && UU5_SOURCE.test(s.source.value)) for (const sp of s.specifiers) imported.add(sp.local.name);
    }
    // top-level `const NAME = <expr>` declarations: a prop written as `itemList={NAME}` is resolved to this value
    const decls = new Map();
    for (const st of ast.program.body) {
      const d = st.type === "ExportNamedDeclaration" ? st.declaration : st;
      if (d?.type === "VariableDeclaration") for (const v of d.declarations) if (v.id.type === "Identifier" && v.init && !decls.has(v.id.name)) decls.set(v.id.name, v.init);
    }
    const declList = collectDecls(ast), cx = { decls: declList, abs: (o) => script.start + o, langFns: langFunctions(declList) };
    const found = [];
    walk(ast.program, (n) => { if (n.type === "JSXOpeningElement") found.push(n); });
    found.sort((a, b) => a.start - b.start);
    for (const n of found) {
      const name = jsxName(n.name), root = name.split(/[.:]/)[0];
      const abs = (o) => script.start + o;
      const attrs = n.attributes.map((a) => {
        if (a.type !== "JSXAttribute") return { spread: true, start: abs(a.start), end: abs(a.end), text: script.code.slice(a.start, a.end) };
        const attr = { name: jsxName(a.name), start: abs(a.start), end: abs(a.end) };
        if (!a.value) return { ...attr, type: "boolean", value: true, bare: true };
        if (a.value.type === "StringLiteral") return { ...attr, type: "string", value: a.value.value };
        if (a.value.type === "JSXExpressionContainer") {
          const lit = literalOf(a.value.expression);
          const code = script.code.slice(a.value.expression.start, a.value.expression.end);
          const ex = a.value.expression;
          if (lit) return { ...attr, ...lit, code };
          const init = ex.type === "Identifier" ? decls.get(ex.name) : null;
          const ref = init ? { name: ex.name, start: abs(init.start), end: abs(init.end), code: script.code.slice(init.start, init.end), json: jsonOf(init) } : null;
          const arr = ex.type === "ArrayExpression" ? ex : init?.type === "ArrayExpression" ? init : null;
          const valueRef = resolveValueRef(ex, declList, ex.start, abs), resolvedText = textOf(ex, cx);
          return { ...attr, type: "code", value: code, code, json: jsonOf(ex), branches: branchesOf(ex, script.code, abs), ...(ref ? { ref } : {}), ...(valueRef ? { valueRef } : {}), ...(resolvedText ? { resolved: resolvedText } : {}), ...(arr ? { items: arrayItems(arr, script.code, abs, cx), itemsRange: { start: abs(arr.start), end: abs(arr.end) } } : {}) };
        }
        return { ...attr, type: "code", value: script.code.slice(a.value.start, a.value.end) };
      });
      elements.push({
        ordinal: elements.length, name, uu5: /^[A-Z]/.test(root) && imported.has(root),
        start: abs(n.start), end: abs(n.end), nameEnd: abs(n.name.end), selfClosing: Boolean(n.selfClosing), attrs,
        snippet: script.code.slice(n.start, n.end),
      });
    }
  }
  return elements;
}

/** The copy of the page that is shown in the preview: every uu5 component gets its ordinal as a prop. Any failure returns the page untouched. */
export function tagHtml(html) {
  try {
    const els = parseElements(html).filter((e) => e.uu5);
    let out = html;
    for (let i = els.length - 1; i >= 0; i--) out = out.slice(0, els[i].nameEnd) + ` ${SRC_ATTR}="${els[i].ordinal}"` + out.slice(els[i].nameEnd);
    return out;
  } catch { return html; }
}

const publicAttrs = (e) => e.attrs.filter((a) => !a.spread && a.name !== SRC_ATTR).map(({ name, type, value, code, bare, json, ref, branches, valueRef, items, resolved }) => ({ name, type, value, code, bare, json, ...(items ? { listed: true, count: items.length } : {}), ...(resolved ? { resolved: publicText(resolved) } : {}), ...(valueRef ? { valueRef: { path: valueRef.path, via: valueRef.via, targets: valueRef.targets.map(({ lang, type: t, value: v }) => ({ lang, type: t, value: v })) } } : {}), ...(branches ? { branches: branches.map(({ label, type: t, value: v, editable }) => ({ label, type: t, value: v, editable })) } : {}), ...(ref ? { ref: { name: ref.name, code: ref.code, json: ref.json } } : {}) }));

export function describeElement(html, ordinal) {
  const e = parseElements(html)[ordinal];
  if (!e) return null;
  return { ordinal: e.ordinal, name: e.name, uu5: e.uu5, selfClosing: e.selfClosing, attrs: publicAttrs(e), spread: e.attrs.some((a) => a.spread), snippet: e.snippet };
}

export function elementNames(html, ordinals) {
  const els = parseElements(html);
  return ordinals.map((o) => ({ ordinal: o, name: els[o]?.name ?? null }));
}

const safeAttrString = (s) => !/["\\\n\r&{}<>]/.test(s);

/** `{type, value}` -> the attribute text, e.g. {type:"string", value:"blue"} -> `colorScheme="blue"`. */
function attrSource(name, { type, value }) {
  if (type === "string") return safeAttrString(String(value)) ? `${name}="${value}"` : `${name}={${JSON.stringify(String(value))}}`;
  if (type === "number") { const n = Number(value); if (!Number.isFinite(n)) throw new Error("Not a number."); return `${name}={${n}}`; }
  if (type === "boolean") return value ? name : `${name}={false}`;
  if (type === "null") return `${name}={null}`;
  if (type === "code") {
    const code = String(value).trim();
    if (!code) throw new Error("The expression is empty.");
    try { parseExpression(code, { plugins: ["jsx"] }); } catch (e) { throw new Error(`Invalid expression: ${String(e.message).replace(/ \(\d+:\d+\)$/, "")}`); }
    return `${name}={${code}}`;
  }
  throw new Error(`Unknown value type ${type}.`);
}

/** Continuation lines of a multi-line value are indented like the line the value goes on. */
function reindent(text, html, pos) {
  if (!text.includes("\n")) return text;
  const lineStart = html.lastIndexOf("\n", pos - 1) + 1, indent = /^[ \t]*/.exec(html.slice(lineStart))[0];
  return text.replace(/\n/g, "\n" + indent);
}

function assertValid(html) {
  for (const script of babelScripts(html)) {
    try { parse(script.code, { sourceType: "module", plugins: ["jsx"], allowReturnOutsideFunction: true }); }
    catch (e) { throw new Error(`The change would break the file: ${String(e.message).replace(/ \(\d+:\d+\)$/, "")}`); }
  }
}

function element(html, ordinal) {
  const e = parseElements(html)[ordinal];
  if (!e) throw new Error("The component no longer exists in the file.");
  return e;
}

/** Sets (adds or replaces) one prop of the JSX element. Returns the new file content. */
export function setProp(html, ordinal, name, value) {
  if (!/^[A-Za-z_][\w.:-]*$/.test(name)) throw new Error(`Invalid prop name: ${name}`);
  const e = element(html, ordinal), cur = e.attrs.find((a) => a.name === name);
  if (value.type === "valueRef") { // the literal behind `title={ph.progressTitle}`, edited where it is written
    if (!cur?.valueRef) throw new Error(`“${name}” does not take its value from a literal in the file.`);
    const { to, from } = value.value, targets = cur.valueRef.targets;
    const same = targets.filter((t) => String(t.value) === String(from));
    const t = same.length === 1 ? same[0] : targets.length === 1 ? targets[0] : null;
    if (!t) throw new Error(`The value of ${cur.valueRef.path} is written in ${targets.length} places (${targets.map((x) => x.lang ?? "?").join(", ")}) and none of them is clearly the one shown. Edit it in the file or ask in the chat.`);
    const conv = t.type === "number" ? Number(to) : t.type === "boolean" ? to === true || to === "true" : String(to);
    const out = html.slice(0, t.start) + literalSource({ type: t.type, value: conv }, html.slice(t.start, t.end)) + html.slice(t.end);
    assertValid(out);
    return out;
  }
  if (value.type === "ref") { // edit the constant the prop refers to (`itemList={ROUTE_ACTION}`), not the attribute
    if (!cur?.ref) throw new Error(`“${name}” does not refer to a constant defined in the file.`);
    const code = String(value.value).trim();
    if (!code) throw new Error("The expression is empty.");
    try { parseExpression(code, { plugins: ["jsx"] }); } catch (err) { throw new Error(`Invalid expression: ${String(err.message).replace(/ \(\d+:\d+\)$/, "")}`); }
    const out = html.slice(0, cur.ref.start) + reindent(code, html, cur.ref.start) + html.slice(cur.ref.end);
    assertValid(out);
    return out;
  }
  const text = reindent(attrSource(name, value), html, cur ? cur.start : e.nameEnd);
  let out;
  if (cur) out = html.slice(0, cur.start) + text + html.slice(cur.end);
  else {
    // a tag written with one attribute per line gets the new attribute on its own line, indented like the others
    const first = e.attrs[0], gap = first ? html.slice(e.nameEnd, first.start) : "";
    const sep = gap.includes("\n") ? "\n" + gap.slice(gap.lastIndexOf("\n") + 1) : " ";
    out = html.slice(0, e.nameEnd) + sep + text + html.slice(e.nameEnd);
  }
  assertValid(out);
  return out;
}

/** Removes one prop (and the whitespace in front of it). */
export function removeProp(html, ordinal, name) {
  const e = element(html, ordinal), cur = e.attrs.find((a) => a.name === name);
  if (!cur) return html;
  let from = cur.start; while (from > e.nameEnd && /\s/.test(html[from - 1])) from--;
  const out = html.slice(0, from) + html.slice(cur.end);
  assertValid(out);
  return out;
}

// ---------------------------------------------------------------- nested items (object literals inside an array prop, e.g. ActionGroup itemList)

function itemOf(html, ordinal, prop, index, count) {
  const e = element(html, ordinal), attr = e.attrs.find((a) => a.name === prop);
  if (!attr?.items) throw new Error(`“${prop}” is built dynamically in the file (not a list written out in the JSX), so its items cannot be edited here. Ask in the chat instead.`);
  if (count != null && attr.items.length !== count) throw new Error(`“${prop}” in the file has ${attr.items.length} items but ${count} are rendered (some are added or filtered in code). Ask in the chat instead.`);
  const item = attr.items[index];
  if (!item || item.kind !== "object") throw new Error(`Item ${index + 1} of “${prop}” is not an object written out in the JSX, so it cannot be edited here.`);
  return { e, attr, item };
}

export function describeItem(html, ordinal, prop, index, count) {
  const { e, item } = itemOf(html, ordinal, prop, index, count);
  const attrs = item.props.filter((p) => !p.spread).map(({ name, type, value, code, json, branches, resolved }) => ({ name, type, value, code, json, ...(resolved ? { resolved: publicText(resolved) } : {}), ...(branches ? { branches: branches.map(({ label, type: t, value: v, editable }) => ({ label, type: t, value: v, editable })) } : {}) }));
  return { ordinal: e.ordinal, name: null, uu5: true, selfClosing: true, attrs, spread: item.props.some((p) => p.spread), snippet: item.text, item: { prop, index } };
}

const keySource = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));
function propSource(name, { type, value }) {
  const key = keySource(name);
  if (type === "string") return `${key}: ${JSON.stringify(String(value))}`;
  if (type === "number") { const n = Number(value); if (!Number.isFinite(n)) throw new Error("Not a number."); return `${key}: ${n}`; }
  if (type === "boolean") return `${key}: ${Boolean(value)}`;
  if (type === "null") return `${key}: null`;
  if (type === "code") {
    const code = String(value).trim();
    if (!code) throw new Error("The expression is empty.");
    try { parseExpression(code, { plugins: ["jsx"] }); } catch (err) { throw new Error(`Invalid expression: ${String(err.message).replace(/ \(\d+:\d+\)$/, "")}`); }
    return `${key}: ${code}`;
  }
  throw new Error(`Unknown value type ${type}.`);
}

/** Sets (adds or replaces) one property of an object item. */
export function setItemProp(html, ordinal, prop, index, name, value, count) {
  const { item } = itemOf(html, ordinal, prop, index, count);
  const text = reindent(propSource(name, value), html, (item.props.find((p) => p.name === name) ?? item.props[0])?.start ?? item.openEnd);
  const cur = item.props.find((p) => p.name === name);
  let out;
  if (cur) out = html.slice(0, cur.start) + text + html.slice(cur.end);
  else if (!item.props.length) out = html.slice(0, item.openEnd) + ` ${text} ` + html.slice(item.closeStart);
  else {
    const first = item.props[0], gap = html.slice(item.openEnd, first.start);
    const sep = gap.includes("\n") ? "\n" + gap.slice(gap.lastIndexOf("\n") + 1) : " ";
    out = html.slice(0, item.openEnd) + sep + text + "," + html.slice(item.openEnd);
  }
  assertValid(out);
  return out;
}

/** Removes one property of an object item (with its comma). */
export function removeItemProp(html, ordinal, prop, index, name, count) {
  const { item } = itemOf(html, ordinal, prop, index, count);
  const cur = item.props.find((p) => p.name === name);
  if (!cur) return html;
  let end = cur.end; while (end < html.length && /[ \t]/.test(html[end])) end++;
  if (html[end] === ",") end++;
  let start = cur.start;
  const lineStart = html.lastIndexOf("\n", start - 1) + 1;
  if (/^[ \t]*$/.test(html.slice(lineStart, start))) { start = lineStart; while (end < html.length && /[ \t]/.test(html[end])) end++; if (html[end] === "\n") end++; }
  else while (end < html.length && html[end] === " ") end++;
  const out = html.slice(0, start) + html.slice(end);
  assertValid(out);
  return out;
}

// ---------------------------------------------------------------- the items of a list prop (add, remove, move, duplicate)

function listOf(html, ordinal, prop) {
  const e = element(html, ordinal), attr = e.attrs.find((a) => a.name === prop);
  if (!attr?.items || !attr.itemsRange) throw new Error(`“${prop}” is built dynamically in the file (not a list written out in the JSX), so its items cannot be edited here. Ask in the chat instead.`);
  return { e, attr, items: attr.items, range: attr.itemsRange };
}

/** The items of a list prop as the editor shows them: for each the properties written in it (objects) or its text (anything else). */
export function describeList(html, ordinal, prop) {
  const { items } = listOf(html, ordinal, prop);
  return {
    prop,
    items: items.map((it) => ({
      index: it.index, kind: it.kind, text: it.text,
      attrs: it.props.filter((p) => !p.spread).map(({ name, type, value, code, json, branches, resolved }) => ({ name, type, value, code, json, ...(resolved ? { resolved: publicText(resolved) } : {}), ...(branches ? { branches: branches.map(({ label, type: t, value: v, editable }) => ({ label, type: t, value: v, editable })) } : {}) })),
      spread: it.props.some((p) => p.spread),
    })),
  };
}

/** How the items of the list are laid out: on lines of their own (with the indentation) or on one line. */
function layoutOf(html, items) {
  const first = items[0];
  if (!first) return { multi: false, indent: "" };
  const lineStart = html.lastIndexOf("\n", first.start - 1) + 1, before = html.slice(lineStart, first.start);
  return /^[ \t]*$/.test(before) ? { multi: true, indent: before } : { multi: false, indent: "" };
}

/** `{ name: value, … }` for a new item; `props` = [{ name, type, value }]. */
function itemSource(props) {
  return props.length ? `{ ${props.map((p) => propSource(p.name, p)).join(", ")} }` : "{}";
}

/** Inserts `text` as the item number `at` (at the end when `at` is not before an item); the commas and the layout of the list are kept. */
function insertItem(html, { items, range }, text, at) {
  const lay = layoutOf(html, items), sep = lay.multi ? `\n${lay.indent}` : " ";
  if (!items.length) return html.slice(0, range.start + 1) + text + html.slice(range.end - 1);
  if (at != null && at < items.length) return html.slice(0, items[at].start) + text + "," + sep + html.slice(items[at].start);
  const last = items.at(-1);
  let p = last.end; while (p < html.length && /[ \t]/.test(html[p])) p++;
  if (html[p] === ",") return html.slice(0, p + 1) + sep + text + "," + html.slice(p + 1); // the list ends with a comma: so does the new item
  return html.slice(0, last.end) + "," + sep + text + html.slice(last.end);
}

/** Adds an object item (`props` = [{ name, type, value }]) at position `at` (default: the end). */
export function addItem(html, ordinal, prop, props, at) {
  const out = insertItem(html, listOf(html, ordinal, prop), itemSource(props ?? []), at);
  assertValid(out);
  return out;
}

/** Inserts a copy of the item right after it. */
export function duplicateItem(html, ordinal, prop, index) {
  const l = listOf(html, ordinal, prop), it = l.items[index];
  if (!it) throw new Error("That item no longer exists in the file.");
  const out = insertItem(html, l, html.slice(it.start, it.end), index + 1);
  assertValid(out);
  return out;
}

/** Removes the item with its comma (and its line). */
export function removeItem(html, ordinal, prop, index) {
  const { items, range } = listOf(html, ordinal, prop), it = items[index];
  if (!it) throw new Error("That item no longer exists in the file.");
  let out;
  if (items.length === 1) out = html.slice(0, range.start + 1) + html.slice(range.end - 1);
  else {
    let end = it.end; while (end < html.length && /[ \t]/.test(html[end])) end++;
    if (html[end] === ",") {
      end++;
      let start = it.start;
      const lineStart = html.lastIndexOf("\n", start - 1) + 1;
      if (/^[ \t]*$/.test(html.slice(lineStart, start))) { start = lineStart; while (end < html.length && /[ \t]/.test(html[end])) end++; if (html[end] === "\n") end++; }
      else while (end < html.length && html[end] === " ") end++;
      out = html.slice(0, start) + html.slice(end);
    } else { // the last item without a comma behind it: the comma in front of it goes
      const prev = items[index - 1];
      let c = prev.end; while (c < html.length && html[c] !== ",") c++;
      out = html.slice(0, c) + html.slice(it.end);
    }
  }
  assertValid(out);
  return out;
}

/** Replaces the whole item with `text` (any expression: an object, or something else); the text must be valid code. */
export function replaceItem(html, ordinal, prop, index, text) {
  const { items } = listOf(html, ordinal, prop), it = items[index];
  if (!it) throw new Error("That item no longer exists in the file.");
  const code = String(text).trim();
  if (!code) throw new Error("The item is empty (use Delete to remove it).");
  try { parseExpression(code, { plugins: ["jsx"] }); } catch (err) { throw new Error(`Invalid code: ${String(err.message).replace(/ \(\d+:\d+\)$/, "")}`); }
  const out = html.slice(0, it.start) + reindent(code, html, it.start) + html.slice(it.end);
  assertValid(out);
  return out;
}

/** Moves the item `from` to the place `to` (the other items shift); everything between the items (commas, comments, line breaks) stays where it is. */
export function moveItem(html, ordinal, prop, from, to) {
  const { items } = listOf(html, ordinal, prop);
  if (!items[from] || to < 0 || to >= items.length) throw new Error("That item cannot be moved there.");
  if (from === to) return html;
  const texts = items.map((it) => html.slice(it.start, it.end)), order = items.map((_, i) => i);
  order.splice(to, 0, order.splice(from, 1)[0]);
  let out = html;
  for (let i = items.length - 1; i >= 0; i--) out = out.slice(0, items[i].start) + texts[order[i]] + out.slice(items[i].end);
  assertValid(out);
  return out;
}

/**
 * Replaces the text of one language where it is written (a literal in an LSI object, an argument of `t("Ano", "Yes")`, a constant, …).
 * `scope` = { attr } for a prop of the element, or { item: { prop, index }, name } for a property of an item of a list prop.
 */
export function setText(html, ordinal, scope, langIdx, value) {
  const e = element(html, ordinal);
  const target = scope.item ? itemOf(html, ordinal, scope.item.prop, scope.item.index, null).item.props.find((p) => p.name === scope.name)?.resolved : e.attrs.find((a) => a.name === scope.attr)?.resolved;
  const t = target?.langs?.[langIdx];
  if (!t) throw new Error("That text is not written out as a literal in the file, so it cannot be edited here.");
  const out = html.slice(0, t.start) + literalSource({ type: "string", value: String(value) }, html.slice(t.start, t.end)) + html.slice(t.end);
  assertValid(out);
  return out;
}

// ---------------------------------------------------------------- one branch of a conditional value

/** A literal value written the way the original was (same quote character when it is safe). */
function literalSource({ type, value }, original) {
  if (type === "string") {
    const q = original?.[0], v = String(value);
    if ((q === '"' || q === "'") && !v.includes(q) && !/[\\\n\r]/.test(v)) return `${q}${v}${q}`;
    return JSON.stringify(v);
  }
  if (type === "number") { const n = Number(value); if (!Number.isFinite(n)) throw new Error("Not a number."); return String(n); }
  if (type === "boolean") return value ? "true" : "false";
  if (type === "null") return "null";
  throw new Error(`Unknown value type ${type}.`);
}

function branchOf(owner, idx) {
  const b = owner?.branches?.[idx];
  if (!b) throw new Error("That condition no longer exists in the file.");
  if (!b.editable) throw new Error("This value is computed in code, so it cannot be edited here.");
  return b;
}

/** Sets the literal value of one branch of a conditional prop (`icon={open ? "a" : "b"}`). */
export function setBranch(html, ordinal, name, idx, value) {
  const e = element(html, ordinal), b = branchOf(e.attrs.find((a) => a.name === name), idx);
  const out = html.slice(0, b.start) + literalSource(value, html.slice(b.start, b.end)) + html.slice(b.end);
  assertValid(out);
  return out;
}

/** The same for a property of an item of a list prop. */
export function setItemBranch(html, ordinal, prop, index, name, idx, value, count) {
  const { item } = itemOf(html, ordinal, prop, index, count), b = branchOf(item.props.find((p) => p.name === name), idx);
  const out = html.slice(0, b.start) + literalSource(value, html.slice(b.start, b.end)) + html.slice(b.end);
  assertValid(out);
  return out;
}

// ---------------------------------------------------------------- the structure (decomposition) of a screen
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod"]);
const MAX_STRUCT_NODES = 400, MAX_STRUCT_DEPTH = 8;
const clip = (s, n = 100) => { const t = String(s).replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const both = (a, b) => (a ? `${a} && ${b}` : b);

/** The render function of a component definition: the `render` method of createVisualComponent({…}), else the first function inside. */
function renderFunctionOf(init) {
  if (!init) return null;
  if (FUNCTION_TYPES.has(init.type)) return init;
  let render = null, first = null;
  walk(init, (n) => {
    if (!first && FUNCTION_TYPES.has(n.type)) first = n;
    if (!render && (n.type === "ObjectMethod" || n.type === "ObjectProperty") && !n.computed && keyOf(n) === "render") render = n.type === "ObjectMethod" ? n : n.value;
  });
  return render && FUNCTION_TYPES.has(render.type) ? render : first;
}

/** The expressions a function returns (not those of the functions inside it), each with the condition of the `if` it stands in. */
function returnsOf(fn) {
  if (fn.type === "ArrowFunctionExpression" && fn.body.type !== "BlockStatement") return [{ expr: fn.body, cond: "" }];
  const out = [];
  const visit = (n, cond) => {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "ReturnStatement") { if (n.argument) out.push({ expr: n.argument, cond }); return; }
    if (FUNCTION_TYPES.has(n.type) && n !== fn) return;
    if (n.type === "IfStatement") { visit(n.consequent, both(cond, `${n.__code}`)); if (n.alternate) visit(n.alternate, cond); return; }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "extra" || key.endsWith("Comments")) continue;
      const v = n[key];
      if (Array.isArray(v)) v.forEach((c) => visit(c, cond)); else if (v && typeof v.type === "string") visit(v, cond);
    }
  };
  visit(fn.body, "");
  return out;
}

/**
 * The structure of a screen in the notation of the decomposition of Unicorn: a tree of the components in the order of rendering.
 * Components defined in the file are opened, `.map(…)` is an iteration (relation "1:N"), `cond && <X/>` and `cond ? <A/> : <B/>` give the
 * condition of rendering (`render`), a non-literal `disabled={…}` the condition of disabling (`disabled`), plain HTML tags are skipped and
 * their children lifted. Every node of a JSX element carries its `ordinal` (the one of `parseElements`), so the inspector can show it.
 * -> a tree { name, kind, change?, note?, children? } or null when the file has no JSX.
 */
export function structureOf(html, name = "") {
  const scripts = [];
  let ordinal = 0, any = false;
  for (const script of babelScripts(html)) {
    let ast;
    try { ast = parse(script.code, { sourceType: "module", plugins: ["jsx"], errorRecovery: true, allowReturnOutsideFunction: true }); } catch { continue; }
    const imported = new Set(), found = [];
    for (const s of ast.program.body) if (s.type === "ImportDeclaration" && UU5_SOURCE.test(s.source.value)) for (const sp of s.specifiers) imported.add(sp.local.name);
    walk(ast.program, (n) => { if (n.type === "JSXOpeningElement") found.push(n); });
    found.sort((a, b) => a.start - b.start);
    const ords = new Map(found.map((n) => [n.start, ordinal++]));
    if (found.length) any = true;
    scripts.push({ code: script.code, ast, imported, ords });
  }
  if (!any) return null;

  const defs = new Map(); // name -> { fn, sc }
  for (const sc of scripts) for (const st of sc.ast.program.body) {
    const d = st.type === "ExportNamedDeclaration" || st.type === "ExportDefaultDeclaration" ? st.declaration : st;
    if (d?.type === "FunctionDeclaration" && /^[A-Z]/.test(d.id?.name ?? "") && !defs.has(d.id.name)) defs.set(d.id.name, { fn: d, sc });
    else if (d?.type === "VariableDeclaration") for (const v of d.declarations) if (v.id.type === "Identifier" && /^[A-Z]/.test(v.id.name) && v.init && !defs.has(v.id.name)) {
      const fn = renderFunctionOf(v.init); if (fn) defs.set(v.id.name, { fn, sc });
    }
  }
  // the if-conditions of returns are read from the source: annotate the tests with their text
  for (const sc of scripts) walk(sc.ast.program, (n) => { if (n.type === "IfStatement") n.__code = clip(sc.code.slice(n.test.start, n.test.end)); });

  let count = 0;
  const stack = [];
  const withCond = (nodes, key, cond) => { if (cond) for (const n of nodes) n[key] = both(cond, n[key] ?? "").replace(/ && $/, ""); return nodes; };
  const text = (sc, n) => clip(sc.code.slice(n.start, n.end));

  function expr(e, sc) {
    if (!e || count > MAX_STRUCT_NODES) return [];
    switch (e.type) {
      case "JSXElement": return element(e, sc);
      case "JSXFragment": return children(e.children, sc);
      case "ParenthesizedExpression": return expr(e.expression, sc);
      case "LogicalExpression": {
        if (e.operator === "&&") return withCond(expr(e.right, sc), "render", text(sc, e.left));
        return [...expr(e.left, sc), ...expr(e.right, sc)];
      }
      case "ConditionalExpression": {
        const t = text(sc, e.test);
        return [...withCond(expr(e.consequent, sc), "render", t), ...withCond(expr(e.alternate, sc), "render", `!(${t})`)];
      }
      case "CallExpression": {
        const c = e.callee;
        if (c.type === "MemberExpression" && !c.computed && (c.property.name === "map" || c.property.name === "flatMap") && FUNCTION_TYPES.has(e.arguments[0]?.type)) {
          const nodes = fnResult(e.arguments[0], sc);
          for (const n of nodes) { n.relation = "1:N"; n.data ??= `item of ${text(sc, c.object)}`; }
          return nodes;
        }
        return [];
      }
      case "ArrowFunctionExpression": case "FunctionExpression": return fnResult(e, sc);
      default: return [];
    }
  }
  function fnResult(fn, sc) {
    const rets = returnsOf(fn), nodes = [], earlier = [];
    for (const { expr: ex, cond } of rets) {
      // a return after `if (x) return …` is rendered when none of the conditions before it holds
      nodes.push(...withCond(expr(ex, sc), "render", cond || earlier.map((c) => `!(${c})`).join(" && ")));
      if (cond) earlier.push(cond);
    }
    return nodes;
  }
  function children(list, sc) {
    const out = [];
    for (const c of list ?? []) {
      if (c.type === "JSXElement") out.push(...element(c, sc));
      else if (c.type === "JSXFragment") out.push(...children(c.children, sc));
      else if (c.type === "JSXExpressionContainer" && c.expression.type !== "JSXEmptyExpression") out.push(...expr(c.expression, sc));
    }
    return out;
  }
  function element(el, sc) {
    const open = el.openingElement, name = jsxName(open.name);
    const kids = [];
    // props that hold components (header={<Text/>}, component={<X/>}) belong to the component too
    let disabled = "";
    for (const a of open.attributes) {
      if (a.type !== "JSXAttribute" || a.value?.type !== "JSXExpressionContainer") continue;
      const prop = jsxName(a.name), ex = a.value.expression;
      if (prop === "disabled" && !literalOf(ex)) disabled = text(sc, ex);
      else if (prop !== "disabled") { const sub = expr(ex, sc); if (sub.length && (ex.type === "JSXElement" || ex.type === "JSXFragment" || ex.type === "ArrowFunctionExpression" || ex.type === "LogicalExpression" || ex.type === "ConditionalExpression")) kids.push(...sub.map((n) => ({ ...n, note: n.note ?? `prop ${prop}` }))); }
    }
    kids.push(...children(el.children, sc));
    const transparent = /^[a-z]/.test(name) || name === "Fragment" || name === "React.Fragment" || name === "";
    if (transparent) return kids;
    if (++count > MAX_STRUCT_NODES) return [];
    const local = defs.get(name);
    const node = { name, kind: sc.imported.has(name.split(".")[0]) ? "library" : "existing", ordinal: sc.ords.get(open.start) };
    if (disabled) node.disabled = disabled;
    if (local && !stack.includes(name) && stack.length < MAX_STRUCT_DEPTH && !kids.length) {
      stack.push(name);
      const inner = fnResult(local.fn, local.sc);
      stack.pop();
      node.note = "defined in this file";
      if (inner.length) node.children = inner;
    } else if (kids.length) node.children = kids;
    return [node];
  }

  // the root: what the page renders (`….render(<App/>)`), else the last component of the file
  let rootEl = null, rootSc = null;
  for (const sc of scripts) if (!rootEl) walk(sc.ast.program, (n) => {
    if (!rootEl && n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.property.name === "render" && (n.arguments[0]?.type === "JSXElement" || n.arguments[0]?.type === "JSXFragment")) { rootEl = n.arguments[0]; rootSc = sc; }
  });
  let kids;
  if (rootEl) kids = expr(rootEl, rootSc);
  else { const last = [...defs.values()].at(-1); kids = last ? fnResult(last.fn, last.sc) : []; }
  const tree = { name: name ? `Screen: ${name}` : "Screen", kind: "screen" };
  if (kids.length) tree.children = kids;
  return tree;
}

/** The structure as text for the agent: one line per component, indented; ×N = once per item, [R: …] rendered when, [D: …] disabled when. */
export function structureOutline(tree) {
  const lines = [];
  const walkTree = (n, depth) => {
    const tags = [n.relation ? "×N" : "", n.render ? `[R: ${n.render}]` : "", n.disabled ? `[D: ${n.disabled}]` : "", n.label ? `// ${n.label}` : "", n.data ? `← ${n.data}` : "", n.note ? `(${n.note})` : ""].filter(Boolean);
    lines.push(`${"  ".repeat(depth)}${n.name}${tags.length ? ` ${tags.join(" ")}` : ""}`);
    for (const c of n.children ?? []) walkTree(c, depth + 1);
  };
  walkTree(tree, 0);
  return lines.join("\n");
}
