const KEY = "uu5studio.chat", KEY_FS = "uu5studio.chatfs";
const MIN_W = 320, MIN_H = 280, EDGE = 8, FS_MARGIN = 16, BUBBLE = 56;
const read = (key) => { try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; } };
const num = (v, d) => (Number.isFinite(v) ? v : d);
const between = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * The chat panel is docked (left column) or floating over the canvas: draggable by its header, resizable from all
 * edges, minimizable (button or double-click on the header) to a round chat bubble (by default in the bottom-left corner of the window); a click on the bubble opens it again, and the bubble can be dragged.
 * During the fullscreen preview the same panel is a floating window above the preview (or docked on the left, the preview then
 * starts to its right) with its own remembered geometry, docked and minimized state; leaving fullscreen puts it back exactly where it was.
 * `onModeChange(mode, shiftX)`: shiftX is how far the canvas content has to move so it stays put on screen.
 */
export function createChatDock({ chat, header, toggleBtn, onModeChange }) {
  const a = read(KEY), f = read(KEY_FS);
  const st = { mode: a.mode === "float" ? "float" : "dock", x: a.x, y: a.y, w: num(a.w, 400), h: num(a.h, 0), collapsed: Boolean(a.collapsed), bx: a.bx, by: a.by }; // normal context
  const fsSt = { x: f.x, y: f.y, w: num(f.w, 380), h: num(f.h, 0), collapsed: Boolean(f.collapsed), docked: Boolean(f.docked), bx: f.bx, by: f.by }; // fullscreen context (floating unless docked)
  let fsActive = false, restoredAt = 0; // restoredAt: a dblclick right after restoring a minimized bar must not collapse it again
  const cur = () => (fsActive ? fsSt : st);
  const floating = () => (fsActive ? !fsSt.docked : st.mode === "float");
  const save = () => { try { localStorage.setItem(fsActive ? KEY_FS : KEY, JSON.stringify(cur())); } catch {} };

  /** Geometry of the expanded panel, kept inside the window. Defaults: bottom left (the notes of the fullscreen preview are bottom right). */
  function fit() {
    const c = cur(), W = innerWidth, H = innerHeight;
    c.w = between(Math.round(c.w), MIN_W, W - 2 * EDGE);
    c.h = c.h ? between(Math.round(c.h), MIN_H, H - 2 * EDGE) : Math.min(fsActive ? 560 : 680, H - 96);
    c.x = between(Math.round(num(c.x, fsActive ? FS_MARGIN : 2 * EDGE)), EDGE, W - c.w - EDGE);
    c.y = between(Math.round(num(c.y, H - c.h - (fsActive ? FS_MARGIN : 2 * EDGE))), EDGE, H - c.h - EDGE);
  }

  function apply() {
    const c = cur(), fl = floating();
    document.body.dataset.chat = fl ? "float" : "dock";
    if (fsActive) document.body.dataset.fs = "1"; else delete document.body.dataset.fs;
    // docked during the fullscreen preview: the panel is a left column above it and the preview starts right of it
    if (fsActive && fsSt.docked) document.body.style.setProperty("--fs-left", `${Math.round(between(fsSt.w, MIN_W, innerWidth / 2))}px`); else document.body.style.removeProperty("--fs-left");
    header.classList.toggle("drag", !fl); // window drag region only while docked
    chat.classList.toggle("collapsed", fl && c.collapsed);
    if (minBtn) { const min = fl && c.collapsed; minBtn.title = min ? "Restore chat" : "Minimize chat"; minBtn.setAttribute("aria-label", minBtn.title); }
    toggleBtn.title = fl ? "Dock the chat on the left" : "Switch the chat to a floating window"; toggleBtn.setAttribute("aria-label", toggleBtn.title);
    toggleBtn.setAttribute("aria-pressed", String(fl));
    if (!fl) { chat.style.cssText = ""; return; }
    if (!c.collapsed) { fit(); Object.assign(chat.style, { left: c.x + "px", top: c.y + "px", width: c.w + "px", height: c.h + "px" }); return; }
    // minimized: a round bubble with a position of its own (by default in the bottom-left corner), kept inside the window
    c.w = between(Math.round(c.w), MIN_W, innerWidth - 2 * EDGE); c.h = c.h ? between(Math.round(c.h), MIN_H, innerHeight - 2 * EDGE) : c.h;
    Object.assign(chat.style, { width: BUBBLE + "px", height: BUBBLE + "px" });
    // the default place (the bottom-left corner) follows the window; only a place the user chose is remembered
    const bx = between(Math.round(num(c.bx, 16)), EDGE, innerWidth - BUBBLE - EDGE), by = between(Math.round(num(c.by, innerHeight - BUBBLE - 16)), EDGE, innerHeight - BUBBLE - EDGE);
    if (Number.isFinite(c.bx)) c.bx = bx; if (Number.isFinite(c.by)) c.by = by;
    Object.assign(chat.style, { left: bx + "px", top: by + "px" });
  }

  function setMode(mode) {
    if (fsActive) { const docked = mode === "dock"; if (fsSt.docked !== docked) { fsSt.docked = docked; apply(); save(); } return; } // the preview resizes itself (see ResizeObserver in the renderer)
    if (mode === st.mode) return;
    const canvas = document.getElementById("canvas"), left0 = canvas.getBoundingClientRect().left;
    st.mode = mode; apply(); save();
    // the canvas starts right of a docked chat but at 0 when the chat floats: move the content so it stays put on screen
    onModeChange?.(mode, left0 - canvas.getBoundingClientRect().left);
  }
  function toggleCollapsed() { if (!floating()) return; const c = cur(); c.collapsed = !c.collapsed; apply(); save(); }

  // ----- drag (header) and resize (edges)
  const busy = (on) => document.body.classList.toggle("chat-drag", on);
  function track(e, move, after) {
    e.preventDefault(); busy(true);
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); busy(false); save(); after?.(); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  }
  const CONTROLS = "select, input, #chatmode, #newchat, #chathist, #chatmin";
  const minBtn = chat.querySelector("#chatmin");
  header.addEventListener("pointerdown", (e) => {
    // small controls keep their own clicks; the (wide) project button can also be dragged: it only counts as a drag after a few pixels
    if (!floating() || e.button !== 0 || e.target.closest(CONTROLS)) return;
    const c = cur(), sx = e.clientX, sy = e.clientY, x0 = c.x, y0 = c.y;
    let dragged = false;
    track(e, (ev) => {
      if (!dragged && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      dragged = true; c.x = x0 + ev.clientX - sx; c.y = y0 + ev.clientY - sy; apply();
    }, () => {
      if (!dragged) return;
      // the click that follows a drag must not press the project button; the guard is removed right away so it can never eat a later click
      const block = (k) => { k.stopPropagation(); k.preventDefault(); };
      header.addEventListener("click", block, { capture: true, once: true });
      setTimeout(() => header.removeEventListener("click", block, { capture: true }), 50);
    });
  });
  header.addEventListener("dblclick", (e) => { if (!e.target.closest(CONTROLS) && !cur().collapsed && Date.now() - restoredAt > 600) toggleCollapsed(); });
  // the round bubble of a minimized chat: a drag moves it, a click opens the chat
  chat.querySelector("#chatbubble").addEventListener("pointerdown", (e) => {
    if (!floating() || e.button !== 0) return;
    const c = cur(), sx = e.clientX, sy = e.clientY, x0 = chat.offsetLeft, y0 = chat.offsetTop;
    let dragged = false;
    track(e, (ev) => {
      if (!dragged && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      dragged = true; c.bx = x0 + ev.clientX - sx; c.by = y0 + ev.clientY - sy; apply();
    }, () => { if (!dragged) { restoredAt = Date.now(); toggleCollapsed(); } });
  });
  // (the header of a minimized chat is hidden; this stays for the keyboard-less case of an old layout)
  header.addEventListener("click", (e) => { if (floating() && cur().collapsed && !e.target.closest("#chatmin")) { restoredAt = Date.now(); toggleCollapsed(); } });
  for (const h of chat.querySelectorAll(".crs")) {
    const dir = ["nw", "ne", "sw", "se", "n", "s", "e", "w"].find((d) => h.classList.contains("crs-" + d));
    h.addEventListener("pointerdown", (e) => {
      const c = cur();
      if (!floating() || e.button !== 0 || c.collapsed) return;
      const sx = e.clientX, sy = e.clientY, { x: x0, y: y0, w: w0, h: h0 } = c;
      track(e, (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (dir.includes("e")) c.w = w0 + dx;
        if (dir.includes("w")) { c.w = w0 - dx; c.x = x0 + dx; }
        if (dir.includes("s")) c.h = h0 + dy;
        if (dir.includes("n")) { c.h = h0 - dy; c.y = y0 + dy; }
        // below the minimum the opposite edge stays put
        if (c.w < MIN_W) { if (dir.includes("w")) c.x -= MIN_W - c.w; c.w = MIN_W; }
        if (c.h < MIN_H) { if (dir.includes("n")) c.y -= MIN_H - c.h; c.h = MIN_H; }
        apply();
      });
    });
  }
  toggleBtn.addEventListener("click", () => setMode(floating() ? "dock" : "float"));
  addEventListener("resize", () => floating() && apply());
  apply();

  return {
    mode: () => st.mode,
    toggle: () => setMode(floating() ? "dock" : "float"),
    toggleCollapsed,
    collapsed: () => floating() && cur().collapsed,
    /** Fullscreen preview opened / closed: the chat becomes (and stops being) a floating window above it. */
    enterFullscreen: ({ minimize = false } = {}) => { fsActive = true; if (minimize && !fsSt.docked) fsSt.collapsed = true; apply(); },
    exitFullscreen: () => { fsActive = false; apply(); },
  };
}
