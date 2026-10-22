import { esc } from "./markdown.js";
import { ICON_CLOSE } from "./icons.js";
import { getProjectText, setProjectText, getScreenText, setScreenText } from "./projectDoc.js";

/**
 * The descriptions of the project and of its screens (PROJECT.md), in a dialog of their own: they are not business rules.
 * Every field is edited in place and saved when you leave it (⌘Enter saves at once, Esc takes the change back).
 * `onProject(text)` keeps the strip above the canvas up to date.
 */
export function createDescPanel({ api, getScreens, onProject, onScreens }) {
  let md = "", loaded = false;
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
  /** `focus`: a screen file name puts the cursor into its description, anything else into the project's. */
  async function open({ focus } = {}) {
    err.textContent = ""; meta.textContent = ""; md = (await api.descGet()) ?? ""; loaded = true; paint(); box.hidden = false;
    const name = typeof focus === "string" ? focus.replace(/\.html$/, "").toLowerCase() : null;
    const target = (name && [...fields.querySelectorAll(".rc-desc[data-screen]")].find((d) => d.dataset.screen.toLowerCase() === name)) ?? fields.querySelector(".rc-desc");
    target.scrollIntoView({ block: "center" }); target.focus();
  }
  const close = () => { box.hidden = true; };
  q(".dd-close").innerHTML = ICON_CLOSE; q(".dd-close").onclick = close;
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  return {
    open, close, isOpen, reload,
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
