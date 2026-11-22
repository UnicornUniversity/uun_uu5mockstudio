/**
 * The "as is" tree of an existing component of the repository, read from its code: what it renders (its own components, followed into
 * the files it imports, and the library components) and what it uses that is not visual (providers, contexts, hooks, data loading).
 * Every node knows its role and its file, so the plan made from it is the real decomposition, not only the visual one.
 * Node: { name, kind: "existing" | "library", role?: "visual" | "component" | "provider" | "context" | "hook" | "data" | "unknown",
 *         source?, props?, relation?, render?, note?, children? }.
 */
import fs from "node:fs";
import path from "node:path";
import { parseCode, walk, repoComponentProps } from "./componentProps.mjs";
import { isSecretPath } from "./repo.mjs";
import { PREVIEW_LIBS } from "./componentPreview.mjs";
import { CORE_IMPORTS } from "./componentSnippets.mjs";

/** The namespace of a uu5 library by its package (uu_plus4u5g02-elements -> Plus4U5Elements), as the mockups and the documentation name it. */
const LIB_NS = Object.fromEntries([...Object.entries(CORE_IMPORTS).map(([ns, pkg]) => [pkg, ns]), ...Object.entries(PREVIEW_LIBS).map(([ns, [pkg]]) => [pkg, ns])]);
/**
 * The name of a library component as the documentation writes it, whatever the import: `import { StateBadge } from "uu_plus4u5g02-elements"`
 * gives Plus4U5Elements.StateBadge, `import Elements from "uu5g05-elements"` + <Elements.Badge> gives Uu5Elements.Badge. Other packages keep the written name.
 */
export function libraryName(name, imp) {
  const ns = imp && LIB_NS[imp.from];
  if (!ns) return name;
  const [root, ...rest] = name.split(".");
  if (imp.imported === "default" || imp.imported === "*") return root === ns ? name : [ns, ...rest].join(".");
  return [ns, imp.imported, ...rest].join(".");
}

const EXT = [".js", ".jsx", ".ts", ".tsx", ".mjs"];
/** Hooks of React and uu5 that say nothing about the design (state, effects, texts…): left out of the tree. */
const PLAIN_HOOKS = new Set(["useState", "useEffect", "useLayoutEffect", "useMemo", "useCallback", "useRef", "useReducer", "useImperativeHandle", "useId", "useTransition", "useDeferredValue",
  "useLsi", "useLanguage", "useScreenSize", "useElementSize", "useDevice", "useAppBackground", "useBackground", "useSpacing", "useNestingLevel", "useUserPreferences", "usePreviousValue", "useValueChange", "useStateWithRef", "useEvent", "useLsiValues", "useTimeZone", "useSession"]);
const DATA_HOOKS = new Set(["useDataObject", "useDataList", "useDataCollection", "useDataTree"]);
const MAX_NODES = 300;

/** The role of a component of a library by its name: providers, loaders (data) and state resolvers (logic that shows loading / error) are not visual. */
export function libraryRole(name) {
  if (/Provider$/.test(name)) return "provider";
  if (/Loader$/.test(name)) return "data";
  if (/(StateResolver|Resolver)$/.test(name)) return "component";
  return null;
}
const keyName = (k) => (k?.type === "Identifier" ? k.name : k?.type === "StringLiteral" ? k.value : null);
const jsxName = (n) => (n.type === "JSXIdentifier" ? n.name : n.type === "JSXMemberExpression" ? `${jsxName(n.object)}.${jsxName(n.property)}` : n.type === "JSXNamespacedName" ? `${n.namespace.name}:${n.name.name}` : "");

/** A relative import resolved to a file of the repository (with the usual extensions and index files), or null. */
export function resolveImport(repoDir, fromFile, spec) {
  if (!/^\.\.?\//.test(spec)) return null;
  const base = path.resolve(path.dirname(path.join(repoDir, fromFile)), spec), root = path.resolve(repoDir);
  for (const c of [base, ...EXT.map((e) => base + e), ...EXT.map((e) => path.join(base, `index${e}`))]) {
    if (!c.startsWith(root + path.sep)) return null;
    try { if (fs.statSync(c).isFile()) { const rel = path.relative(root, c).split(path.sep).join("/"); return isSecretPath(rel) ? null : rel; } } catch { /* next */ }
  }
  return null;
}

/** One module: its imports ({ local → { from, imported, file } }), its components (name → { fn, role }) and its default export. */
function readModule(repoDir, rel) {
  let code; try { code = fs.readFileSync(path.join(repoDir, rel), "utf8"); } catch { return null; }
  const ast = parseCode(code); if (!ast) return null;
  const imports = new Map(), comps = new Map(), fns = new Map(); // fns: helper functions of the module (lowercase) that may return JSX
  let def = null;
  const asComponent = (init) => { // createVisualComponent({ render }) / createComponent({ render }) / a function returning JSX
    if (!init) return null;
    if (init.type === "CallExpression") {
      const callee = init.callee.type === "MemberExpression" ? keyName(init.callee.property) : keyName(init.callee);
      const obj = init.arguments.find((a) => a.type === "ObjectExpression");
      const r = obj?.properties.find((p) => keyName(p.key) === "render");
      if (/^create(Visual)?Component$/.test(callee ?? "") && r) return { fn: r.type === "ObjectMethod" ? r : r.value, role: callee === "createVisualComponent" ? "visual" : "component", uu5Tag: keyName(obj.properties.find((p) => keyName(p.key) === "uu5Tag")?.value) ?? obj.properties.find((p) => keyName(p.key) === "uu5Tag")?.value?.value ?? null };
      if (/^(memo|forwardRef)$/.test(callee ?? "") && init.arguments[0]) return asComponent(init.arguments[0]);
      if (/^create(Context|UseContext)$/.test(callee ?? "")) return { fn: null, role: "context" };
      // a component made by a higher-order function: Uu5DnD.withDroppableItemList(ScrollableBox, DraggableListItem)
      const wrapped = init.arguments.filter((a) => a.type === "Identifier" && /^[A-Z]/.test(a.name) || (a.type === "MemberExpression" && a.object.type === "Identifier" && /^[A-Z]/.test(keyName(a.property) ?? ""))).map((a) => (a.type === "Identifier" ? a.name : `${a.object.name}.${keyName(a.property)}`));
      if (wrapped.length) return { fn: null, role: "visual", hoc: { by: code.slice(init.callee.start, init.callee.end), wrapped } };
    }
    if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") return { fn: init, role: "visual" };
    return null;
  };
  for (const st of ast.program.body) {
    if (st.type === "ImportDeclaration") {
      for (const s of st.specifiers) imports.set(s.local.name, { from: st.source.value, imported: s.type === "ImportDefaultSpecifier" ? "default" : s.type === "ImportNamespaceSpecifier" ? "*" : keyName(s.imported), file: resolveImport(repoDir, rel, st.source.value) });
      continue;
    }
    const d = st.type === "ExportNamedDeclaration" || st.type === "ExportDefaultDeclaration" ? st.declaration : st;
    if (d?.type === "VariableDeclaration") for (const v of d.declarations) { const c = v.id.type === "Identifier" && /^[A-Z]/.test(v.id.name) ? asComponent(v.init) : null; if (c) comps.set(v.id.name, c); }
    if (d?.type === "FunctionDeclaration" && d.id && /^[A-Z]/.test(d.id.name)) comps.set(d.id.name, { fn: d, role: "visual" });
    if (d?.type === "FunctionDeclaration" && d.id && /^[a-z]/.test(d.id.name)) fns.set(d.id.name, d);
    if (d?.type === "VariableDeclaration") for (const v of d.declarations) if (v.id.type === "Identifier" && /^[a-z]/.test(v.id.name) && /^(Arrow)?Function(Expression)?$/.test(v.init?.type ?? "")) fns.set(v.id.name, v.init);
    if (st.type === "ExportDefaultDeclaration") {
      if (d?.type === "Identifier") def = d.name;
      else if (d?.id?.name) def = d.id.name;
      else { const c = asComponent(d); if (c) { comps.set("default", c); def = "default"; } }
    }
    if (st.type === "ExportNamedDeclaration" && !st.declaration) for (const s of st.specifiers) if (keyName(s.exported) === "default") def = s.local.name;
  }
  return { code, ast, imports, comps, fns, def };
}

/** The main component of a module: the default export, else the one named like the file, else the only one. */
function mainComponent(mod, rel, wanted = null) {
  if (wanted && wanted !== "default" && mod.comps.has(wanted)) return wanted;
  if (mod.def && mod.comps.has(mod.def)) return mod.def;
  const flat = path.basename(rel).replace(/\.[^.]+$/, "").replace(/[-_]/g, "").toLowerCase();
  return [...mod.comps.keys()].find((n) => n.toLowerCase() === flat) ?? (mod.comps.size === 1 ? [...mod.comps.keys()][0] : null);
}

/**
 * The tree of the component in `file` (a path in the repository) down to `depth` files. Throws a readable error when the file cannot be
 * read or holds no component. `{ tree, files }` (files: the paths that were read).
 */
export function asIsTree(repoDir, file, { depth = 3, component = null } = {}) {
  const root = path.resolve(repoDir);
  let count = 0;
  const files = new Set(), cache = new Map();
  const mod = (rel) => { if (!cache.has(rel)) cache.set(rel, readModule(root, rel)); return cache.get(rel); };
  const first = mod(file);
  if (!first) throw new Error(`The file ${file} cannot be read as JavaScript.`);
  const mainName = mainComponent(first, file, component);
  if (!mainName) throw new Error(`No component was found in ${file} (createVisualComponent, createComponent or a function component).`);

  /** A node of a component defined in `rel` (followed into its render while depth allows). */
  function componentNode(rel, name, display, level, stack) {
    const m = mod(rel), c = m?.comps.get(name);
    files.add(rel);
    const n = { name: display || (name === "default" ? path.basename(rel).replace(/\.[^.]+$/, "") : name), kind: "existing", role: c?.role ?? "unknown", source: rel };
    if (++count > MAX_NODES) return n;
    if (c?.role === "context") return n;
    if (c?.hoc) { // made by a higher-order function: what it wraps are its children
      n.note = `${c.hoc.by}(${c.hoc.wrapped.join(", ")})`;
      const kids = c.hoc.wrapped.map((w) => wrappedNode(m, rel, w, level, [...stack, `${rel}#${name}`])).filter(Boolean);
      if (kids.length) n.children = kids;
      return n;
    }
    const props = m && name === mainComponent(m, rel) ? repoComponentProps(m.code) : [];
    if (props.length) n.props = props;
    const key = `${rel}#${name}`;
    if (!c?.fn || level > depth || stack.includes(key)) { if (!c?.fn && c?.role !== "context") n.note = "not followed further"; return n; }
    const kids = [...hooksOf(m, rel, c.fn, level, [...stack, key]), ...renderOf(m, rel, c.fn, level, [...stack, key])];
    if (kids.length) n.children = kids;
    return n;
  }
  /** A component named in a higher-order call: of the same file (followed), of a library, or of another file of the repository. */
  function wrappedNode(m, rel, w, level, stack) {
    const root = w.split(".")[0], imp = m.imports.get(root);
    if (m.comps.has(w)) return componentNode(rel, w, w, level + 1, stack);
    if (imp?.file && !w.includes(".")) { const sub = mod(imp.file); return componentNode(imp.file, sub ? mainComponent(sub, imp.file, imp.imported) ?? imp.imported : imp.imported, w, level + 1, stack); }
    if (imp) { count++; const role = libraryRole(w); return { name: libraryName(w, imp), kind: "library", ...(role ? { role } : {}) }; }
    return null;
  }
  /** The hooks a render calls that matter for the design: loading data, contexts, the repository's own hooks. */
  function hooksOf(m, rel, fn, level, stack) {
    const out = [], seen = new Set();
    walk(fn.body, (x) => {
      if (x.type !== "CallExpression" || count > MAX_NODES) return;
      const name = x.callee.type === "Identifier" ? x.callee.name : x.callee.type === "MemberExpression" ? keyName(x.callee.property) : null;
      if (!name || !/^use[A-Z]/.test(name) || PLAIN_HOOKS.has(name) || seen.has(name)) return;
      seen.add(name); count++;
      if (DATA_HOOKS.has(name)) {
        const calls = []; walk(x, (y) => { if (y.type === "MemberExpression" && y.object.type === "Identifier" && /^Calls$/i.test(y.object.name)) calls.push(keyName(y.property)); });
        const keys = []; walk(x.arguments[0], (y) => { if (y.type === "ObjectProperty" && keyName(y.key) === "handlerMap" && y.value.type === "ObjectExpression") for (const p of y.value.properties) keys.push(keyName(p.key)); });
        out.push({ name, kind: "library", role: "data", ...(calls.length || keys.length ? { note: [keys.length && `handlers: ${keys.filter(Boolean).join(", ")}`, calls.length && `calls: ${[...new Set(calls)].filter(Boolean).join(", ")}`].filter(Boolean).join("; ") } : {}) });
      } else if (name === "useContext") {
        const arg = x.arguments[0]; out.push({ name: `useContext(${arg?.type === "Identifier" ? arg.name : "…"})`, kind: "library", role: "context" });
      } else {
        const owner = x.callee.type === "MemberExpression" && x.callee.object.type === "Identifier" ? m.imports.get(x.callee.object.name) : null; // Shape.useShape(): a hook of what is imported
        const imp = owner ?? m.imports.get(name);
        if (imp?.file) files.add(imp.file);
        out.push(imp?.file ? { name, kind: "existing", role: "hook", source: imp.file } : { name, kind: imp ? "library" : "existing", role: "hook", ...(imp ? {} : { source: rel }) });
      }
    });
    return out;
  }
  /**
   * The components the render returns, in the order of rendering; plain HTML and fragments are see-through. Only the returns of the render
   * itself count (not those of callbacks inside it); an early `if (cond) return <A/>` gives A rendered when cond, and the rest "not (cond)".
   */
  function renderOf(m, rel, fn, level, stack) {
    const out = [], code = (n) => m.code.slice(n.start, n.end).replace(/\s+/g, " ").slice(0, 160);
    if (fn.body?.type && fn.body.type !== "BlockStatement") return fromExpr(m, rel, fn.body, level, stack, {}); // an arrow returning JSX
    const conds = [];
    pushLocals(fn.body);
    try { return renderBody(m, rel, fn, level, stack, out, code, conds); } finally { scopes.pop(); }
  }
  /** The consts of a body that hold JSX or something with JSX in it (const stateBadge = <StateBadge …/>; const children = (…)): found when used as {stateBadge}. */
  const scopes = [];
  function pushLocals(body) {
    const locals = new Map();
    for (const st of body?.body ?? []) if (st.type === "VariableDeclaration") for (const v of st.declarations) {
      if (!v.init) continue;
      if (v.id.type === "Identifier") locals.set(v.id.name, v.init);
      // const { containerProps, componentProps } = ContentContainer.splitProps(props, { title: <Header/> }): each name holds what the call was given,
      // read only where it is spread into a component ({...containerProps}), not where one value of it is passed (colorScheme={colorScheme})
      else if (v.id.type === "ObjectPattern" && v.init.type !== "Identifier") for (const pr of v.id.properties) { const id = pr.type === "RestElement" ? pr.argument : pr.value?.type === "AssignmentPattern" ? pr.value.left : pr.value; if (id?.type === "Identifier") locals.set(id.name, { spreadOnly: v.init }); }
    }
    scopes.push(locals);
  }
  const resolving = new Set(), spread = new Set();
  function renderBody(m, rel, fn, level, stack, out, code, conds) {
    const returnsIn = (st) => { const r = []; if (!st) return r; if (st.type === "ReturnStatement") r.push(st); else if (st.type === "BlockStatement") for (const x of st.body) if (x.type === "ReturnStatement") r.push(x); return r; };
    for (const st of fn.body?.body ?? []) {
      if (st.type === "IfStatement") {
        for (const r of returnsIn(st.consequent)) if (r.argument) out.push(...fromExpr(m, rel, r.argument, level, stack, { render: code(st.test) }));
        if (returnsIn(st.consequent).length) conds.push(code(st.test));
        for (const r of returnsIn(st.alternate)) if (r.argument) out.push(...fromExpr(m, rel, r.argument, level, stack, { render: `not (${code(st.test)})` }));
      } else if (st.type === "ReturnStatement" && st.argument) {
        out.push(...fromExpr(m, rel, st.argument, level, stack, conds.length ? { render: conds.map((c) => `not (${c})`).join(" and ") } : {}));
      }
    }
    return dedupe(out);
  }
  function fromExpr(m, rel, e, level, stack, ctx) {
    if (!e || count > MAX_NODES) return [];
    switch (e.type) {
      case "JSXElement": return [fromElement(m, rel, e, level, stack, ctx)].flat().filter(Boolean);
      case "JSXFragment": return e.children.flatMap((c) => fromChild(m, rel, c, level, stack, ctx));
      case "ConditionalExpression": return [...fromExpr(m, rel, e.consequent, level, stack, { ...ctx, render: m.code.slice(e.test.start, e.test.end) }), ...fromExpr(m, rel, e.alternate, level, stack, { ...ctx, render: `not (${m.code.slice(e.test.start, e.test.end)})` })];
      case "LogicalExpression": return fromExpr(m, rel, e.right, level, stack, { ...ctx, render: m.code.slice(e.left.start, e.left.end) });
      case "ParenthesizedExpression": return fromExpr(m, rel, e.expression, level, stack, ctx);
      case "ArrowFunctionExpression": case "FunctionExpression": { // a render prop: {({ dataObject }) => <View … />}
        if (e.body.type !== "BlockStatement") return fromExpr(m, rel, e.body, level, stack, ctx);
        const r = []; pushLocals(e.body);
        try { for (const st of e.body.body) if (st.type === "ReturnStatement" && st.argument) r.push(...fromExpr(m, rel, st.argument, level, stack, ctx)); } finally { scopes.pop(); }
        return r;
      }
      case "CallExpression": { // items.map((x) => <Item/>)
        const isMap = e.callee.type === "MemberExpression" && keyName(e.callee.property) === "map";
        const fnArg = e.arguments.find((a) => a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression");
        if (isMap && fnArg) { const body = fnArg.body.type === "BlockStatement" ? (() => { const r = []; walk(fnArg.body, (x) => { if (x.type === "ReturnStatement" && x.argument) r.push(x.argument); }); return r; })() : [fnArg.body]; const made = body.flatMap((b) => fromExpr(m, rel, b, level, stack, { ...ctx, many: true }));
          const carried = e.callee.object.type === "Identifier" || e.callee.object.type === "CallExpression" ? fromExpr(m, rel, e.callee.object, level, stack, {}) : []; // JSX in the items themselves ({ children: <PersonItem/> }) is shown in what renders them
          if (carried.length && made.length === 1) made[0].children = [...(made[0].children ?? []), ...carried];
          return made.length ? made : carried; }
        return jsxInside(m, rel, e, level, stack, ctx); // a helper of the file, or JSX in the arguments
      }
      case "Identifier": { // {stateBadge}: a const of the render (or of the enclosing render prop) holding JSX
        const init = [...scopes].reverse().find((sc) => sc.has(e.name))?.get(e.name);
        if (!init || init.spreadOnly || resolving.has(init)) return [];
        resolving.add(init); try { return fromExpr(m, rel, init, level, stack, ctx); } finally { resolving.delete(init); }
      }
      default: return jsxInside(m, rel, e, level, stack, ctx);
    }
  }
  /**
   * JSX inside anything else: an array or object of items ([{ icon, children: <PersonItem/> }]), a call of a helper function of the same file
   * (buildInfoItemList(…) is followed into its body), a template of props. Only the outermost JSX elements count.
   */
  function jsxInside(m, rel, e, level, stack, ctx) {
    const out = [];
    const visit = (x) => {
      if (!x || typeof x.type !== "string") return;
      if (x.type === "JSXElement" || x.type === "JSXFragment") { out.push(...fromExpr(m, rel, x, level, stack, ctx)); return; }
      if (x.type === "CallExpression" && x.callee.type === "Identifier" && m.fns?.has(x.callee.name)) { const f = m.fns.get(x.callee.name); if (!resolving.has(f)) { resolving.add(f); try { pushLocals(f.body?.type === "BlockStatement" ? f.body : null); try { visit(f.body); } finally { scopes.pop(); } } finally { resolving.delete(f); } } }
      if (x.type === "Identifier" && x !== e) { out.push(...fromExpr(m, rel, x, level, stack, ctx)); return; }
      for (const k of Object.keys(x)) {
        if (k === "loc" || k === "leadingComments" || k === "trailingComments" || k === "callee" && x.type === "CallExpression" && x.callee.type === "Identifier") continue;
        if (x.type === "MemberExpression" && k === "property" || x.type === "ObjectProperty" && k === "key") continue;
        const v = x[k]; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === "string") visit(v);
      }
    };
    if (e.type === "CallExpression" || e.type === "ArrayExpression" || e.type === "ObjectExpression" || e.type === "SequenceExpression") visit(e);
    return out;
  }
  function fromChild(m, rel, c, level, stack, ctx) {
    if (c.type === "JSXElement" || c.type === "JSXFragment") return fromExpr(m, rel, c, level, stack, ctx);
    if (c.type === "JSXExpressionContainer") return fromExpr(m, rel, c.expression, level, stack, ctx);
    return [];
  }
  function fromElement(m, rel, el, level, stack, ctx) {
    const name = jsxName(el.openingElement.name), rootId = name.split(".")[0];
    const inProps = () => el.openingElement.attributes.flatMap((a) => { // footer={<SubmitButton/>}, header={stateBadge}, itemList={[{ children: <X/> }]}
      if (a.type === "JSXSpreadAttribute") { // {...containerProps}: the JSX in the props it spreads (title: <Header/>), once – a sibling spread of the same split call does not repeat it
        if (a.argument.type !== "Identifier") return [];
        const local = [...scopes].reverse().find((sc) => sc.has(a.argument.name))?.get(a.argument.name), init = local?.spreadOnly ?? local;
        if (!init || spread.has(init)) return [];
        spread.add(init); return fromExpr(m, rel, init, level, stack, {});
      }
      const v = a.type === "JSXAttribute" ? a.value : null;
      if (!v) return [];
      if (v.type === "JSXElement" || v.type === "JSXFragment") return fromExpr(m, rel, v, level, stack, {});
      const x = v.type === "JSXExpressionContainer" ? v.expression : null;
      if (!x || /^on[A-Z]/.test(a.name?.name ?? "")) return []; // handlers draw nothing
      return fromExpr(m, rel, x, level, stack, {});
    });
    const kids = () => [...inProps(), ...el.children.flatMap((c) => fromChild(m, rel, c, level, stack, {}))];
    if (!name || /^[a-z]/.test(name) || /^(Fragment|React\.Fragment)$/.test(name)) return kids(); // see-through
    const tag = (n) => { if (ctx.many) n.relation = "1:N"; if (ctx.render) n.render = ctx.render.slice(0, 160); return n; };
    const imp = m.imports.get(rootId);
    if (/\.Provider$/.test(name)) { // Context.Provider of the repository, or Shape.Provider of a library
      count++; const inner = kids();
      return tag(imp && !imp.file ? { name: libraryName(name, imp), kind: "library", role: "provider", ...(inner.length ? { children: dedupe(inner) } : {}) } : { name, kind: "existing", role: "provider", source: imp?.file ?? rel, ...(inner.length ? { children: dedupe(inner) } : {}) });
    }
    let n;
    if (m.comps.has(name)) n = componentNode(rel, name, name, level + 1, stack); // defined in the same file
    else if (imp?.file && !name.includes(".")) { const sub = mod(imp.file); n = componentNode(imp.file, sub ? mainComponent(sub, imp.file, imp.imported) ?? imp.imported : imp.imported, name, level + 1, stack); }
    else if (imp && !imp.file) { count++; const role = libraryRole(name); n = { name: libraryName(name, imp), kind: "library", ...(role ? { role } : {}) }; }
    else { count++; n = { name, kind: "existing", role: "unknown", note: "not found among the imports" }; }
    if (n.kind === "existing" && n.role === "component" && /Provider$/.test(n.name)) n.role = "provider"; // a createComponent named …Provider gives data to its children
    const inner = kids();
    if (inner.length) n.children = dedupe([...(n.children ?? []), ...inner]);
    return tag(n);
  }
  /** Two equal siblings in a row (the same component twice by a condition) stay as they are; nothing to merge across files. */
  const dedupe = (list) => list;

  const tree = componentNode(file, mainName, mainName === "default" ? null : mainName, 0, []);
  return { tree, files: [...files] };
}

/** The file name of a screen made from a component: "CourseOverview" → course-overview. */
export const screenNameOf = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "component";

/** The text of an outline line's roles for people: what is visual and what is logic. */
const ROLE_LABEL = { visual: "visual", component: "non-visual component", provider: "provider", context: "context", hook: "hook", data: "data loading", unknown: "not recognised" };
/** The tree as indented lines for the agent and for HANDOFF: name, role, file, ×N and the render condition. */
export function asIsOutline(tree) {
  const L = [];
  const w = (n, d) => { L.push(`${"  ".repeat(d)}${n.name}${[n.kind === "library" && !n.role ? "" : n.role ? ` (${ROLE_LABEL[n.role] ?? n.role})` : "", n.source ? ` — ${n.source}` : "", n.relation ? " ×N" : "", n.render ? ` [R: ${n.render}]` : "", n.note ? ` // ${n.note}` : ""].join("")}`); (n.children ?? []).forEach((c) => w(c, d + 1)); };
  if (tree) w(tree, 0);
  return L.join("\n");
}

/** The plan file of the baseline: the component as it is now, the starting point of a redesign (approved: nothing in it is to be built). */
export function baselinePlan({ name, file, tree, files, date }) {
  return `---
title: ${name} (as is)
status: approved
created: ${date}
baseline: ${file}
---
# ${name} (as is)

The existing component \`${file}\` of the linked repository as it is now, read from its code (${files.length} file${files.length === 1 ? "" : "s"}: ${files.map((f) => `\`${f}\``).join(", ")}). It is the starting point: the changes are planned against this tree. Visual components are in the mockup; providers, hooks and data loading are only here.

\`\`\`uu5-tree
${JSON.stringify(tree, null, 2)}
\`\`\`
`;
}

/** Namespaces simulated in a mockup even when the code has them: the application shell (Spa, routes, the Top) needs a running uuApp. */
const SHELL_ONLY = /^Plus4U5App$/;
/**
 * What the agent must know about the library components of the code: use exactly these, for real (no look-alikes from another library) –
 * also the Plus4U ones, which work in the screens of this app (served over http) – with the uu5DemoDependencies they need. Only what cannot
 * be loaded (the app shell, a library unknown to the mockup runtime) is a stand-in under the same name, so that the screen reads like the code.
 */
export function libraryRule(tree, { plan = false, who = "the code" } = {}) {
  const names = new Set();
  const w = (n) => { if (n.kind === "library" && (!n.role || n.role === "visual") && /^[A-Z]\w*\.[A-Z]/.test(n.name)) names.add(n.name); (n.children ?? []).forEach(w); };
  if (tree) w(tree);
  if (!names.size) return "";
  const all = [...names], ns = (n) => n.split(".")[0];
  const loadable = (n) => !SHELL_ONLY.test(ns(n)) && Boolean(CORE_IMPORTS[ns(n)] || PREVIEW_LIBS[ns(n)]);
  const stand = all.filter((n) => !loadable(n)), extra = [...new Set(all.filter(loadable).map(ns))].filter((x) => !CORE_IMPORTS[x]);
  const list = `${all.slice(0, 30).join(", ")}${all.length > 30 ? ", …" : ""}`;
  if (plan) return `Library components: in the uu5-tree use the ones ${who} uses for the same purposes – nodes of kind "library" named exactly ${list} – never a look-alike of another library (e.g. no Uu5Elements.Block where ${who} has Plus4U5Elements.ContentContainer, no Uu5Elements.Badge for a StateBadge). Only a part ${who} has nothing for gets another library component.`;
  const deps = extra.map((x) => `"${PREVIEW_LIBS[x][0]}": "${PREVIEW_LIBS[x][1]}"`), imports = extra.map((x) => `import ${x} from "${PREVIEW_LIBS[x][0]}";`);
  const plus = extra.some((x) => /^(Plus4U5|UuT)/.test(x)) || deps.some((d) => d.includes("uu_plus4u5g02")) ? ` and "uu_plus4u5g02": "1.x"` : "";
  const byNs = {}; for (const n of stand) (byNs[ns(n)] ??= []).push(n.split(".").slice(1).join("."));
  return [
    `Library components: use exactly the ones ${who} uses (${list}) – the real components with the props ${who} gives them, never a look-alike from another library (e.g. no Uu5Elements.Block where ${who} has Plus4U5Elements.ContentContainer, no Uu5Elements.Badge for a StateBadge).`,
    extra.length ? `Load their libraries for real: add ${deps.join(", ")}${plus} to uu5DemoDependencies with ${imports.map((i) => `\`${i}\``).join(" ")}. This includes the Plus4U libraries: in uu5Mock Studio the screens are served over http and Plus4U5Elements renders there, so for the components ${who} uses this overrides the rule of the uu5-mockup skill against Plus4U libraries. A component that loads its own data from a uuApp (e.g. PersonItem) shows without it – that is expected; never replace it.` : "",
    stand.length ? `Only these cannot be loaded in a mockup (${stand.some((n) => SHELL_ONLY.test(ns(n))) ? "the application shell needs a running uuApp" : "the library is not available to the mockup runtime"}), so simulate them under the SAME name: define ${Object.entries(byNs).map(([n, parts]) => `\`const ${n} = { ${parts.map((p) => `${p}: (props) => …`).join(", ")} };\``).join(" and ")} in the screen, built from uu5g05-elements with the look of the real component, with the comment \`// mockup stand-in\`, and write them in JSX exactly as ${who} does.` : "",
  ].filter(Boolean).join("\n");
}

/** Library components a mockup draws with another one of uu5g05-elements (the visible equivalent): reported as "drawn as", not as a difference. */
export const LIB_EQUIV = { ContentContainer: "Block", RouteContainer: "Block", AppContainer: "Block", ContentBox: "Box" };
const LIB_NAME = /^(Uu5|Plus4U5|UuT|Uu)[A-Za-z0-9]*\.[A-Z]/;
/** The stand-ins a mockup defines instead of a library: `const Plus4U5Elements = { StateBadge: (props) => … }` → ["Plus4U5Elements.StateBadge"]. */
export function standInsOf(html) {
  const out = [];
  for (const m of String(html ?? "").matchAll(/(?:const|let|var)\s+((?:Plus4U5|Uu5|UuT|Uu)[A-Za-z0-9]*)\s*=\s*\{/g)) {
    let depth = 0, i = m.index + m[0].length - 1, body = "";
    for (; i < html.length; i++) { const ch = html[i]; if (ch === "{") depth++; else if (ch === "}" && --depth === 0) break; if (depth === 1) body += ch; }
    for (const k of body.matchAll(/(?:^|[,{\s])([A-Z][A-Za-z0-9]*)\s*[:(]/g)) out.push(`${m[1]}.${k[1]}`);
  }
  return [...new Set(out)];
}
/**
 * How the library components of a screen differ from those of the code it is made from (the existing component, or the reference of a new one):
 * { standIns (simulated under the real name, the Plus4U libraries cannot be loaded), drawnAs ([code, screen]: a visible equivalent, e.g.
 * ContentContainer as Block), notInCode (used by the screen, not by the code), notOnScreen (only for a redesign: in the code, not drawn) }.
 */
export function libraryDeviations(codeTree, screenTree, html, { kind = "baseline" } = {}) {
  const code = new Set(), screen = new Set();
  const wc = (n) => { if (n.kind === "library" && (!n.role || n.role === "visual") && LIB_NAME.test(n.name)) code.add(n.name); (n.children ?? []).forEach(wc); };
  const ws = (n) => { if (LIB_NAME.test(n.name ?? "")) screen.add(n.name); (n.children ?? []).forEach(ws); };
  if (codeTree) wc(codeTree); if (screenTree) ws(screenTree);
  const standIns = standInsOf(html).filter((n) => screen.has(n) || code.has(n));
  const last = (n) => n.split(".").slice(1).join(".");
  let notOnScreen = [...code].filter((n) => !screen.has(n)), notInCode = [...screen].filter((n) => !code.has(n) && !standIns.includes(n));
  const drawnAs = [];
  for (const c of [...notOnScreen]) { const eq = LIB_EQUIV[last(c)]; const s = eq && notInCode.find((x) => last(x) === eq); if (s) drawnAs.push([c, s]); }
  notOnScreen = notOnScreen.filter((c) => !drawnAs.some(([x]) => x === c));
  notInCode = notInCode.filter((s) => !drawnAs.some(([, x]) => x === s));
  return { standIns, drawnAs, notInCode, notOnScreen: kind === "baseline" ? notOnScreen : [] };
}
/** The same as lines for a person (the chat, HANDOFF.md); empty when the screen follows the code. */
export function deviationLines(d, { origin = "the code" } = {}) {
  const list = (a, max = 8) => `${a.slice(0, max).join(", ")}${a.length > max ? ` and ${a.length - max} more` : ""}`;
  return [
    d.standIns.length && `Simulated instead of the real library component (a stand-in under the real name): ${list(d.standIns)}${d.standIns.some((n) => !/^Plus4U5App\./.test(n)) ? " – the real one can be used in the mockup, ask the agent to load it" : ""}.`,
    d.drawnAs.length && `Drawn with an equivalent instead of the real component: ${d.drawnAs.map(([c, s]) => `${c} as ${s}`).join(", ")} – the real one can be used in the mockup.`,
    d.notInCode.length && `Not used by ${origin}: ${list(d.notInCode)} – check that they are meant, not a look-alike of a component the code has.`,
    d.notOnScreen.length && `In ${origin} but not on the screen: ${list(d.notOnScreen)} (hidden states and dialogs are often not drawn).`,
  ].filter(Boolean);
}

/** The task for the agent: build a mockup screen of the existing component, linked to it by the names of its visual components. */
export function screenBrief({ name, file, files, tree, screen, root = "" }) {
  const visual = [], logic = [];
  const w = (n) => { if (n.kind === "existing" && /^[A-Z]/.test(n.name)) (n.role === "visual" ? visual : logic).push(n.name); else if (n.role && n.role !== "visual") logic.push(n.name); (n.children ?? []).forEach(w); };
  w(tree);
  return [
    `START FROM AN EXISTING COMPONENT: build one mockup screen \`${screen}.html\` that shows the component ${name} of the linked repository (\`${file}\`) exactly as it looks and behaves now.`,
    `Read these files of the repository first (read-only): ${files.map((f) => `\`${root ? `${root}/` : ""}${f}\``).join(", ")}. If a screenshot is attached, it shows the component in the real application: match it (layout, texts, colours, states).`,
    `Name the components of the screen exactly like the real visual components (${[...new Set(visual)].join(", ") || name}) and keep their nesting, so that the screen stays linked to the code: the handoff and later changes rely on these names.`,
    `The non-visual parts (${[...new Set(logic)].join(", ") || "providers, hooks, data loading"}) are not built in the mockup: put realistic fake data into ONE component of the screen named ${name}MockData (or one const MOCK_DATA) and pass it down as the real loading would; mark it in a comment as mockup only. Show the important states (loading, empty, error) the code has, switchable if useful.`,
    libraryRule(tree),
    `A plan "${name} (as is)" with the real component tree (including the non-visual parts) has been saved in plans/: do not change it. The tree, read from the code:`,
    "```", asIsOutline(tree), "```",
    "When the screen is done, say in two sentences what it shows and which states can be switched; then list, as Exceptions, every library component of the code you simulated (stand-ins) or drew with another component, and why.",
  ].filter(Boolean).join("\n");
}

/** The baselines of a project: plans made by Start from an Existing Component (front matter `baseline: <file>`), newest first. */
export async function readBaselines(projectDir) {
  const { parsePlan } = await import("../renderer/planDoc.js"), { extractPlan } = await import("../renderer/planTree.js");
  const dir = path.join(projectDir, "plans");
  let names = []; try { names = await fs.promises.readdir(dir); } catch { return []; }
  const out = [];
  for (const n of names.filter((x) => x.endsWith(".md"))) {
    try { const p = parsePlan(await fs.promises.readFile(path.join(dir, n), "utf8")); if (p.meta.baseline) out.push({ slug: n.replace(/\.md$/, ""), title: p.meta.title ?? n, file: p.meta.baseline, created: p.meta.created ?? "", tree: extractPlan(p.body).tree }); } catch { /* unreadable */ }
  }
  return out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

/** The references of a project: the existing components a NEW component is modelled on (front matter `reference: <file>`, `component: <Name>`). */
export async function readReferences(projectDir) {
  const { parsePlan } = await import("../renderer/planDoc.js"), { extractPlan } = await import("../renderer/planTree.js");
  const dir = path.join(projectDir, "plans");
  let names = []; try { names = await fs.promises.readdir(dir); } catch { return []; }
  const out = [];
  for (const n of names.filter((x) => x.endsWith(".md"))) {
    try { const p = parsePlan(await fs.promises.readFile(path.join(dir, n), "utf8")); if (p.meta.reference) out.push({ slug: n.replace(/\.md$/, ""), file: p.meta.reference, component: p.meta.component ?? null, created: p.meta.created ?? "", tree: extractPlan(p.body).tree }); } catch { /* unreadable */ }
  }
  return out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

/** The plan file of a reference: the existing component a new one follows (its structure, style, conventions); nothing in it is built. */
export function referencePlan({ name, refName, file, tree, files, description, date }) {
  return `---
title: ${refName} (reference for ${name})
status: approved
created: ${date}
reference: ${file}
component: ${name}
---
# ${refName} (reference for ${name})

The new component **${name}** follows the existing component \`${file}\` of the linked repository: its decomposition (non-visual parts included), its style and the conventions of the repository. This tree is the reference, read from its code (${files.length} file${files.length === 1 ? "" : "s"}); nothing in it is built.${description ? `\n\nWhat ${name} should do: ${description}` : ""}

\`\`\`uu5-tree
${JSON.stringify(tree, null, 2)}
\`\`\`
`;
}

/** The task for the agent: a mockup screen of a NEW component modelled on an existing one. */
export function referenceBrief({ name, refName, file, files, tree, screen, root = "", description = "" }) {
  return [
    `NEW COMPONENT BASED ON AN EXISTING ONE: build one mockup screen \`${screen}.html\` of the NEW component ${name}${description ? ` – ${description}` : ""}.`,
    `Use the existing component ${refName} of the linked repository (\`${file}\`) as the pattern: read these files first (read-only): ${files.map((f) => `\`${root ? `${root}/` : ""}${f}\``).join(", ")}. Follow its decomposition (where data is loaded, which providers and hooks it uses), its look (spacing, colours, components of the libraries) and the conventions of the repository. If a screenshot is attached, it shows the reference in the real application.`,
    `Name the components of the screen for the new component (${name} and its parts). Where a part of the reference fits as it is, reuse it under its real name (it stays an existing component). The non-visual parts (providers, hooks, data loading) are not built in the mockup: put realistic fake data into ONE component named ${name}MockData and pass it down as the real loading would; mark it as mockup only.`,
    libraryRule(tree, { who: "the reference" }),
    `A plan "${refName} (reference for ${name})" with the reference's real tree has been saved in plans/: do not change it. The reference tree, read from the code:`,
    "```", asIsOutline(tree), "```",
    "When the screen is done, say in two sentences what it shows and what it took from the reference; then list, as Exceptions, every library component of the reference you simulated (stand-ins) or replaced with another one, and why.",
  ].filter(Boolean).join("\n");
}

/** The rules for the agent in a project that redesigns an existing component: plan against the baseline, keep the mockup visual. */
export function referencePrompt(refs, { plan = false } = {}) {
  if (!refs?.length) return "";
  const r = refs[0];
  return [
    `NEW COMPONENT BASED ON AN EXISTING ONE: this project designs the new component ${r.component ?? "(see the plan)"} modelled on ${r.tree?.name ?? "an existing component"} of the linked repository (\`${r.file}\`). plans/${r.slug}.md holds the reference's real decomposition; never edit it. Follow its structure, style and conventions.`,
    plan
      ? `In your plan the uu5-tree is the NEW component's real decomposition: nodes of kind "new" with their "role" (visual, or component = non-visual, provider, context, hook, data = data loading – the non-visual parts are nodes too), shaped like the reference (where data is loaded, which providers and hooks). A part of the reference reused as it is stays a node of kind "existing" with its "source" and "change": "keep".`
      : "The screen shows only the visual components; the non-visual parts (providers, hooks, data loading) are never built in the mockup – their fake data stays in the one MockData component.",
    libraryRule(r.tree, { plan, who: "the reference" }),
    "The reference tree:", "```", asIsOutline(r.tree), "```",
  ].filter(Boolean).join("\n");
}

export function baselinePrompt(baselines, { plan = false } = {}) {
  if (!baselines?.length) return "";
  const rules = (b) => [
    plan
      ? `In your plan the uu5-tree starts FROM THIS BASELINE: copy its nodes with their "kind": "existing", "source" and "role", and give each a "change": "keep" (unchanged), "modify" (say what changes in "note", and give the "props" it should have) or "remove". New parts are nodes with "kind": "new", "change": "add" and their "role" – a new provider, hook or data loading is a node of the tree too (with "role" and a "note" saying what it loads or provides), not only the visual components. Keep the uu5 decomposition: data loading above the view that shows it, providers around what uses them.`
      : "When you change the screen: it shows only the visual components, named exactly like in the baseline (new ones get their own names); the non-visual parts (providers, hooks, data loading) are never built in the mockup – their fake data stays in the one MockData component of the screen.",
    libraryRule(b.tree, { plan }),
  ];
  const on = (b) => (b.screens?.length ? ` – its screen${b.screens.length === 1 ? "" : "s"}: ${b.screens.map((f) => `\`${f}\``).join(", ")}` : "");
  if (baselines.length === 1) {
    const b = baselines[0];
    return [
      `REDESIGN OF AN EXISTING COMPONENT: this project changes ${b.tree?.name ?? "a component"} of the linked repository (\`${b.file}\`)${on(b)}. plans/${b.slug}.md holds its real decomposition AS IT IS NOW (the baseline), including the parts that are not visual (role: component = non-visual component, provider, context, hook, data = data loading). Never edit that plan file.`,
      ...rules(b),
      "The baseline tree:", "```", asIsOutline(b.tree), "```",
    ].filter(Boolean).join("\n");
  }
  // screens of several existing components: each screen follows its own baseline, never another one's
  return [
    `EXISTING COMPONENTS: this project has screens of ${baselines.length} existing components of the linked repository. Each screen belongs to ONE of them and follows only its baseline (its real decomposition AS IT IS NOW, in plans/, with the parts that are not visual: role component = non-visual component, provider, context, hook, data = data loading). Never edit these plan files. When the user talks about a screen, work with the component of that screen.`,
    ...baselines.flatMap((b) => [
      `— ${b.tree?.name ?? "a component"} (\`${b.file}\`, plans/${b.slug}.md)${on(b)}:`,
      ...rules(b),
      "Its baseline tree:", "```", asIsOutline(b.tree), "```",
    ]),
  ].filter(Boolean).join("\n");
}
