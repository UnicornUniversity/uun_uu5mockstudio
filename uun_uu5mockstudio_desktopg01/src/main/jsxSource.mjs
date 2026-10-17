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
function objectProps(obj, code, abs) {
  return obj.properties.map((p) => {
    if (p.type !== "ObjectProperty" || p.computed) return { spread: true, start: abs(p.start), end: abs(p.end), text: code.slice(p.start, p.end) };
    const name = p.key.type === "Identifier" ? p.key.name : p.key.type === "StringLiteral" ? p.key.value : String(p.key.value ?? "");
    const base = { name, start: abs(p.start), end: abs(p.end), shorthand: Boolean(p.shorthand) };
    const v = p.value, lit = literalOf(v), c = code.slice(v.start, v.end);
    return lit ? { ...base, ...lit, code: c } : { ...base, type: "code", value: c, code: c, json: jsonOf(v), branches: branchesOf(v, code, abs) };
  });
}
/** Array literal -> items; an item that is an object literal gets its properties, anything else is opaque. */
function arrayItems(arr, code, abs) {
  return arr.elements.map((e, index) => {
    if (e && e.type === "ObjectExpression") return { index, kind: "object", start: abs(e.start), end: abs(e.end), openEnd: abs(e.start + 1), closeStart: abs(e.end - 1), props: objectProps(e, code, abs), text: code.slice(e.start, e.end) };
    return { index, kind: "other", start: e ? abs(e.start) : null, end: e ? abs(e.end) : null, props: [], text: e ? code.slice(e.start, e.end) : "" };
  });
}

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
          return { ...attr, type: "code", value: code, code, json: jsonOf(ex), branches: branchesOf(ex, script.code, abs), ...(ref ? { ref } : {}), ...(arr ? { items: arrayItems(arr, script.code, abs) } : {}) };
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

const publicAttrs = (e) => e.attrs.filter((a) => !a.spread && a.name !== SRC_ATTR).map(({ name, type, value, code, bare, json, ref, branches }) => ({ name, type, value, code, bare, json, ...(branches ? { branches: branches.map(({ label, type: t, value: v, editable }) => ({ label, type: t, value: v, editable })) } : {}), ...(ref ? { ref: { name: ref.name, code: ref.code, json: ref.json } } : {}) }));

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
  const attrs = item.props.filter((p) => !p.spread).map(({ name, type, value, code, json, branches }) => ({ name, type, value, code, json, ...(branches ? { branches: branches.map(({ label, type: t, value: v, editable }) => ({ label, type: t, value: v, editable })) } : {}) }));
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
