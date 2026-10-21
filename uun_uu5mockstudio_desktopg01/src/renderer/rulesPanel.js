import { ICON_TRASH, ICON_CODE, ICON_VIEW, ICON_CLOSE } from "./icons.js";
import { markdown, esc } from "./markdown.js";
import { parseRules, editItem, deleteItem, countRules } from "./rulesDoc.js";

const MODE_KEY = "uu5studio.rulesMode";
const SCOPE_KEY = "uu5studio.rulesScope";
const FOLD_KEY = "uu5studio.rulesCollapsed";
const readFolded = () => { try { const a = JSON.parse(localStorage.getItem(FOLD_KEY)); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); } };
const readScope = () => { try { return localStorage.getItem(SCOPE_KEY) === "global" ? "global" : "project"; } catch { return "project"; } };
const readMode = () => { try { return localStorage.getItem(MODE_KEY) === "code" ? "code" : "rendered"; } catch { return "rendered"; } };

/**
 * The business rules (BUSINESS_RULES.md) in a dialog opened from the toolbar icon. Two views of the same file:
 * Rendered (every rule is edited in place and saved at once) and Markdown (free editing, saved with Save / ⌘S).
 * `onCount(n)` tells the toolbar icon how many rules there are, so that it can show a badge while the dialog is closed.
 */
export function createRulesPanel({ api, getScreens, onCount }) {
  let md = "", dirty = false, mode = readMode(), loaded = false, scope = readScope(), globalCount = 0, projectCount = 0, folded = readFolded(); // folded: the sections (General, Screen: x) the user rolled up, as "scope|heading"
  // the rules of this project (BUSINESS_RULES.md) or of all projects (GLOBAL_RULES.md): the same dialog works on either
  const S = () => (scope === "global"
    ? { get: () => api.rulesGetGlobal(), set: (t) => api.rulesSetGlobal(t), add: (t) => api.rulesAddGlobal(t) }
    : { get: () => api.rulesGet(), set: (t) => api.rulesSet(t), add: (t, s) => api.rulesAdd(t, s) });
  const box = document.createElement("div");
  box.id = "rules"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-labelledby="ru-title">
    <div class="ru-head"><h2 id="ru-title">Business rules</h2>
      <div class="rc-scope" role="tablist" aria-label="Which rules"><button type="button" data-scope="project">This project</button><button type="button" data-scope="global">All projects</button></div>
      <button class="rc-toggle icon" type="button"></button><button class="rc-x dlg-x icon" type="button" title="Close (Esc)" aria-label="Close"></button></div>
    <p class="mute rc-about"></p>
    <div class="rc-view"></div>
    <textarea class="rc-code" spellcheck="false" aria-label="BUSINESS_RULES.md"></textarea>
    <div class="rc-add"><div class="rc-sugg" hidden></div><input class="rc-new" autocomplete="off" spellcheck="false" placeholder="Add a rule and press Enter…"><select class="rc-screen" aria-label="Section"></select><button class="rc-addbtn" type="button">Add</button></div>
    <p class="rc-err err"></p>
    <div class="row"><span class="rc-meta mute grow"></span><button class="rc-save" type="button">Save</button></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  const view = q(".rc-view"), code = q(".rc-code"), err = q(".rc-err"), meta = q(".rc-meta"), saveBtn = q(".rc-save"), addIn = q(".rc-new"), screenSel = q(".rc-screen");
  const setMeta = (t) => { meta.textContent = t; };

  function paint() {
    const items = parseRules(md), out = [];
    // the rules of every section, to show how many a rolled-up section hides
    const counts = new Map(); { let cur = null; for (const l of items) { if (l.kind === "h2") { cur = l.text; counts.set(cur, 0); } else if (l.kind === "item" && l.id && cur != null) counts.set(cur, counts.get(cur) + 1); } }
    let hide = false;
    for (let k = 0; k < items.length; k++) {
      const l = items[k];
      if (l.kind === "blank" || l.kind === "h1") continue; // the dialog title says it
      if (l.kind === "h2") {
        hide = folded.has(`${scope}|${l.text}`);
        out.push(`<h5 class="rc-h2" role="button" tabindex="0" aria-expanded="${!hide}" data-h="${esc(l.text)}" title="${hide ? "Show" : "Hide"} the rules of this section"><span class="rc-caret" aria-hidden="true">${hide ? "▸" : "▾"}</span>${esc(l.text)}${hide ? `<span class="rc-n">${counts.get(l.text) ?? 0}</span>` : ""}</h5>`);
        continue;
      }
      if (hide) { if (l.kind === "code") while (items[k + 1]?.kind === "code") k++; continue; }
      else if (l.kind === "item") out.push(`<div class="rc-item" data-line="${l.i}">${l.id ? `<span class="rc-id">${esc(l.id)}</span>` : `<span class="rc-dot">•</span>`}${l.screen ? `<span class="rc-scr" title="Rule of the screen ${esc(l.screen)}">${esc(l.screen)}</span>` : ""}<span class="rc-text" contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="Rule text">${esc(l.text)}</span><button class="rc-del" type="button" title="Delete this rule" aria-label="Delete this rule">${ICON_TRASH}</button></div>`);
      else if (l.kind === "code") { const t = [l.text]; while (items[k + 1]?.kind === "code") t.push(items[++k].text); out.push(markdown(t.join("\n"))); }
      else out.push(`<div class="rc-p">${markdown(l.text)}</div>`);
    }
    if (!items.some((l) => l.kind === "item")) out.push(`<p class="mute rc-empty">No rules yet. Claude records the rules that come up in your requests, or add one below.</p>`);
    view.innerHTML = out.join("");
  }
  /** "This project (3)" / "All projects (1)": how many rules each of the two files holds. */
  function scopeLabels() {
    const set = (id, text, n) => { const b = box.querySelector(`.rc-scope [data-scope="${id}"]`); if (b) b.textContent = n ? `${text} (${n})` : text; };
    set("project", "This project", projectCount); set("global", "All projects", globalCount);
  }
  function fill() {
    code.value = md; paint();
    for (const b of box.querySelectorAll(".rc-scope button")) b.classList.toggle("on", b.dataset.scope === scope);
    scopeLabels();
    q(".rc-about").innerHTML = scope === "global" ? "Kept in <code>GLOBAL_RULES.md</code> in the folder of your projects. These rules apply in every project; Claude records a rule here when you say it holds always, for every screen or in all projects." : "Kept in <code>BUSINESS_RULES.md</code> in the project folder. Claude records rules that come up in your requests; later tasks that build the target components read this file.";
    q(".rc-screen").hidden = scope === "global";
    screenSel.replaceChildren(new Option("General", ""), ...getScreens().map((s) => new Option(`Screen: ${s.replace(/\.html$/, "")}`, s.replace(/\.html$/, ""))));
    box.dataset.mode = mode;
    const t = q(".rc-toggle"), toCode = mode === "rendered"; // the icon shows where a click leads
    t.innerHTML = toCode ? ICON_CODE : ICON_VIEW; t.title = toCode ? "Show the Markdown code" : "Show the rendered rules"; t.setAttribute("aria-label", t.title);
    saveBtn.hidden = mode !== "code"; q(".rc-add").hidden = mode !== "rendered";
    if (scope === "project") { projectCount = countRules(md); onCount?.(projectCount); } else globalCount = countRules(md);
    scopeLabels();
  }
  async function write(next) {
    const r = await S().set(next);
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
  view.addEventListener("click", (e) => {
    const b = e.target.closest(".rc-del"); if (b) return deleteLine(b.closest(".rc-item"));
    const h = e.target.closest(".rc-h2"); if (h) toggleSection(h.dataset.h);
  });
  view.addEventListener("keydown", (e) => { const h = e.target.closest?.(".rc-h2"); if (h && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleSection(h.dataset.h); } });
  /** Rolls a section up or opens it again; the choice is remembered. */
  function toggleSection(heading) {
    const key = `${scope}|${heading}`; if (!folded.delete(key)) folded.add(key);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch { /* not remembered */ }
    paint(); view.querySelector(`.rc-h2[data-h="${CSS.escape(heading)}"]`)?.focus();
  }
  view.addEventListener("paste", (e) => { // plain text only, one line
    if (!e.target.closest?.(".rc-text")) return;
    e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData?.getData("text/plain") ?? "").replace(/\s+/g, " "));
  });
  async function addRule() {
    const text = addIn.value.trim(); if (!text) return;
    const r = await S().add(text, screenSel.value);
    if (r?.error) { err.textContent = r.error; return; }
    err.textContent = ""; addIn.value = ""; md = r.content; fill(); setMeta(`Added ${r.id}`);
    view.scrollTop = view.scrollHeight;
  }
  // `@` in the new rule: the components of the libraries (Plus4U5Elements.ContentContainer, …), so that a rule can name what screens are composed of
  const sugg = q(".rc-sugg");
  let suggIdx = 0, suggSeq = 0;
  const atWord = () => { const m = addIn.value.slice(0, addIn.selectionStart).match(/(^|\s)@([A-Za-z0-9.]*)$/); return m ? { start: addIn.selectionStart - m[2].length - 1, q: m[2] } : null; };
  async function updateSugg() {
    const w = atWord(), seq = ++suggSeq;
    if (!w || w.q.length < 2) { sugg.hidden = true; return; }
    const r = await api.docsSearch(w.q).catch(() => null);
    if (seq !== suggSeq) return;
    const items = (r?.results ?? []).slice(0, 6);
    if (!items.length) { sugg.hidden = true; return; }
    suggIdx = Math.min(suggIdx, items.length - 1);
    sugg.replaceChildren(...items.map((c, i) => Object.assign(document.createElement("button"), { type: "button", className: i === suggIdx ? "on" : "", textContent: "@" + c.name, onmousedown: (e) => { e.preventDefault(); pickSugg(c.name); } })));
    sugg.hidden = false;
  }
  function pickSugg(name) {
    const w = atWord(); if (!w) return;
    addIn.value = addIn.value.slice(0, w.start) + "@" + name + " " + addIn.value.slice(addIn.selectionStart);
    addIn.selectionStart = addIn.selectionEnd = w.start + name.length + 2; sugg.hidden = true; addIn.focus();
  }
  addIn.addEventListener("input", () => { suggIdx = 0; updateSugg(); });
  addIn.addEventListener("blur", () => setTimeout(() => (sugg.hidden = true), 120));
  addIn.onkeydown = (e) => {
    if (!sugg.hidden) {
      const n = sugg.children.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); suggIdx = (suggIdx + (e.key === "ArrowDown" ? 1 : n - 1)) % n; updateSugg(); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickSugg(sugg.children[suggIdx].textContent.slice(1)); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); sugg.hidden = true; return; }
    }
    if (e.key === "Enter") { e.preventDefault(); addRule(); }
  };
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

  async function setScope(next) {
    if (next === scope) return;
    if (mode === "code" && dirty && !(await saveCode())) return;
    scope = next; try { localStorage.setItem(SCOPE_KEY, scope); } catch { /* not remembered */ }
    md = (await S().get()) ?? ""; dirty = false; saveBtn.disabled = true; setMeta(""); fill(); (mode === "code" ? code : addIn).focus();
  }
  for (const b of box.querySelectorAll(".rc-scope button")) b.onclick = () => setScope(b.dataset.scope);

  // ---- open / close
  const isOpen = () => !box.hidden;
  async function reload() {
    if (scope === "global") { projectCount = countRules((await api.rulesGet().catch(() => "")) ?? ""); onCount?.(projectCount); scopeLabels(); } // the badge of the icon is always the project's
    if (dirty || (isOpen() && box.contains(document.activeElement) && document.activeElement.matches?.(".rc-text, .rc-code"))) return; // not from under the cursor
    md = (await S().get()) ?? ""; loaded = true; fill();
  }
  /** `screen`: a screen file name; the dialog opens ready to add a rule of that screen (rendered view, section preselected). */
  async function open({ screen } = {}) {
    err.textContent = ""; setMeta(""); dirty = false; saveBtn.disabled = true;
    if (screen && mode !== "rendered") { mode = "rendered"; try { localStorage.setItem(MODE_KEY, mode); } catch { /* not remembered */ } }
    if (screen && scope !== "project") scope = "project"; // a rule of a screen belongs to the project
    md = (await S().get()) ?? ""; loaded = true; globalCount = countRules((await api.rulesGetGlobal().catch(() => "")) ?? ""); projectCount = scope === "project" ? countRules(md) : countRules((await api.rulesGet().catch(() => "")) ?? ""); fill();
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
      if (!hasProject) { loaded = false; projectCount = 0; onCount?.(0); return; }
      md = (await api.rulesGet()) ?? ""; loaded = true; projectCount = countRules(md); onCount?.(projectCount);
    },
    /** GLOBAL_RULES.md changed (by the agent or by hand). */
    async reloadGlobal() {
      if (scope === "global") return reload();
      globalCount = countRules((await api.rulesGetGlobal().catch(() => "")) ?? ""); scopeLabels();
    },
    isLoaded: () => loaded,
  };
}
