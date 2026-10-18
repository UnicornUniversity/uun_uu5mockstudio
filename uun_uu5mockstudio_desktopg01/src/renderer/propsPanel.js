import { iconGlyph, isBmlCode } from "./iconPicker.js";
import { listKind } from "./actionGrammar.js";
import { iconField, ICON_PICK_SVG as ICON_SHAPES } from "./iconField.js";
import { textField } from "./textField.js";
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n; };
const SKIP_ADD = new Set(["children", "elementRef", "elementAttrs", "uu5Tag"]);
const CODE_TYPE = /func|object|array|node|element|ref|\[\]|shape/i;
// props whose values come from uuGds palettes, even when the component has no reference page
const WELL_KNOWN = { colorScheme: { type: "colorScheme" }, borderRadius: { type: "borderRadius" } };
// list props whose items come from a fixed set even when the component has no reference page (Uu5.Utils.NestingLevel.valueList, plus the modal level of ContentContainer)
const WELL_KNOWN_LISTS = { nestingLevelList: ["uve", "route", "areaCollection", "area", "boxCollection", "box", "spotCollection", "spot", "inline", "modal"] };
// A prop that holds an icon: documented as one, or named like one (icon, typeIcon, rightIcon, iconRight, stateIcon ...). Names that only
// mention an icon (iconSize, iconColorScheme, hideIcon ...) and props documented as another type are not icons.
export function isIconProp(name, prop) {
  if (prop?.type === "icon") return true;
  if (prop?.type && /^(bool|number|object|array|func|node|element|ref|\[\]|shape)/i.test(prop.type)) return false;
  return /icon/i.test(name) && !/(size|color|colorscheme|props|style|class|visible|position|gap|margin|align|tooltip|only|count)$/i.test(name) && !/^(hide|show|no|with|has|is|use)[A-Z]/.test(name);
}
/** stateIcon holds a uuBml state (`uubml-state-s02-active`), which has its own palette instead of the uuGDS icon catalog. */
export const isStateIconProp = (name) => /stateicon/i.test(name);
const ICON_LIST = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>`;
const short = (name) => String(name ?? "").replace(/^(Uu5|Plus4U5)[A-Za-z0-9]*\./, "");

/** Which editor a prop gets, from its documentation (type / allowed values) and from how it is written in the file. */
export function kindOf(prop, attr, palettes = {}, name = "") {
  // a list of plain strings (["area", "box"]) whose allowed items are known: a multi choice
  const listOptions = prop?.listEnum ?? WELL_KNOWN_LISTS[name];
  if (attr?.type === "code" && attr.json && listOptions) {
    try { const v = JSON.parse(attr.json); if (Array.isArray(v) && v.every((x) => typeof x === "string")) return { kind: "multi", options: listOptions, value: v }; } catch { /* not plain data */ }
  }
  if (attr?.type === "code") return { kind: "code" };
  const type = prop?.type ?? "";
  if (type === "colorScheme" && palettes.colorScheme) return { kind: "select", options: palettes.colorScheme };
  if (type === "borderRadius" && palettes.borderRadius) return { kind: "select", options: palettes.borderRadius };
  if (prop?.enum) return { kind: "select", options: prop.enum };
  if (type === "bool" || attr?.type === "boolean") return { kind: "bool" };
  if (type === "number" || attr?.type === "number") return { kind: "number" };
  if (type && CODE_TYPE.test(type) && !/string|lsi|unit|icon/.test(type)) return { kind: "code" };
  return { kind: "text" };
}

/** A sensible first value for a prop that is being added. */
export function defaultFor(prop, palettes = {}) {
  const { kind, options } = kindOf(prop, null, palettes);
  const def = prop?.default;
  if (kind === "select") { const flat = Array.isArray(options) ? options : Object.values(options).flat(); return { type: "string", value: def && flat.includes(def) ? def : flat[0] }; }
  if (kind === "bool") return { type: "boolean", value: def ? def === "true" : true };
  if (kind === "number") return { type: "number", value: Number.isFinite(Number(def)) && def != null ? Number(def) : 0 };
  if (kind === "code") {
    const t = prop?.type ?? "";
    return { type: "code", value: /func/.test(t) ? "() => {}" : /\[\]|array/.test(t) ? "[]" : /object|shape/.test(t) ? "{}" : "null" };
  }
  return { type: "string", value: def && !/^(undefined|false|true)$/.test(def) ? def : "" };
}

/** Data -> JavaScript literal in the style people write by hand: unquoted keys, short values on one line, longer ones indented. */
export function toLiteral(v, pad = "") {
  const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  const entries = Array.isArray(v) ? null : Object.entries(v);
  const inline = entries ? (entries.length ? `{ ${entries.map(([k, x]) => `${key(k)}: ${toLiteral(x)}`).join(", ")} }` : "{}") : `[${v.map((x) => toLiteral(x)).join(", ")}]`;
  if (inline.length <= 70 && !inline.includes("\n")) return inline;
  const next = pad + "  ";
  return entries ? `{\n${entries.map(([k, x]) => `${next}${key(k)}: ${toLiteral(x, next)}`).join(",\n")},\n${pad}}` : `[\n${v.map((x) => `${next}${toLiteral(x, next)}`).join(",\n")},\n${pad}]`;
}

/**
 * Inspector side panel for one picked uu5 component (or one item of a list prop such as ActionGroup.itemList): its name and the
 * components it is nested in, the props written in the file as editable controls, and the other props it supports.
 * Editing writes to the HTML file through `api`.
 */
export function createPropsPanel({ api, onUse }) {
  let pick = null, info = null, ordinals = [], level = 0, useSub = false;
  const root = $("insp-comp");

  const sub = () => (level === 0 && useSub ? pick.sub : null);
  const palettes = () => pick?.palettes ?? {};
  const docProp = (name) => info?.doc?.props.find((p) => p.name === name) ?? null;
  const runtimeOf = (name) => (level !== 0 ? undefined : useSub || !pick.sub ? pick.runtime?.[name] : pick.ownerRuntime?.[name]);

  async function commit(call) {
    $("insp-err").textContent = "";
    const r = await call();
    if (r?.error) { $("insp-err").textContent = r.error; render(); return false; }
    info = r; render(); return true;
  }
  const setProp = (name, v) => commit(() => api.set(pick.file, ordinals, name, v.type, v.value, sub()));
  const removeProp = (name) => commit(() => api.remove(pick.file, ordinals, name, sub()));

  // ----- editing an object / array / expression in a window (JSON when the value is plain data, otherwise JavaScript)
  const jb = { box: $("jsonbox"), text: $("jb-text"), err: $("jb-err"), mode: $("jb-mode"), title: $("jb-title") };
  let jbMode = "js", jbName = null, jbRef = false;
  const closeJson = () => { jb.box.hidden = true; jbName = null; };
  function openJson(name, attr) {
    // `itemList={ROUTE_ACTION}`: the window shows (and saves) the value of the constant the prop refers to
    jbName = name; jbRef = Boolean(attr.ref);
    const src = attr.ref ?? attr;
    jbMode = src.json !== undefined ? "json" : "js";
    jb.title.textContent = jbRef ? `Edit ${attr.ref.name}` : `Edit ${name}`;
    jb.mode.textContent = (jbRef ? `The constant ${attr.ref.name} is used by the prop ${name}; changing it changes every place that uses it. ` : "") +
      (jbMode === "json" ? "JSON — plain data. Saved back into the file as a JavaScript literal." : "JavaScript expression — it contains code (functions, variables), so it is edited as written in the file.");
    jb.text.value = jbMode === "json" ? src.json : src.code ?? String(src.value ?? "");
    jb.err.textContent = ""; $("jb-format").hidden = jbMode !== "json"; jb.box.hidden = false; jb.text.focus();
  }
  async function saveJson() {
    let code = jb.text.value;
    if (jbMode === "json") {
      try { code = toLiteral(JSON.parse(code)); }
      catch (e) { jb.err.textContent = `Invalid JSON: ${e.message}`; return; }
    }
    $("insp-err").textContent = "";
    const r = await api.set(pick.file, ordinals, jbName, jbRef ? "ref" : "code", code, sub());
    if (r?.error) { jb.err.textContent = r.error; return; } // the window stays open so nothing typed is lost
    closeJson(); info = r; render();
  }
  $("jb-cancel").onclick = closeJson;
  $("jb-ok").onclick = saveJson;
  $("jb-format").onclick = () => { try { jb.text.value = JSON.stringify(JSON.parse(jb.text.value), null, 2); jb.err.textContent = ""; } catch (e) { jb.err.textContent = `Invalid JSON: ${e.message}`; } };
  jb.box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeJson(); } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveJson(); } });

  /** A prop with a fixed set of values that is computed in code (`colorScheme={ok ? "positive" : "negative"}`, `colorScheme={cs}`): show the value it has now. */
  function computedControl(name, attr, base, runtime) {
    const flat = base.kind === "bool" ? ["true", "false"] : Array.isArray(base.options) ? base.options : Object.values(base.options).flat();
    const expr = attr.ref ? `${attr.ref.name} = ${attr.ref.code}` : attr.code;
    const now = runtime === undefined ? "computed" : String(runtime);
    const input = el("select", { className: "computed", title: `Computed in code: ${expr.replace(/\s+/g, " ")}\nShown: the value it has right now. Picking a value replaces the expression with that value.` });
    input.append(el("option", { value: "__expr__", textContent: `ƒ ${now}` }));
    if (runtime !== undefined && !flat.includes(String(runtime))) input.append(el("option", { value: String(runtime), textContent: String(runtime) }));
    if (Array.isArray(base.options) || base.kind === "bool") for (const o of flat) input.append(el("option", { value: o, textContent: o }));
    else for (const [group, list] of Object.entries(base.options)) input.append(el("optgroup", { label: group }, ...list.map((o) => el("option", { value: o, textContent: o }))));
    input.value = "__expr__";
    input.onchange = () => { if (input.value === "__expr__") return; setProp(name, base.kind === "bool" ? { type: "boolean", value: input.value === "true" } : { type: "string", value: input.value }); };
    const edit = el("button", { type: "button", className: "pedit" + (attr.ref ? " ref" : ""), title: attr.ref ? `Edit the constant ${attr.ref.name} in a window` : `Edit the expression of ${name} in a window`, textContent: "{…}", onclick: () => openJson(name, attr) });
    return el("div", { className: "pcode" }, input, edit);
  }

  /** A list of plain strings with known allowed items: a button that shows what is chosen and opens a list of check boxes; the choice is written when the list closes. */
  function multiControl(name, options, chosen) {
    const all = [...options, ...chosen.filter((v) => !options.includes(v))]; // a value that is in the file but not in the documentation stays visible
    const btn = el("button", { type: "button", className: "pmulti", title: `${name}: ${chosen.join(", ") || "nothing chosen"}` });
    btn.append(...(chosen.length ? chosen.map((v) => el("span", { className: "pm-chip", textContent: v })) : [el("span", { className: "mute", textContent: "none" })]), el("span", { className: "pm-caret", textContent: "▾" }));
    btn.onclick = (e) => {
      e.stopPropagation();
      const pop = el("div", { className: "pm-pop", role: "listbox" }), boxes = new Map();
      for (const v of all) { const cb = el("input", { type: "checkbox", checked: chosen.includes(v) }); boxes.set(v, cb); pop.append(el("label", {}, cb, el("span", { textContent: v }))); }
      const r = btn.getBoundingClientRect();
      Object.assign(pop.style, { left: Math.max(8, Math.min(r.left, innerWidth - 230)) + "px", top: Math.min(r.bottom + 4, innerHeight - 40 - all.length * 28) + "px" });
      document.body.append(pop);
      const close = () => {
        pop.remove(); removeEventListener("mousedown", away, true); removeEventListener("keydown", key, true);
        const next = all.filter((v) => boxes.get(v).checked);
        if (next.join("\n") !== chosen.join("\n")) setProp(name, { type: "code", value: toLiteral(next) });
      };
      const away = (ev) => { if (!pop.contains(ev.target)) close(); };
      const key = (ev) => { if (ev.key === "Escape" || ev.key === "Enter") { ev.stopPropagation(); ev.preventDefault(); close(); } };
      addEventListener("mousedown", away, true); addEventListener("keydown", key, true);
      boxes.values().next().value?.focus();
    };
    return btn;
  }

  /**
   * A text that is a literal somewhere in the file (a string, an LSI, a constant, `t("Ano", "Yes")`, `ph.title` of useLsi): the text itself,
   * with a switch of the languages for an LSI; editing changes it where it is written (the prop keeps referring to it).
   */
  function textControl(name, attr, runtime) {
    const scope = sub() ? { item: { prop: sub().prop, index: sub().index }, name } : { attr: name };
    const field = textField({
      resolved: attr.resolved, runtime, onLang: render,
      onText: async (lang, value) => {
        $("insp-err").textContent = "";
        const r = await api.setText(pick.file, ordinals, scope, lang, value);
        if (r?.error) { $("insp-err").textContent = r.error; return render(); }
        await load();
      },
    });
    const edit = el("button", { type: "button", className: "pedit", title: `Edit the expression of ${name} in a window (to point the prop somewhere else)`, textContent: "{…}", onclick: () => openJson(name, attr) });
    return el("div", { className: "pcode plinked" }, field, edit);
  }

  function control(name, attr) {
    const prop = docProp(name) ?? WELL_KNOWN[name] ?? null, { kind, options, value: multiValue } = kindOf(prop, attr, palettes(), name);
    const runtime = runtimeOf(name);
    if (kind === "multi") return multiControl(name, options, multiValue);
    if (attr?.resolved && attr.type === "code") return textControl(name, attr, runtime);
    if (attr?.type === "code") {
      const base = kindOf(prop, { ...attr, type: "string" }, palettes());
      if (base.kind === "select" || base.kind === "bool") return computedControl(name, attr, base, runtime);
    }
    let input;
    if (kind === "select") {
      input = el("select");
      const flat = Array.isArray(options) ? options : Object.values(options).flat();
      const cur = attr?.type === "string" ? attr.value : null;
      if (cur != null && !flat.includes(cur)) input.append(el("option", { value: cur, textContent: cur }));
      if (Array.isArray(options)) for (const o of options) input.append(el("option", { value: o, textContent: o }));
      else for (const [group, list] of Object.entries(options)) input.append(el("optgroup", { label: group }, ...list.map((o) => el("option", { value: o, textContent: o }))));
      input.value = cur ?? flat[0];
      input.onchange = () => setProp(name, { type: "string", value: input.value });
    } else if (kind === "bool") {
      input = el("input", { type: "checkbox", checked: attr ? attr.value === true : false });
      input.onchange = () => setProp(name, { type: "boolean", value: input.checked });
    } else if (kind === "number") {
      input = el("input", { type: "number", value: attr?.type === "number" ? String(attr.value) : "", step: "any" });
      input.onchange = () => (input.value === "" ? removeProp(name) : setProp(name, { type: "number", value: Number(input.value) }));
    } else if (kind === "code") {
      const oneLine = (attr?.code ?? String(attr?.value ?? "")).replace(/\s+/g, " ");
      input = el("input", { type: "text", className: "code", value: oneLine, spellcheck: false, readOnly: /[{[]/.test(oneLine) && oneLine.length > 40, title: attr?.ref ? `Refers to the constant ${attr.ref.name} — {…} edits its value` : runtime != null ? `Current value: ${runtime}` : "A JavaScript expression" });
      input.onchange = () => setProp(name, { type: "code", value: input.value });
    } else {
      input = el("input", { type: "text", value: attr?.value == null ? "" : String(attr.value), spellcheck: false });
      input.onchange = () => setProp(name, { type: "string", value: input.value });
    }
    input.onkeydown = (e) => { if (e.key === "Enter" && input.tagName === "INPUT" && input.type !== "checkbox") input.blur(); };
    if (kind === "text" && isIconProp(name, prop) && api.pickIcon) {
      // icon props: choose from the catalog (the same control as in the dialog of the actions)
      const state = isStateIconProp(name), cur = attr?.type === "string" && attr.value ? attr.value : null;
      return iconField({
        value: cur, glyphs: Boolean(pick.assets?.gdsBase), title: state ? "Choose a state (uuBml)" : "Choose an icon (uuGDS or uuBml)",
        onText: (v) => (v ? setProp(name, { type: "string", value: v }) : removeProp(name)),
        onPick: () => api.pickIcon({ current: cur, text: pick.text, base: pick.assets?.gdsBase ?? null, mode: state ? "state" : "icon" }),
      }).row;
    }
    if (kind !== "code") return input;
    // objects, arrays, functions: a button opens the full value in a window
    const edit = el("button", { type: "button", className: "pedit" + (attr?.ref ? " ref" : ""), title: attr?.ref ? `Edit the constant ${attr.ref.name} in a window` : `Edit ${name} in a window`, textContent: "{…}", onclick: () => openJson(name, attr) });
    // a list of actions written out in the file: not its code, but a button that opens the whole list in a window (the code stays behind {…})
    if (attr?.listed && api.editList && listKind(name, info.element.name)) {
      const n = attr.count ?? 0;
      const open = el("button", { type: "button", className: "plist", title: "Edit the list of actions in a window", onclick: () => api.editList({ file: pick.file, ordinals, prop: name, componentName: info.element.name, palettes: palettes(), assets: pick.assets }) },
        el("span", { className: "pl-ico", innerHTML: ICON_LIST }), el("span", { textContent: `${n} action${n === 1 ? "" : "s"}` }));
      return el("div", { className: "pcode" }, open, edit);
    }
    return el("div", { className: "pcode" }, input, edit);
  }

  // ----- a value that depends on a condition (`icon={open ? "a" : "b"}`): one row per possible value, the active one marked
  const setBranchValue = (name, idx, v) => commit(() => api.setBranch(pick.file, ordinals, name, idx, v.type, v.value, sub()));
  function branchControl(name, prop, b, idx) {
    if (!b.editable) return el("code", { className: "pb-fixed", textContent: b.value, title: "Computed in code — change it in the chat or in the file" });
    if (isIconProp(name, prop) && b.type === "string") {
      const state = isStateIconProp(name);
      const pickBtn = el("button", { type: "button", className: "pedit pico", title: state ? "Choose a state (uuBml)" : "Choose an icon (uuGDS or uuBml)", innerHTML: ICON_SHAPES, onclick: async () => {
        const v = await api.pickIcon?.({ current: b.value, text: pick.text, base: pick.assets?.gdsBase ?? null, mode: state ? "state" : "icon" });
        if (v) setBranchValue(name, idx, { type: "string", value: v });
      } });
      return el("div", { className: "pcode" }, pick.assets?.gdsBase || isBmlCode(b.value) ? iconGlyph(b.value) : null, el("code", { className: "pb-val", textContent: b.value }), pickBtn);
    }
    const base = kindOf(prop, { type: b.type }, palettes());
    if (base.kind === "select" || b.type === "boolean") {
      const flat = b.type === "boolean" ? ["true", "false"] : Array.isArray(base.options) ? base.options : Object.values(base.options).flat();
      const sel = el("select");
      if (!flat.includes(String(b.value))) sel.append(el("option", { value: String(b.value), textContent: String(b.value) }));
      if (Array.isArray(base.options) || b.type === "boolean") for (const o of flat) sel.append(el("option", { value: o, textContent: o }));
      else for (const [group, list] of Object.entries(base.options)) sel.append(el("optgroup", { label: group }, ...list.map((o) => el("option", { value: o, textContent: o }))));
      sel.value = String(b.value);
      sel.onchange = () => setBranchValue(name, idx, b.type === "boolean" ? { type: "boolean", value: sel.value === "true" } : { type: "string", value: sel.value });
      return sel;
    }
    const input = el("input", { type: b.type === "number" ? "number" : "text", value: b.value == null ? "" : String(b.value), spellcheck: false, step: "any" });
    input.onchange = () => setBranchValue(name, idx, b.type === "number" ? { type: "number", value: Number(input.value) } : { type: "string", value: input.value });
    input.onkeydown = (e) => { if (e.key === "Enter") input.blur(); };
    return input;
  }
  function branchBlock(name, attr, prop) {
    const now = runtimeOf(name);
    const rows = attr.branches.map((b, idx) => {
      const active = now !== undefined && String(now) === String(b.value);
      return el("div", { className: "pbranch" + (active ? " active" : "") },
        el("span", { className: "pb-dot", title: active ? "This value is used right now" : "" }),
        el("code", { className: "pb-cond", textContent: b.label, title: `When: ${b.label}` }),
        branchControl(name, prop, b, idx));
    });
    return el("div", { className: "pbranches" }, el("div", { className: "pb-title mute", textContent: "The value depends on a condition:" }), ...rows);
  }

  function addOptions() {
    const have = new Set(info.element.attrs.map((a) => a.name));
    const names = new Map();
    for (const p of info.doc?.props ?? []) names.set(p.name, p);
    if (level === 0) for (const n of (useSub || !pick.sub ? pick.propNames : pick.ownerPropNames) ?? []) if (!names.has(n)) names.set(n, null);
    return [...names.entries()].filter(([n]) => !have.has(n) && !SKIP_ADD.has(n)).sort((a, b) => (b[1]?.required - a[1]?.required) || a[0].localeCompare(b[0]));
  }

  function render() {
    if (!pick || !info) return;
    root.hidden = false; $("insp-hint").hidden = true;
    const names = pick.fullNames ?? info.chain.map((c) => c.name).filter(Boolean); // nearest first
    // breadcrumb: outermost › … › component › item; a click selects that one instead
    const crumbs = $("insp-crumbs"); crumbs.replaceChildren();
    const add = (label, title, on, onclick) => { if (crumbs.childElementCount) crumbs.append(el("span", { className: "sep", textContent: "›" })); crumbs.append(el("button", { type: "button", className: on ? "on" : "", textContent: label, title, onclick: () => !on && onclick() })); };
    names.slice().reverse().forEach((n, i, arr) => { const idx = arr.length - 1 - i; add(short(n), n, idx === level && !(idx === 0 && useSub), () => selectLevel(idx, false)); });
    if (pick.sub) add(`${short(pick.sub.name) || "item"} · ${pick.sub.prop}[${pick.sub.index + 1}]`, `Item ${pick.sub.index + 1} of ${pick.sub.prop}`, level === 0 && useSub, () => selectLevel(0, true));
    $("insp-name").textContent = info.element.name;
    const subLine = info.element.item ? `Item ${info.element.item.index + 1} of ${info.element.item.prop} in ${names[0]}` : "";
    $("insp-text").textContent = subLine || (level === 0 && pick.text ? `“${pick.text}”` : "");
    const d = info.doc;
    $("insp-desc").replaceChildren(d ? el("span", { textContent: d.description }) : el("span", { className: "mute", textContent: info.docsAvailable ? "No reference found for this component." : "Install the uu5-development plugin in Claude Code to see the component reference and every available prop." }),
      d?.url ? el("a", { href: d.url, textContent: " Docs", onclick: (e) => { e.preventDefault(); api.openExternal(d.url); } }) : null); // opens in the system browser
    const props = $("insp-props"); props.replaceChildren();
    const attrs = info.element.attrs;
    if (pick.assets?.gdsBase && attrs.some((a) => isIconProp(a.name, docProp(a.name)) && !isStateIconProp(a.name))) api.ensureIconFonts?.(pick.assets.gdsBase); // glyph previews
    if (attrs.some((a) => isStateIconProp(a.name) || isBmlCode(a.value))) api.ensureBmlFonts?.(); // uuBml icons and states come from the uuBml icon font
    for (const a of attrs) {
      const doc = docProp(a.name);
      const label = el("label", { title: [doc?.type, doc?.description].filter(Boolean).join(" — ") || a.name }, el("span", { className: "pname", textContent: a.name }));
      const rm = el("button", { type: "button", className: "prm", title: `Remove ${a.name}`, textContent: "✕", onclick: () => removeProp(a.name) });
      const row = el("div", { className: "prow" }, label, control(a.name, a), rm);
      if (doc?.default) row.title = `Default: ${doc.default}`;
      props.append(row);
      if (a.branches?.length > 1) props.append(branchBlock(a.name, a, docProp(a.name) ?? WELL_KNOWN[a.name] ?? null));
    }
    if (!attrs.length) props.append(el("p", { className: "mute", textContent: "No props are set here." }));
    if (info.element.spread) props.append(el("p", { className: "mute", textContent: "More props are passed through {...spread}." }));
    const addSel = $("insp-add"); addSel.replaceChildren(el("option", { value: "", textContent: "Add prop…" }));
    for (const [n, p] of addOptions()) addSel.append(el("option", { value: n, textContent: `${n}${p?.type ? ` — ${p.type}` : ""}${p?.required ? " *" : ""}`, title: p?.description ?? "" }));
    addSel.value = "";
  }

  async function load() {
    const r = await api.inspect(pick.file, ordinals, sub());
    if (r?.error) { $("insp-err").textContent = r.error; return false; }
    info = r; $("insp-err").textContent = ""; render(); return true;
  }
  async function selectLevel(i, item) { level = i; useSub = item; ordinals = pick.chainOrdinals.slice(i); await load(); }

  $("insp-add").onchange = (e) => {
    const name = e.target.value; if (!name) return;
    setProp(name, defaultFor(docProp(name), palettes()));
  };
  $("insp-use").onclick = () => pick && info && onUse({ ...pick, chain: info.chain, element: info.element, sub: info.element.item ? pick.sub : null });

  return {
    async show(p) {
      pick = { ...p, chainOrdinals: p.chain }; level = 0; useSub = Boolean(p.sub); ordinals = p.chain; info = null;
      const names = () => { pick.fullNames = info.chain.map((c) => c.name).filter(Boolean); render(); };
      if (await load()) names();
      else if (p.sub) { // the list is built in code (not written out in the JSX): show the component itself
        const why = $("insp-err").textContent;
        pick.sub = null; useSub = false;
        if (await load()) { names(); $("insp-err").textContent = why; }
      }
    },
    /** The file changed on disk: re-read the same component, or clear the panel when it is gone. */
    async refresh(file) {
      if (!pick || pick.file !== file) return;
      const name = info?.element.name, r = await api.inspect(pick.file, ordinals, sub());
      if (r?.error || r.element.name !== name) return this.clear();
      info = r; render();
    },
    clear() { pick = null; info = null; closeJson(); root.hidden = true; $("insp-hint").hidden = false; },
    get file() { return pick?.file ?? null; },
  };
}
