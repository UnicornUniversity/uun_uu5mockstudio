import { ICON_CLOSE } from "./icons.js";
import { esc } from "./markdown.js";

const BRAND_EXT = /\.(pdf|md|markdown|html?|txt)$/i;
export const isBrandFile = (f) => BRAND_EXT.test(f?.name ?? "") && !String(f?.type ?? "").startsWith("image/");
const toBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(file); });
const HEX = /^\s*[-*]\s+`?([\w .\/-]{1,40}?)`?\s*:\s*(#[0-9a-f]{3,8})\b/i;

/**
 * Brand guidelines of the project. The manual (PDF, HTML, Markdown) is read by the app itself: the dialog shows the
 * progress, then the colours, fonts and logo sizes it found, written into the design guide (DESIGN_GUIDE.md) that
 * can be edited here. Claude is only an optional second step ("Improve with Claude").
 * `askAgent(prompt)` sends that step as a chat request.
 */
export function createBrandDialog({ api, toast, askAgent, onChanged }) {
  let dirty = false, sources = [], working = false;
  const box = document.createElement("div");
  box.id = "branddlg"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-labelledby="bd-title">
    <div class="ru-head"><h2 id="bd-title">Brand guidelines</h2><span class="grow"></span><button class="bd-x dlg-x icon" type="button" title="Close (Esc)" aria-label="Close"></button></div>
    <p class="mute">Choose the customer’s brand manual (PDF, HTML or Markdown). The app reads it and fills the design guide below with the colours, fonts and logo sizes it finds. Every screen then follows the guide; its colours and fonts are available in screens as the CSS variables <code>var(--brand-…)</code>. You can edit the guide by hand.</p>
    <div class="row"><button class="bd-import" type="button">Choose manual…</button><input class="bd-file" type="file" accept=".pdf,.md,.markdown,.html,.htm,.txt" multiple hidden><span class="bd-sources mute grow"></span></div>
    <div class="bd-prog" hidden><div class="bd-bar"><i></i></div><span class="bd-phase"></span></div>
    <p class="bd-result" hidden></p>
    <div class="bd-sw" hidden></div>
    <textarea class="bd-code rc-code" spellcheck="false" aria-label="DESIGN_GUIDE.md" style="display:block;min-height:280px"></textarea>
    <p class="bd-err err"></p>
    <div class="row"><button class="bd-improve" type="button" title="Claude reads the text of the manual, checks the guide and completes it (spacing, tone of voice, do and don’t)">Improve with Claude</button><span class="bd-meta mute grow"></span><button class="bd-save" type="button">Save</button></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s), code = q(".bd-code"), err = q(".bd-err"), srcEl = q(".bd-sources");
  q(".bd-x").innerHTML = ICON_CLOSE;

  function paintSwatches() {
    const items = [...code.value.matchAll(new RegExp(HEX.source, "gim"))].map((m) => ({ name: m[1].trim(), hex: m[2] }));
    const sw = q(".bd-sw");
    sw.hidden = !items.length;
    sw.innerHTML = items.map((c) => `<span class="bd-chip" title="${esc(c.name)} ${esc(c.hex)}"><i style="background:${esc(c.hex)}"></i>${esc(c.name)} <b>${esc(c.hex)}</b></span>`).join("");
  }
  function paintSources() {
    srcEl.innerHTML = sources.length ? sources.map((n) => `<span class="bd-src">${esc(n)} <button type="button" class="bd-re" data-n="${esc(n)}" title="Read this file again">↻</button><button type="button" class="bd-rm" data-n="${esc(n)}" title="Remove this file" aria-label="Remove ${esc(n)}">✕</button></span>`).join(" ") : "No manual chosen yet.";
    q(".bd-improve").disabled = !sources.length || working;
  }
  async function load() {
    const r = await api.brandGet();
    if (r?.error) { err.textContent = r.error; return; }
    sources = r.sources ?? []; code.value = r.guide || r.template; dirty = false; err.textContent = ""; paintSources(); paintSwatches();
  }
  async function save() {
    const r = await api.brandSet(code.value);
    if (r?.error) { err.textContent = r.error; return false; }
    dirty = false; paintSwatches(); flashSaved(); onChanged?.(); return true;
  }
  /** Feedback of a save: the button says "Saved ✓" for a moment and a toast confirms it. */
  let flashTimer;
  function flashSaved() {
    const b = q(".bd-save"), n = parseTokensCount();
    clearTimeout(flashTimer); b.textContent = "Saved ✓"; b.classList.add("bd-saved");
    q(".bd-meta").textContent = n ? `${n} colours are available as var(--brand-…) in every screen.` : "";
    toast("Design guide saved.");
    flashTimer = setTimeout(() => { b.textContent = "Save"; b.classList.remove("bd-saved"); }, 1800);
  }
  const parseTokensCount = () => [...code.value.matchAll(new RegExp(HEX.source, "gim"))].length;
  const setBusy = (on) => { working = on; for (const b of box.querySelectorAll(".bd-import,.bd-improve,.bd-re,.bd-rm")) b.disabled = on || (b.classList.contains("bd-improve") && !sources.length); q(".bd-prog").hidden = !on; if (on) { q(".bd-result").hidden = true; } };
  api.onBrandProgress((p) => {
    if (!working) return;
    const { phase, done, total, file } = p, pct = total ? Math.round((done / total) * 100) : 0;
    q(".bd-bar i").style.width = `${pct}%`;
    q(".bd-phase").textContent = `${file ? `${file}: ` : ""}${phase}${phase === "Reading page" ? ` ${done} / ${total}` : "…"}`;
  });
  function showResult(found) {
    const r = q(".bd-result");
    r.hidden = false;
    r.innerHTML = found.map((f) => `<b>${esc(f.name)}</b>: ${f.pages} ${f.pages === 1 ? "page" : "pages"} read — ${f.colors.length} colours, ${f.fonts.length} fonts, ${f.logoSizes} logo sizes found.${f.colors.length ? "" : " <span class=\"err\">No colours were found; add them to the guide by hand or use “Improve with Claude”.</span>"}`).join("<br>");
  }
  async function run(call) {
    if (working) return false;
    if (dirty && !(await save())) return false;
    setBusy(true); err.textContent = ""; q(".bd-bar i").style.width = "0";
    if (box.hidden) box.hidden = false;
    try {
      const r = await call();
      if (r?.error) { err.textContent = r.error; return false; }
      await load(); showResult(r.found ?? []); onChanged?.(); return true;
    } catch { err.textContent = "The manual could not be read."; return false; }
    finally { setBusy(false); paintSources(); }
  }
  /** Files chosen here or dropped into the chat: stored, read, and the dialog shows what happens. */
  async function importFiles(files) {
    const list = [...files].filter(isBrandFile);
    if (!list.length) return false;
    return run(async () => api.brandImport(await Promise.all(list.map(async (f) => ({ name: f.name, data: await toBase64(f) })))));
  }
  q(".bd-import").onclick = () => q(".bd-file").click();
  q(".bd-file").onchange = (e) => { importFiles(e.target.files); e.target.value = ""; };
  q(".bd-improve").onclick = async () => {
    if (dirty && !(await save())) return;
    const r = await api.brandImprove();
    if (r?.error) { err.textContent = r.error; return; }
    box.hidden = true; askAgent(r.prompt);
  };
  srcEl.addEventListener("click", async (e) => {
    const rm = e.target.closest(".bd-rm"), re = e.target.closest(".bd-re");
    if (rm) { await api.brandRemove(rm.dataset.n); await load(); }
    else if (re) run(() => api.brandReread(re.dataset.n));
  });
  code.addEventListener("input", () => { dirty = true; q(".bd-meta").textContent = "Unsaved changes."; const b = q(".bd-save"); b.textContent = "Save"; b.classList.remove("bd-saved"); paintSwatches(); });
  q(".bd-save").onclick = save;
  async function close() { if (working) return; if (dirty && !(await save())) return; box.hidden = true; }
  q(".bd-x").onclick = close;
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  });
  return {
    isOpen: () => !box.hidden,
    importFiles,
    askAgentFix: (prompt, label) => askAgent(prompt, label),
    /** The agent or the user changed the file: the dialog follows unless there are unsaved edits. */
    refresh: () => { if (!box.hidden && !dirty && !working) load(); },
    async open() { await load(); box.hidden = false; },
  };
}
