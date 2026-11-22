import { esc } from "./markdown.js";
import { ICON_CLOSE } from "./icons.js";
import { getProjectText, setProjectText, getScreenText, setScreenText } from "./projectDoc.js";

/**
 * The descriptions of the project and of its screens (PROJECT.md), in a dialog of their own: they are not business rules.
 * Every field is edited in place and saved when you leave it (⌘Enter saves at once, Esc takes the change back).
 * `onProject(text)` keeps the strip above the canvas up to date.
 */
export function createDescPanel({ api, getScreens, onProject, onScreens }) {
  let md = "", loaded = false, only = null; // only: the screen whose description is edited (opened from the screen), null = the project and all screens
  const box = document.createElement("div");
  box.id = "descdlg"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-labelledby="dd-title">
    <div class="dlg-head"><h2 id="dd-title">Description</h2><button class="dlg-x icon dd-close" type="button" title="Close (Esc)" aria-label="Close"></button></div>
    <p class="mute">Kept in <code>PROJECT.md</code> in the project folder, apart from the business rules. Claude reads it as context for every task.</p>
    <div class="dd-fields"></div>
    <p class="dd-err err"></p>
    <div class="row"><span class="dd-meta mute grow"></span></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s), fields = q(".dd-fields"), err = q(".dd-err"), meta = q(".dd-meta");

  const field = (label, text, screen, placeholder) => `<h5 class="rc-h2">${esc(label)}</h5><div class="rc-desc" contenteditable="plaintext-only" spellcheck="false" role="textbox"${screen != null ? ` data-screen="${esc(screen)}"` : ""} aria-label="${esc(label)}" data-placeholder="${esc(placeholder)}">${esc(text)}</div>`;
  function paint() {
    q("#dd-title").textContent = only ? `Description of ${only}` : "Description";
    if (only) { fields.innerHTML = field("Screen", getScreenText(md, only), only, "What is this screen for?"); return; }
    fields.innerHTML = field("Project", getProjectText(md), null, "What is this project about?")
      + getScreens().map((f) => { const n = f.replace(/\.html$/, ""); return field(`Screen: ${n}`, getScreenText(md, n), n, "What is this screen for?"); }).join("");
  }
  const publish = () => { onProject?.(getProjectText(md)); onScreens?.(Object.fromEntries(getScreens().map((f) => [f, getScreenText(md, f.replace(/\.html$/, ""))]))); };
  async function commit(el, revert) {
    const screen = el.dataset.screen, text = el.innerText.replace(/\n{3,}/g, "\n\n").trim();
    const now = screen != null ? getScreenText(md, screen) : getProjectText(md);
    if (revert || text === now) { el.textContent = now; return; }
    const next = screen != null ? setScreenText(md, screen, text) : setProjectText(md, text), r = await api.descSet(next);
    if (r?.error) { err.textContent = r.error; return; }
    err.textContent = ""; md = next; meta.textContent = text ? "Saved" : "Removed"; paint(); publish();
  }
  fields.addEventListener("keydown", (e) => {
    const el = e.target.closest?.(".rc-desc"); if (!el) return;
    if (e.key === "Escape") { if (!el.dataset.dirty) return; e.preventDefault(); e.stopPropagation(); el.dataset.revert = "1"; el.blur(); } // an edit: Esc takes it back; nothing changed: Esc closes the dialog
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); el.blur(); }
  });
  fields.addEventListener("input", (e) => { const el = e.target.closest?.(".rc-desc"); if (el) el.dataset.dirty = "1"; });
  fields.addEventListener("focusout", (e) => {
    const el = e.target.closest?.(".rc-desc"); if (!el) return;
    delete el.dataset.dirty;
    const revert = el.dataset.revert === "1"; delete el.dataset.revert; commit(el, revert);
  });
  fields.addEventListener("paste", (e) => { // plain text only
    if (!e.target.closest?.(".rc-desc")) return;
    e.preventDefault(); document.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? "");
  });

  const isOpen = () => !box.hidden;
  const editing = () => isOpen() && box.contains(document.activeElement) && document.activeElement.matches?.(".rc-desc");
  async function reload() { if (editing()) return; md = (await api.descGet()) ?? ""; loaded = true; paint(); publish(); }
  /** `focus`: a screen file name opens the description of that screen only; anything else the project's and all the screens'. */
  async function open({ focus } = {}) {
    const stem = typeof focus === "string" ? focus.replace(/\.html$/, "") : null;
    only = stem && getScreens().some((f) => f.replace(/\.html$/, "").toLowerCase() === stem.toLowerCase()) ? stem : null;
    err.textContent = ""; meta.textContent = ""; md = (await api.descGet()) ?? ""; loaded = true; paint(); box.hidden = false;
    const name = stem ? stem.toLowerCase() : null;
    const target = (name && [...fields.querySelectorAll(".rc-desc[data-screen]")].find((d) => d.dataset.screen.toLowerCase() === name)) ?? fields.querySelector(".rc-desc");
    target.scrollIntoView({ block: "center" }); target.focus();
  }
  const close = () => { box.hidden = true; };
  q(".dd-close").innerHTML = ICON_CLOSE; q(".dd-close").onclick = close;
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  return {
    open, close, isOpen, reload,
    /** The description of one screen changed in place (its caption on the canvas): saved into PROJECT.md as read now. */
    async setScreen(file, text) {
      const now = (await api.descGet()) ?? "", next = setScreenText(now, String(file).replace(/\.html$/, ""), text);
      const r = await api.descSet(next);
      if (r?.error) return r;
      md = next; loaded = true; if (isOpen() && !editing()) paint(); publish();
      return { ok: true };
    },
    /** A project was opened (or none): the dialog closes and the strip follows the new file. */
    async load(hasProject) {
      box.hidden = true; md = "";
      if (!hasProject) { loaded = false; onProject?.(null); onScreens?.({}); return; }
      md = (await api.descGet()) ?? ""; loaded = true; publish();
    },
    /** The screens changed (the dialog lists them). */
    refreshScreens: () => { if (!loaded) return; if (isOpen() && !editing()) paint(); publish(); },
  };
}
