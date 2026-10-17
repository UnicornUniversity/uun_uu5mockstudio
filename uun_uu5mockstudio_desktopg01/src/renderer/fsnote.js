import { ICON_MIN, ICON_MAX, ICON_PLUS, ICON_TRASH } from "./icons.js";
const KEY = "uu5studio.fsnote";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };

/**
 * The notes of the screen that is open in fullscreen: one sticky panel floating over the preview with every note of the screen
 * (edit, add, delete). Where it sits and whether it is collapsed is remembered for fullscreen in general.
 */
export function createFsNote({ host, onEdit, onDelete, onBlur, onAdd }) {
  const st = { x: 24, y: 52, min: false, ...read() };
  const items = new Map(); // note id -> row
  const card = document.createElement("div"); card.className = "fnote fsnote"; card.hidden = true;
  card.innerHTML = `<div class="fn-head"><span class="fn-grip" aria-hidden="true">⠿</span><span class="fn-title">Notes</span><button class="fn-add" type="button" title="Add a note" aria-label="Add a note">${ICON_PLUS}</button><button class="fn-min" type="button"></button></div><div class="fsn-list"></div>`;
  host.append(card);
  const list = card.querySelector(".fsn-list"), title = card.querySelector(".fn-title"), minBtn = card.querySelector(".fn-min");
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* not persisted */ } };
  function render() {
    card.hidden = items.size === 0;
    st.x = Math.max(0, Math.min(st.x, innerWidth - 120)); st.y = Math.max(40, Math.min(st.y, innerHeight - 60));
    card.style.left = st.x + "px"; card.style.top = st.y + "px"; card.classList.toggle("min", st.min);
    title.textContent = items.size > 1 ? `Notes (${items.size})` : "Note"; minBtn.innerHTML = st.min ? ICON_MAX : ICON_MIN; minBtn.title = st.min ? "Expand the notes" : "Collapse the notes"; minBtn.setAttribute("aria-label", minBtn.title);
  }
  function row(id) {
    const r = document.createElement("div"); r.className = "fsn-item";
    r.innerHTML = `<textarea class="fn-text" spellcheck="false" placeholder="Note for this screen: context, open questions, rules that apply…"></textarea><button class="fn-del" type="button" title="Delete this note" aria-label="Delete this note">${ICON_TRASH}</button>`;
    const t = r.querySelector("textarea");
    t.addEventListener("input", () => onEdit?.(id, t.value));
    t.addEventListener("blur", () => onBlur?.(id, t.value));
    r.querySelector(".fn-del").onclick = () => onDelete?.(id);
    return r;
  }
  card.querySelector(".fn-add").onclick = () => onAdd?.();
  minBtn.onclick = () => { st.min = !st.min; save(); render(); };
  card.querySelector(".fn-head").onpointerdown = (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, x0 = st.x, y0 = st.y;
    const move = (ev) => { st.x = x0 + ev.clientX - sx; st.y = y0 + ev.clientY - sy; render(); };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); save(); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  addEventListener("resize", render);
  return {
    open() { /* a screen was opened in fullscreen: set() follows */ },
    close() { for (const r of items.values()) r.remove(); items.clear(); card.hidden = true; },
    /** Makes the rows match `notes` ([{id, text}]); the one being typed in keeps its text. */
    set(notes) {
      for (const [id, r] of [...items]) if (!notes.some((n) => n.id === id)) { r.remove(); items.delete(id); }
      for (const n of notes) {
        let r = items.get(n.id); if (!r) { r = row(n.id); items.set(n.id, r); list.append(r); }
        const t = r.querySelector("textarea"); if (document.activeElement !== t) t.value = n.text ?? "";
      }
      render();
    },
    /** Expands the panel and puts the cursor into the note. */
    focus(id) { st.min = false; save(); render(); items.get(id)?.querySelector("textarea").focus(); },
  };
}
