import { iconGlyph } from "./iconPicker.js";
import { iconField } from "./iconField.js";
import { textField } from "./textField.js";
import { actionFields, itemLabel, itemTags, newAction, isComponentItem, COLLAPSED_OPTIONS } from "./actionGrammar.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n; };

/**
 * The editor of a list of actions (`actionList`, `itemList` of ActionGroup, …): the actions on the left, the form of the chosen one on the
 * right, built from the grammar of an action. Every change is written to the HTML file at once (through `api`), like in the inspector.
 * `api`: list(file, ordinals, prop), item(file, ordinals, prop, op), set(file, ordinals, name, type, value, sub), remove(file, ordinals, name, sub),
 * buttonDoc() -> the reference of Uu5Elements.Button, pickIcon(opts), ensureIconFonts(base).
 */
export function createActionListEditor({ api }) {
  const box = $("actbox"), listEl = $("ae-list"), formEl = $("ae-form"), errEl = $("ae-err"), titleEl = $("ae-title");
  let ctx = null, data = null, sel = 0, fields = [], doc = null;

  const sub = (index) => ({ prop: ctx.prop, index, count: null });
  const close = () => { box.hidden = true; ctx = null; };
  const fail = (r) => { errEl.textContent = r?.error ?? ""; return Boolean(r?.error); };

  async function reload(select) {
    const r = await api.list(ctx.file, ctx.ordinals, ctx.prop);
    if (fail(r)) { if (!data) close(); return; }
    data = r;
    sel = Math.max(0, Math.min(select ?? sel, data.items.length - 1));
    paint();
  }
  async function op(o, select) {
    errEl.textContent = "";
    const r = await api.item(ctx.file, ctx.ordinals, ctx.prop, o);
    if (fail(r)) return;
    data = r; sel = Math.max(0, Math.min(select ?? sel, data.items.length - 1)); paint();
  }
  async function change(name, type, value) {
    errEl.textContent = "";
    const r = type === null ? await api.remove(ctx.file, ctx.ordinals, name, sub(sel)) : await api.set(ctx.file, ctx.ordinals, name, type, value, sub(sel));
    if (fail(r)) return paint(); // the form shows the file again, so nothing typed is believed to be saved
    await reload();
  }

  // ----- the list
  function paintList() {
    listEl.replaceChildren(...(data.items.length ? data.items.map((it, i) => {
      const icon = it.attrs?.find((a) => a.name === "icon" && a.type === "string")?.value;
      const row = el("button", { type: "button", className: "ae-item" + (i === sel ? " on" : ""), onclick: () => { sel = i; paint(); } });
      row.append(el("span", { className: "ae-ico" }, icon && (ctx.assets?.gdsBase || /^uubml-/.test(icon)) ? iconGlyph(icon) : null),
        el("span", { className: "ae-txt" }, el("b", { textContent: itemLabel(it) }), el("small", { textContent: itemTags(it).join(" · ") })));
      return row;
    }) : [el("p", { className: "mute ae-empty", textContent: "No actions yet." })]));
    const n = data.items.length;
    $("ae-dup").disabled = $("ae-del").disabled = !n;
    $("ae-up").disabled = !n || sel === 0; $("ae-down").disabled = !n || sel >= n - 1;
    $("ae-count").textContent = `${n} action${n === 1 ? "" : "s"}`;
  }

  // ----- the form of the chosen action
  const attrOf = (it, name) => it.attrs.find((a) => a.name === name);
  function field(f, it) {
    const a = attrOf(it, f.name), isCode = a?.type === "code", shown = a == null ? "" : isCode ? (a.code ?? String(a.value)).replace(/\s+/g, " ") : String(a.value);
    let input;
    if (f.kind === "select") {
      input = el("select", {}, el("option", { value: "", textContent: "(not set)" }));
      const opts = Array.isArray(f.options) ? f.options : [];
      if (shown && !isCode && !opts.includes(shown)) input.append(el("option", { value: shown, textContent: shown }));
      for (const o of opts) input.append(el("option", { value: o, textContent: o }));
      if (isCode) input.append(el("option", { value: "__code__", textContent: `ƒ ${shown.slice(0, 30)}` }));
      input.value = isCode ? "__code__" : shown;
      input.onchange = () => (input.value === "__code__" ? null : input.value ? change(f.name, "string", input.value) : change(f.name, null));
    } else if (f.kind === "collapsed") {
      const cur = isCode ? "__code__" : a?.type === "boolean" ? (a.value ? "always" : "never") : shown;
      input = el("select", {}, ...COLLAPSED_OPTIONS.map(([v, label]) => el("option", { value: v, textContent: label })));
      if (isCode) input.append(el("option", { value: "__code__", textContent: `ƒ ${shown.slice(0, 30)}` }));
      input.value = cur;
      input.onchange = () => (input.value === "__code__" ? null : input.value ? change(f.name, "string", input.value) : change(f.name, null));
    } else if (f.kind === "bool") {
      if (isCode) input = el("input", { type: "text", className: "code", value: shown, spellcheck: false, onchange: () => change(f.name, "code", input.value) });
      else { input = el("input", { type: "checkbox", checked: a?.value === true }); input.onchange = () => (input.checked ? change(f.name, "boolean", true) : change(f.name, null)); }
    } else if (f.kind === "number") {
      input = el("input", { type: "number", step: "any", value: a?.type === "number" ? String(a.value) : "", onchange: () => (input.value === "" ? change(f.name, null) : change(f.name, "number", Number(input.value))) });
    } else if (f.kind === "icon") {
      const cur = a?.type === "string" && a.value ? a.value : null;
      const ic = iconField({
        value: cur, glyphs: Boolean(ctx.assets?.gdsBase),
        onText: (v) => (v ? change(f.name, "string", v) : change(f.name, null)),
        onPick: () => api.pickIcon({ current: cur, text: itemLabel(it), base: ctx.assets?.gdsBase ?? null, mode: "icon" }),
      });
      input = ic.row;
    } else if (f.kind === "submenu") {
      let n = null; try { const v = JSON.parse(a?.json ?? "null"); if (Array.isArray(v)) n = v.length; } catch { /* code */ }
      input = el("input", { type: "text", className: "code", readOnly: true, value: a ? (n != null ? `${n} item${n === 1 ? "" : "s"}` : shown) : "(none)", title: "A submenu is edited as code in the {…} window of the inspector or in the chat." });
    } else if (a?.resolved && (f.kind === "text" || isCode)) { // a text that is an LSI, a constant or a helper call: the texts themselves, a switch of the languages
      input = textField({
        resolved: a.resolved, onLang: paint,
        onText: async (lang, value) => {
          errEl.textContent = "";
          const r = await api.setText(ctx.file, ctx.ordinals, { item: { prop: ctx.prop, index: sel }, name: f.name }, lang, value);
          if (fail(r)) return paint();
          await reload();
        },
      });
    } else { // text and code
      const asCode = f.kind === "code" || isCode;
      input = el("input", { type: "text", className: asCode ? "code" : "", value: shown, spellcheck: false });
      input.onchange = () => { const v = input.value; if (!v.trim()) return change(f.name, null); return asCode ? change(f.name, "code", v) : change(f.name, "string", v); };
    }
    if (input.tagName === "INPUT") input.onkeydown = (e) => { if (e.key === "Enter" && input.type !== "checkbox") input.blur(); };
    const row = input;
    const label = el("label", { className: "ae-field", title: f.hint ?? "" }, el("span", { textContent: f.label }), row);
    if (a && f.kind !== "submenu") label.append(el("button", { type: "button", className: "prm", title: `Remove ${f.name}`, textContent: "✕", onclick: () => change(f.name, null) }));
    return label;
  }
  /** The whole item as code: for an item that is a component, or that is not an object, and as the way to edit anything the form does not cover. */
  function sourceEditor(it, note) {
    const ta = el("textarea", { className: "ae-src", spellcheck: false, value: it.text, rows: 12 });
    const apply = el("button", { type: "button", textContent: "Apply the code", onclick: () => op({ type: "replace", index: sel, text: ta.value }) });
    return el("div", { className: "ae-srcbox" }, el("h5", { textContent: "Code of the item" }), note ? el("p", { className: "mute", textContent: note }) : null, ta, el("div", { className: "ae-srcrow" }, apply));
  }
  function paintForm() {
    formEl.replaceChildren();
    const it = data.items[sel];
    if (!it) return void formEl.append(el("p", { className: "mute", textContent: "Add an action to start." }));
    if (it.kind !== "object") return void formEl.append(sourceEditor(it, `This item is not written out as an object in the file (${itemLabel(it)}), so it is edited as code.`));
    if (isComponentItem(it)) return void formEl.append(sourceEditor(it, "This item is a component (the prop component), not a button, so it has no text, icon or click handler of its own. Edit it as code."));
    const known = new Set(fields.map((f) => f.name));
    formEl.append(...fields.filter((f) => f.kind !== "submenu" || attrOf(it, f.name)).map((f) => field(f, it)));
    const more = it.attrs.filter((a) => !known.has(a.name));
    if (more.length) {
      formEl.append(el("h5", { textContent: "Other properties" }));
      for (const a of more) formEl.append(field({ name: a.name, label: a.name, kind: a.type === "number" ? "number" : a.type === "boolean" ? "bool" : a.type === "string" ? "text" : "code", hint: "" }, it));
    }
    if (it.spread) formEl.append(el("p", { className: "mute", textContent: "More properties are passed through {...spread}." }));
    formEl.append(el("details", { className: "ae-more" }, el("summary", { textContent: "Edit the whole item as code" }), sourceEditor(it, "")));
  }
  function paint() { paintList(); paintForm(); }

  // ----- toolbar
  $("ae-add").onclick = () => op({ type: "add", props: newAction(), at: data.items.length ? sel + 1 : undefined }, data.items.length ? sel + 1 : 0);
  $("ae-dup").onclick = () => op({ type: "duplicate", index: sel }, sel + 1);
  $("ae-del").onclick = () => op({ type: "remove", index: sel }, Math.max(0, sel - 1));
  $("ae-up").onclick = () => op({ type: "move", from: sel, to: sel - 1 }, sel - 1);
  $("ae-down").onclick = () => op({ type: "move", from: sel, to: sel + 1 }, sel + 1);
  $("ae-x").onclick = close;
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  return {
    /** `o` = { file, ordinals, prop, componentName, palettes, assets }. */
    async open(o) {
      ctx = o; data = null; sel = 0; errEl.textContent = "";
      titleEl.textContent = `${o.prop} of ${String(o.componentName ?? "").replace(/^(Uu5|Plus4U5)[A-Za-z0-9]*\./, "") || "the component"}`;
      doc ??= await api.buttonDoc?.().catch(() => null);
      fields = actionFields(doc, o.palettes ?? {});
      if (o.assets?.gdsBase) api.ensureIconFonts?.(o.assets.gdsBase);
      listEl.replaceChildren(); formEl.replaceChildren();
      box.hidden = false;
      await reload(0);
    },
    close, isOpen: () => !box.hidden,
  };
}
