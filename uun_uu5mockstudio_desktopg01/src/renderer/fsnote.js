import { ICON_PLUS, ICON_TRASH } from "./icons.js";
const ICON_UNDERSCORE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="18" x2="19" y2="18"/></svg>';
const ICON_NOTE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v9l-7 7H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 21v-5a2 2 0 0 1 2-2h5"/></svg>';
const BUBBLE = 56; // as big as the bubble of the chat
const KEY = "uu5studio.fsnote2"; // (the first version of the panel kept other defaults)
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };

/**
 * The notes of the screen that is open in fullscreen: one sticky panel floating over the preview with every note of the screen
 * (edit, add, delete). Minimized (the default) it is a small round note bubble with the number of notes, by default in the bottom-right
 * corner (the chat bubble is in the bottom-left one); a click opens the panel, a drag moves the bubble. Where the panel and the bubble sit and whether it
 * is minimized is remembered for fullscreen in general.
 */
export function createFsNote({ host, onEdit, onDelete, onBlur, onAdd }) {
  const st = { x: undefined, y: undefined, bx: undefined, by: undefined, min: true, ...read() };
  const items = new Map(); // note id -> row
  const card = document.createElement("div"); card.className = "fnote fsnote"; card.hidden = true;
  card.innerHTML = `<div class="fn-head"><span class="fn-grip" aria-hidden="true">⠿</span><span class="fn-title">Notes</span><button class="fn-add" type="button" title="Add a note" aria-label="Add a note">${ICON_PLUS}</button><button class="fn-min" type="button"></button></div><div class="fsn-list"></div>`;
  host.append(card);
  const bubble = document.createElement("button"); bubble.type = "button"; bubble.className = "fsn-bubble"; bubble.hidden = true; bubble.title = "Notes of this screen"; bubble.setAttribute("aria-label", "Open the notes of this screen");
  bubble.innerHTML = `${ICON_NOTE}<span class="fsn-badge"></span>`; host.append(bubble);
  const list = card.querySelector(".fsn-list"), title = card.querySelector(".fn-title"), minBtn = card.querySelector(".fn-min");
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* not persisted */ } };
  function render() {
    const n = items.size, W = innerWidth, H = innerHeight;
    card.hidden = n === 0 || st.min; bubble.hidden = n === 0 || !st.min;
    title.textContent = n > 1 ? `Notes (${n})` : "Note"; minBtn.innerHTML = ICON_UNDERSCORE; minBtn.title = "Minimize the notes"; minBtn.setAttribute("aria-label", "Minimize the notes");
    bubble.querySelector(".fsn-badge").textContent = String(n); bubble.querySelector(".fsn-badge").hidden = n < 2;
    // the default places (the bubble and the panel in the bottom-right corner) follow the window; only a place the user chose is remembered
    const bx = Math.max(8, Math.min(Number.isFinite(st.bx) ? st.bx : W - BUBBLE - 16, W - BUBBLE - 8)), by = Math.max(48, Math.min(Number.isFinite(st.by) ? st.by : H - BUBBLE - 16, H - BUBBLE - 8));
    if (Number.isFinite(st.bx)) st.bx = bx; if (Number.isFinite(st.by)) st.by = by;
    bubble.style.left = bx + "px"; bubble.style.top = by + "px";
    if (card.hidden) return;
    const x = Math.max(0, Math.min(Number.isFinite(st.x) ? st.x : W - card.offsetWidth - 16, W - 120));
    if (Number.isFinite(st.x)) st.x = x;
    card.style.left = x + "px";
    if (!Number.isFinite(st.y)) card.style.top = Math.max(48, H - card.offsetHeight - 16) + "px";
    else { st.y = Math.max(40, Math.min(st.y, H - 60)); card.style.top = st.y + "px"; }
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
  minBtn.onclick = () => { st.min = true; save(); render(); };
  // the bubble: a click opens the panel, a drag moves the bubble
  bubble.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, x0 = bubble.offsetLeft, y0 = bubble.offsetTop; let dragged = false;
    const move = (ev) => { if (!dragged && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; dragged = true; st.bx = x0 + ev.clientX - sx; st.by = y0 + ev.clientY - sy; render(); };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); save(); if (!dragged) { st.min = false; save(); render(); } };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  card.querySelector(".fn-head").onpointerdown = (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, r0 = card.getBoundingClientRect(), x0 = r0.left, y0 = r0.top;
    const move = (ev) => { st.x = x0 + ev.clientX - sx; st.y = y0 + ev.clientY - sy; render(); };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); save(); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  addEventListener("resize", render);
  return {
    /** A screen was opened in fullscreen (set() follows); `minimize`: the preview was not open before, so the notes start as a bubble. */
    open({ minimize = false } = {}) { if (minimize) { st.min = true; save(); } },
    close() { for (const r of items.values()) r.remove(); items.clear(); card.hidden = true; bubble.hidden = true; },
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
