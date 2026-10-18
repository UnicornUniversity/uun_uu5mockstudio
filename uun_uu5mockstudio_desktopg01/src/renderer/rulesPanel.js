import { ICON_TRASH, ICON_CODE, ICON_VIEW, ICON_CLOSE } from "./icons.js";
import { markdown, esc } from "./markdown.js";
import { parseRules, editItem, deleteItem, countRules } from "./rulesDoc.js";

const MODE_KEY = "uu5studio.rulesMode";
const readMode = () => { try { return localStorage.getItem(MODE_KEY) === "code" ? "code" : "rendered"; } catch { return "rendered"; } };

/**
 * The business rules (BUSINESS_RULES.md) in a dialog opened from the toolbar icon. Two views of the same file:
 * Rendered (every rule is edited in place and saved at once) and Markdown (free editing, saved with Save / ⌘S).
 * `onCount(n)` tells the toolbar icon how many rules there are, so that it can show a badge while the dialog is closed.
 */
export function createRulesPanel({ api, getScreens, onCount }) {
  let md = "", dirty = false, mode = readMode(), loaded = false;
  const box = document.createElement("div");
  box.id = "rules"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-labelledby="ru-title">
    <div class="ru-head"><h2 id="ru-title">Business rules</h2>
      <button class="rc-toggle icon" type="button"></button><button class="rc-x dlg-x icon" type="button" title="Close (Esc)" aria-label="Close"></button></div>
    <p class="mute">Kept in <code>BUSINESS_RULES.md</code> in the project folder. Claude records rules that come up in your requests; later tasks that build the target components read this file.</p>
    <div class="rc-view"></div>
    <textarea class="rc-code" spellcheck="false" aria-label="BUSINESS_RULES.md"></textarea>
    <div class="rc-add"><input class="rc-new" autocomplete="off" spellcheck="false" placeholder="Add a rule and press Enter…"><select class="rc-screen" aria-label="Section"></select><button class="rc-addbtn" type="button">Add</button></div>
    <p class="rc-err err"></p>
    <div class="row"><span class="rc-meta mute grow"></span><button class="rc-save" type="button">Save</button></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  const view = q(".rc-view"), code = q(".rc-code"), err = q(".rc-err"), meta = q(".rc-meta"), saveBtn = q(".rc-save"), addIn = q(".rc-new"), screenSel = q(".rc-screen");
  const setMeta = (t) => { meta.textContent = t; };

  function paint() {
    const items = parseRules(md), out = [];
    for (let k = 0; k < items.length; k++) {
      const l = items[k];
      if (l.kind === "blank" || l.kind === "h1") continue; // the dialog title says it
      if (l.kind === "h2") out.push(`<h5 class="rc-h2">${esc(l.text)}</h5>`);
      else if (l.kind === "item") out.push(`<div class="rc-item" data-line="${l.i}">${l.id ? `<span class="rc-id">${esc(l.id)}</span>` : `<span class="rc-dot">•</span>`}${l.screen ? `<span class="rc-scr" title="Rule of the screen ${esc(l.screen)}">${esc(l.screen)}</span>` : ""}<span class="rc-text" contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="Rule text">${esc(l.text)}</span><button class="rc-del" type="button" title="Delete this rule" aria-label="Delete this rule">${ICON_TRASH}</button></div>`);
      else if (l.kind === "code") { const t = [l.text]; while (items[k + 1]?.kind === "code") t.push(items[++k].text); out.push(markdown(t.join("\n"))); }
      else out.push(`<div class="rc-p">${markdown(l.text)}</div>`);
    }
    if (!items.some((l) => l.kind === "item")) out.push(`<p class="mute rc-empty">No rules yet. Claude records the rules that come up in your requests, or add one below.</p>`);
    view.innerHTML = out.join("");
  }
  function fill() {
    code.value = md; paint();
    screenSel.replaceChildren(new Option("General", ""), ...getScreens().map((s) => new Option(`Screen: ${s.replace(/\.html$/, "")}`, s.replace(/\.html$/, ""))));
    box.dataset.mode = mode;
    const t = q(".rc-toggle"), toCode = mode === "rendered"; // the icon shows where a click leads
    t.innerHTML = toCode ? ICON_CODE : ICON_VIEW; t.title = toCode ? "Show the Markdown code" : "Show the rendered rules"; t.setAttribute("aria-label", t.title);
    saveBtn.hidden = mode !== "code"; q(".rc-add").hidden = mode !== "rendered";
    onCount?.(countRules(md));
  }
  async function write(next) {
    const r = await api.rulesSet(next);
    if (r?.error) { err.textContent = r.error; return false; }
    err.textContent = ""; md = next; return true;
  }

  // ---- rendered view: one line per edit, saved at once
  async function commitItem(el, revert) {
    const row = el.closest(".rc-item"), i = Number(row.dataset.line), now = parseRules(md)[i];
    if (!now || now.kind !== "item") return;
    const text = el.textContent.replace(/\s+/g, " ").trim();
    if (revert || text === now.text) { el.textContent = now.text; return; }
    if (!text) { el.textContent = now.text; return deleteLine(row); } // clearing a rule removes it, like in any list editor
    if (await write(editItem(md, i, text))) { fill(); setMeta(`Saved${now.id ? ` ${now.id}` : ""}`); }
  }
  async function deleteLine(row) { if (await write(deleteItem(md, Number(row.dataset.line)))) { fill(); setMeta("Rule deleted"); } }
  view.addEventListener("keydown", (e) => {
    const el = e.target.closest?.(".rc-text"); if (!el) return;
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); el.dataset.revert = "1"; el.blur(); }
  });
  view.addEventListener("focusout", (e) => {
    const el = e.target.closest?.(".rc-text"); if (!el) return;
    const revert = el.dataset.revert === "1"; delete el.dataset.revert; commitItem(el, revert);
  });
  view.addEventListener("click", (e) => { const b = e.target.closest(".rc-del"); if (b) deleteLine(b.closest(".rc-item")); });
  view.addEventListener("paste", (e) => { // plain text only, one line
    if (!e.target.closest?.(".rc-text")) return;
    e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData?.getData("text/plain") ?? "").replace(/\s+/g, " "));
  });
  async function addRule() {
    const text = addIn.value.trim(); if (!text) return;
    const r = await api.rulesAdd(text, screenSel.value);
    if (r?.error) { err.textContent = r.error; return; }
    err.textContent = ""; addIn.value = ""; md = r.content; fill(); setMeta(`Added ${r.id}`);
    view.scrollTop = view.scrollHeight;
  }
  addIn.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); addRule(); } };
  q(".rc-addbtn").onclick = addRule;

  // ---- Markdown view: explicit Save
  const markDirty = (v) => { dirty = v; saveBtn.disabled = !v; if (v) setMeta("Unsaved changes"); };
  code.addEventListener("input", () => markDirty(true));
  async function saveCode() {
    if (!dirty) return true;
    if (!(await write(code.value))) return false;
    markDirty(false); setMeta("Saved"); fill(); return true;
  }
  saveBtn.onclick = saveCode;
  async function setMode(next) {
    if (next === mode) return;
    if (mode === "code" && dirty && !(await saveCode())) return; // the two views must show the same text
    mode = next; try { localStorage.setItem(MODE_KEY, mode); } catch { /* not remembered */ }
    fill(); (mode === "code" ? code : addIn).focus();
  }
  q(".rc-toggle").onclick = () => setMode(mode === "rendered" ? "code" : "rendered");

  // ---- open / close
  const isOpen = () => !box.hidden;
  async function reload() {
    if (dirty || (isOpen() && box.contains(document.activeElement) && document.activeElement.matches?.(".rc-text, .rc-code"))) return; // not from under the cursor
    md = (await api.rulesGet()) ?? ""; loaded = true; fill();
  }
  /** `screen`: a screen file name; the dialog opens ready to add a rule of that screen (rendered view, section preselected). */
  async function open({ screen } = {}) {
    err.textContent = ""; setMeta(""); dirty = false; saveBtn.disabled = true;
    if (screen && mode !== "rendered") { mode = "rendered"; try { localStorage.setItem(MODE_KEY, mode); } catch { /* not remembered */ } }
    md = (await api.rulesGet()) ?? ""; loaded = true; fill();
    if (screen) screenSel.value = screen.replace(/\.html$/, "");
    box.hidden = false;
    (mode === "code" ? code : addIn).focus();
  }
  async function close() { if (dirty && !(await saveCode())) return; box.hidden = true; }
  q(".rc-x").innerHTML = ICON_CLOSE; q(".rc-x").onclick = close;
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (e.key === "s" && (e.metaKey || e.ctrlKey) && mode === "code") { e.preventDefault(); saveCode(); }
  });

  return {
    open, close, isOpen, reload,
    /** A project was opened (or none): the dialog closes and the badge follows the new file. */
    async load(hasProject) {
      box.hidden = true; dirty = false; md = "";
      if (!hasProject) { loaded = false; onCount?.(0); return; }
      md = (await api.rulesGet()) ?? ""; loaded = true; onCount?.(countRules(md));
    },
    isLoaded: () => loaded,
  };
}
