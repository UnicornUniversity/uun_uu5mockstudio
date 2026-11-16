import { popoverSpot } from "./annotations.js";

/**
 * The small window next to a marked place where the user writes the note of an annotation. One at a time.
 * open({ anchor: () => DOMRect | null (in px of the window; null when the place is gone), note, title, others }) → Promise<string | null | { edit: ref }>
 * (the note; "" when it was emptied; null when cancelled). Enter keeps it, Shift + Enter breaks the line, Esc or a click away cancels.
 * `others` = [{ ref, note }]: the notes the place already has, listed above the field (a click on one resolves to { edit: ref }, its × to { remove: ref });
 * the field then adds another one. A note being edited (`note` given) has Delete, which resolves to "".
 * `link` (a new place): with nothing written, Enter (the button says "Link") resolves to { link: true }: the place is only linked in the text as [#n].
 * An `other` with `linked: true` is a place linked in the text as [#n] (no note).
 */
export function createAnnotatePopover() {
  let cur = null;
  function close(value) {
    const c = cur; if (!c) return;
    cur = null;
    document.removeEventListener("pointerdown", c.away, true); removeEventListener("resize", c.place); clearInterval(c.timer);
    c.el.remove(); c.resolve(value);
  }
  function open({ anchor, note = "", title = "", others = [], link = false }) {
    close(null);
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "anpop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Note of the annotation");
      const head = Object.assign(document.createElement("div"), { className: "anpop-head", textContent: title, title });
      const list = Object.assign(document.createElement("div"), { className: "anpop-list" });
      for (const o of others) {
        const b = Object.assign(document.createElement("button"), { type: "button", className: "anpop-other", title: "Edit this note" });
        const x = Object.assign(document.createElement("span"), { className: "anpop-x", role: "button", tabIndex: 0, textContent: "✕", title: `Remove note #${o.ref}` });
        x.setAttribute("aria-label", `Remove note ${o.ref}`);
        x.onclick = (e) => { e.stopPropagation(); close({ remove: o.ref }); };
        x.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); close({ remove: o.ref }); } };
        b.append(Object.assign(document.createElement("b"), { className: "anno-n", textContent: String(o.ref) }), Object.assign(document.createElement("span"), { className: `anpop-note${o.linked ? " linked" : ""}`, textContent: o.linked ? `[#${o.ref}] linked in your text` : o.note }), x);
        b.onclick = () => close({ edit: o.ref }); list.append(b);
      }
      const ta = Object.assign(document.createElement("textarea"), { rows: 3, value: note, placeholder: others.length ? "Another note on this place…" : "What should change here?", spellcheck: true });
      ta.setAttribute("aria-label", "Note");
      const hint = Object.assign(document.createElement("div"), { className: "anpop-hint", textContent: link ? "Enter with nothing written links it in your text" : "Enter to keep · Shift + Enter new line · Esc to cancel" });
      const ok = Object.assign(document.createElement("button"), { type: "button", className: "primary", textContent: note ? "Save" : "Add" });
      const cancel = Object.assign(document.createElement("button"), { type: "button", textContent: "Cancel" });
      const del = note ? Object.assign(document.createElement("button"), { type: "button", className: "anpop-del", textContent: "Delete", title: "Remove this annotation" }) : null;
      if (del) del.onclick = () => close("");
      const acts = Object.assign(document.createElement("div"), { className: "anpop-acts" }); acts.append(hint, ...(del ? [del] : []), cancel, ok);
      el.append(head, ...(others.length ? [list] : []), ta, acts);
      const keep = () => { const v = ta.value.trim(); close(!v && link ? { link: true } : v); };
      if (link) ta.oninput = () => { ok.textContent = ta.value.trim() ? "Add" : "Link"; };
      if (link) { ok.textContent = "Link"; ok.title = "Nothing written: a link [#n] to it goes into your message at the cursor, to say e.g. “move [#1] under [#2]”"; }
      ok.onclick = keep; cancel.onclick = () => close(null);
      ta.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); keep(); }
        else if (e.key === "Escape") { e.preventDefault(); close(null); }
      };
      for (const ev of ["pointerdown", "wheel", "dblclick", "contextmenu", "keyup"]) el.addEventListener(ev, (e) => e.stopPropagation());
      const place = () => {
        const a = anchor?.(); if (!a) return close(null); // the place is gone (the screen reloaded, the page left the map)
        const s = popoverSpot(a, { w: el.offsetWidth, h: el.offsetHeight }, { w: innerWidth, h: innerHeight });
        el.style.left = `${s.left}px`; el.style.top = `${s.top}px`;
      };
      const away = (e) => { if (!el.contains(e.target)) close(null); };
      cur = { el, resolve, away, place, timer: setInterval(place, 250) }; // the canvas or the map may move under it
      document.body.append(el); place();
      document.addEventListener("pointerdown", away, true); addEventListener("resize", place);
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }
  return { open, close: () => close(null), get isOpen() { return Boolean(cur); } };
}
