import { ICON_MIN, ICON_MAX, ICON_TRASH } from "./icons.js";
export const DEVICES = {
  desktop: { label: "Desktop", w: 1440, h: 900 },
  laptop: { label: "Laptop", w: 1280, h: 800 },
  tablet: { label: "Tablet", w: 820, h: 1180 },
  mobile: { label: "Mobile", w: 390, h: 844 },
};
const GAP = 120, TITLE_H = 34, MIN_Z = 0.1, MAX_Z = 2;

/**
 * Infinite canvas with one <webview> frame per mockup.
 * Unselected frames are covered by a "shield" so drag/pan work; a selected frame is interactive.
 */
/** The menu of the device sizes of a screen: a normal-sized popover on the page (not inside the scaled title bar of the frame). */
let devMenu = null;
function closeDevMenu() { if (!devMenu) return; removeEventListener("pointerdown", devMenu.away, true); removeEventListener("keydown", devMenu.key, true); devMenu.el.remove(); devMenu = null; }
function openDevMenu(f, anchor) {
  const was = devMenu?.anchor === anchor; closeDevMenu(); if (was) return;
  const m = document.createElement("div"); m.id = "devmenu"; m.setAttribute("role", "menu");
  for (const o of f.devSel.options) {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: o.textContent, className: o.value === f.devSel.value ? "on" : "" });
    b.setAttribute("role", "menuitemradio"); b.setAttribute("aria-checked", String(o.value === f.devSel.value));
    b.onclick = () => { closeDevMenu(); f.devSel.value = o.value; f.devSel.dispatchEvent(new Event("change")); };
    m.append(b);
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + "px"; m.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8)) + "px";
  const away = (e) => { if (!m.contains(e.target)) closeDevMenu(); }, key = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeDevMenu(); } };
  devMenu = { el: m, anchor, away, key };
  setTimeout(() => { if (devMenu?.el === m) { addEventListener("pointerdown", away, true); addEventListener("keydown", key, true); } }, 0);
}

export function createCanvas({ root, world, urlFor, preloadUrl, onGuestMessage, onReady, onGone, onDelete, onFullscreen, onRequestSize, onChange, onSelect, onPageReady, onNoteEdit, onNoteBlur, onNoteDelete, onContextMenu, onDescClick, getInset }) {
  let workingFile = null; // the screen the agent is working on right now (may not exist yet while it is being created)
  const frames = new Map(); // file -> {file,x,y,device,el,view,shield}
  let cam = { x: 40, y: 40, z: 0.5 };
  let selected = null, inspecting = false;

  /** The title bar keeps a constant on-screen size, so on small (zoomed-out) screens its controls are dropped step by step. */
  function updateCompact() {
    for (const f of frames.values()) {
      const w = size(f).w * cam.z;
      f.el.dataset.compact = w < 130 ? "3" : w < 280 ? "2" : w < 440 ? "1" : "0";
    }
  }
  const applyCam = (animate) => {
    world.style.transition = animate ? "transform .28s cubic-bezier(.2,.8,.2,1)" : "none";
    world.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`;
    root.style.setProperty("--iz", String(1 / cam.z)); root.style.setProperty("--z", String(cam.z));
    updateCompact();
    onChange?.("camera");
  };
  const zoomAt = (px, py, nz) => {
    nz = Math.min(MAX_Z, Math.max(MIN_Z, nz));
    cam = { x: px - ((px - cam.x) / cam.z) * nz, y: py - ((py - cam.y) / cam.z) * nz, z: nz };
    applyCam(false);
  };
  const MIN_SIDE = 200, MAX_SIDE = 10000, clampSide = (n) => Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(n)));
  /** A frame is either a device preset or a custom size (dragged or typed in). */
  const size = (f) => (f.device === "custom" && f.w && f.h ? { w: f.w, h: f.h } : DEVICES[f.device] ?? DEVICES.desktop);

  // ----- sticky notes of a screen (like Figma / pen.dev comments): any number beside the screen, movable, positions remembered per note id
  const NOTE_STEP = 176; // vertical distance of the default places of stacked notes
  const notePos = (f, id) => { const i = Math.max(0, [...f.noteEls.keys()].indexOf(id)), p = f.notePos[id]; return { x: p?.x ?? size(f).w + 28, y: p?.y ?? i * NOTE_STEP, min: Boolean(p?.min) }; };
  function layoutNote(f, id) {
    const el = f.noteEls.get(id); if (!el) return;
    const p = notePos(f, id); el.style.left = p.x + "px"; el.style.top = p.y + "px"; el.classList.toggle("min", p.min);
    const text = el.querySelector(".fn-text").value.trim(), b = el.querySelector(".fn-min");
    el.querySelector(".fn-title").textContent = p.min && text ? text.split("\n")[0] : "Note";
    b.innerHTML = p.min ? ICON_MAX : ICON_MIN; b.title = p.min ? "Expand the note" : "Collapse the note"; b.setAttribute("aria-label", b.title);
  }
  const layoutNotes = (f) => { for (const id of f.noteEls.keys()) layoutNote(f, id); };
  function buildNote(f, id) {
    const card = document.createElement("div"); card.className = "fnote";
    card.innerHTML = `<div class="fn-head"><span class="fn-grip" aria-hidden="true">⠿</span><span class="fn-title">Note</span><button class="fn-min" type="button"></button><button class="fn-del" type="button" title="Delete this note" aria-label="Delete this note">${ICON_TRASH}</button></div><textarea class="fn-text" spellcheck="false" placeholder="Note for this screen: context, open questions, rules that apply…"></textarea>`;
    const text = card.querySelector(".fn-text");
    card.addEventListener("pointerdown", (e) => e.stopPropagation()); // the canvas must not pan or select under a note
    card.addEventListener("contextmenu", (e) => e.stopPropagation());
    text.addEventListener("input", () => { onNoteEdit?.(f.file, id, text.value); layoutNote(f, id); });
    text.addEventListener("blur", () => onNoteBlur?.(f.file, id, text.value));
    card.querySelector(".fn-min").onclick = () => { f.notePos[id] = { ...notePos(f, id), min: !notePos(f, id).min }; layoutNote(f, id); onChange?.("layout"); };
    card.querySelector(".fn-del").onclick = () => onNoteDelete?.(f.file, id);
    card.querySelector(".fn-head").onpointerdown = (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      e.preventDefault(); e.stopPropagation();
      const p = notePos(f, id), sx = e.clientX, sy = e.clientY; root.classList.add("dragging");
      const move = (ev) => { f.notePos[id] = { ...notePos(f, id), x: p.x + (ev.clientX - sx) / cam.z, y: p.y + (ev.clientY - sy) / cam.z }; layoutNote(f, id); };
      const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); root.classList.remove("dragging"); onChange?.("layout"); };
      addEventListener("pointermove", move); addEventListener("pointerup", up);
    };
    f.el.append(card); f.noteEls.set(id, card);
    return card;
  }
  /** Makes the cards of a screen match `notes` ([{id, text}]): new ones appear, gone ones disappear, texts follow (except the one being typed in). */
  function setScreenNotes(file, notes) {
    const f = frames.get(file); if (!f) return;
    for (const [id, el] of [...f.noteEls]) if (!notes.some((n) => n.id === id)) { el.remove(); f.noteEls.delete(id); delete f.notePos[id]; }
    for (const n of notes) {
      const el = f.noteEls.get(n.id) ?? buildNote(f, n.id), t = el.querySelector(".fn-text");
      if (document.activeElement !== t) t.value = n.text ?? "";
    }
    layoutNotes(f);
  }

  // ----- descriptions of the screens (PROJECT.md): below each screen, at a readable size at any zoom
  let descs = {}; // file -> description
  const applyDesc = (f) => { const t = descs[f.file] ?? ""; f.desc.hidden = !t; f.desc.textContent = t; };
  function layoutFrame(f) {
    layoutNotes(f);
    const d = size(f);
    f.el.style.left = f.x + "px"; f.el.style.top = f.y + "px";
    f.desc.style.width = `max(200px, calc(${d.w}px * var(--z, 1)))`; // as wide as the screen looks on the screen
    f.el.style.width = d.w + "px"; // the frame is exactly as wide as the screen, so a long title is cut off instead of widening it
    f.body.style.width = d.w + "px"; f.body.style.height = d.h + "px";
    f.devSel.value = f.device;
    f.syncDev?.();
    updateCompact();
    f.customOpt.textContent = f.device === "custom" ? `Custom ${d.w}×${d.h}` : "Custom size…";
    f.syncDev?.();
  }
  function updateShields() {
    for (const f of frames.values()) f.shield.hidden = inspecting || f.file === selected;
  }

  function fitBounds(list, animate = true) {
    if (!list.length) return;
    const b = list.reduce((a, f) => {
      const d = size(f);
      const n = { x1: Math.min(a.x1, f.x), y1: Math.min(a.y1, f.y - TITLE_H), x2: Math.max(a.x2, f.x + d.w), y2: Math.max(a.y2, f.y + d.h) };
      for (const [id, el] of f.noteEls) { const p = notePos(f, id); n.y1 = Math.min(n.y1, f.y + p.y); n.x2 = Math.max(n.x2, f.x + p.x + el.offsetWidth); n.y2 = Math.max(n.y2, f.y + p.y + el.offsetHeight); } // the notes beside a screen belong to the picture
      return n;
    }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
    // inset: the parts of the canvas hidden under a floating toolbar (Glass Effect, top) or a floating chat (left or right); a number means the top only
    const ins = getInset?.() ?? 0, top = typeof ins === "number" ? ins : ins.top ?? 0, left = typeof ins === "number" ? 0 : ins.left ?? 0, right = typeof ins === "number" ? 0 : ins.right ?? 0;
    const r = root.getBoundingClientRect(), pad = 48, aw = r.width - left - right, ah = r.height - top;
    const z = Math.min(1, Math.max(MIN_Z, Math.min((aw - 2 * pad) / (b.x2 - b.x1), (ah - 2 * pad) / (b.y2 - b.y1))));
    cam = { z, x: left + (aw - (b.x2 - b.x1) * z) / 2 - b.x1 * z, y: top + (ah - (b.y2 - b.y1) * z) / 2 - b.y1 * z };
    applyCam(animate);
  }

  function select(file) {
    selected = file && frames.has(file) ? file : null;
    for (const f of frames.values()) f.el.classList.toggle("sel", f.file === selected);
    updateShields(); onSelect?.(selected);
  }

  function addFrame(file, saved = {}) {
    if (frames.has(file)) return frames.get(file);
    const right = [...frames.values()].reduce((m, f) => Math.max(m, f.x + size(f).w), -GAP);
    const f = { file, x: saved.x ?? right + GAP, y: saved.y ?? 0, device: saved.device ?? "desktop", w: saved.w, h: saved.h };
    const el = document.createElement("div"); el.className = "frame";
    el.innerHTML = `<div class="ftitle"><span class="fname"></span><span class="fctl"><select class="fdev" hidden aria-hidden="true" tabindex="-1"></select><button type="button" class="fdevbtn" aria-haspopup="menu" title="Device size"></button><button class="ffit" title="Height to fit content" aria-label="Height to fit content"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/></svg></button><button class="fexp" title="Expand to full screen (⌘⇧F / Ctrl+Shift+F)" aria-label="Expand to full screen"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button><button class="fdel" title="Delete screen" aria-label="Delete screen"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></span></div><div class="fbody"></div><div class="rs rs-e"></div><div class="rs rs-s"></div><div class="rs rs-se"></div>`;
    const fname = el.querySelector(".fname"); fname.textContent = file.replace(/\.html$/, ""); fname.title = file; // full name on hover
    const devSel = el.querySelector(".fdev");
    devSel.innerHTML = Object.entries(DEVICES).map(([k, d]) => `<option value="${k}">${d.label} ${d.w}×${d.h}</option>`).join("") + `<option value="custom">Custom size…</option>`;
    // the size menu is not a native <select>: the title bar is scaled with the zoom of the canvas, and a native menu would be scaled with it
    const devBtn = el.querySelector(".fdevbtn");
    const syncDev = () => { devBtn.textContent = `${devSel.selectedOptions[0]?.textContent ?? ""} ▾`; };
    devBtn.onpointerdown = (e) => e.stopPropagation();
    devBtn.onclick = (e) => { e.stopPropagation(); openDevMenu(f, devBtn); };
    const body = el.querySelector(".fbody");
    const view = document.createElement("webview");
    view.setAttribute("webpreferences", "backgroundThrottling=no");
    const pre = preloadUrl?.(); if (pre) view.setAttribute("preload", pre); // must be set before src
    view.src = urlFor(file);
    const shield = document.createElement("div"); shield.className = "shield";
    body.append(view, shield);
    const desc = document.createElement("div"); desc.className = "fdesc"; desc.hidden = true; desc.title = "Description of the screen (click to edit)";
    desc.addEventListener("pointerdown", (e) => e.stopPropagation()); desc.addEventListener("click", () => onDescClick?.(file));
    el.append(desc);
    Object.assign(f, { el, body, view, shield, desc, devSel, syncDev, customOpt: devSel.querySelector('option[value="custom"]') });
    syncDev();
    view.addEventListener("ipc-message", (e) => {
      if (e.channel === "studio-contextmenu") {
        const { x, y, vw } = e.args[0], r = view.getBoundingClientRect(), k = r.width / vw;
        return void onContextMenu?.({ file, clientX: r.left + x * k, clientY: r.top + y * k, at: { x, y: TITLE_H + y } });
      }
      if (e.channel === "studio-pan") { const { dx, dy } = e.args[0]; cam.x -= dx; cam.y -= dy; return void applyCam(false); } // scrolling over a screen: see webviewPreload.cjs (inspecting: the canvas moves, Alt scrolls the screen; otherwise the other way round)
      if (e.channel !== "studio-zoom") return void onGuestMessage?.(file, e.channel);
      const { deltaY, x, y, vw } = e.args[0], r = view.getBoundingClientRect(), cr = root.getBoundingClientRect();
      zoomAt(r.left - cr.left + x * (r.width / vw), r.top - cr.top + y * (r.width / vw), cam.z * Math.exp(-Math.max(-40, Math.min(40, deltaY)) * 0.01));
    });
    view.addEventListener("dom-ready", () => { try { view.send("studio-pan-wheel", "alt"); } catch { /* not ready yet */ } if (!f.ready) { f.ready = true; onReady?.(file, view.getWebContentsId()); } onPageReady?.(f); });

    devSel.onchange = async () => {
      if (devSel.value === "custom") {
        const cur = size(f), r = await onRequestSize?.({ file, w: cur.w, h: cur.h });
        if (!r) { devSel.value = f.device; return; } // dialog cancelled
        Object.assign(f, { device: "custom", w: clampSide(r.w), h: clampSide(r.h) });
      } else f.device = devSel.value;
      layoutFrame(f); onChange?.("layout");
    };
    const fitHeight = async () => {
      const h = await view.executeJavaScript("Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)").catch(() => 0);
      if (!h) return;
      Object.assign(f, { device: "custom", w: size(f).w, h: clampSide(h) }); layoutFrame(f); onChange?.("layout");
    };
    const fit = el.querySelector(".ffit"); fit.onpointerdown = (e) => e.stopPropagation(); fit.onclick = fitHeight;
    for (const h of el.querySelectorAll(".rs")) {
      const dir = h.classList.contains("rs-e") ? "e" : h.classList.contains("rs-s") ? "s" : "se";
      h.ondblclick = fitHeight;
      h.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation(); select(file); root.classList.add("dragging");
        const sx = e.clientX, sy = e.clientY, s0 = size(f);
        const move = (ev) => {
          Object.assign(f, { device: "custom", w: dir === "s" ? s0.w : clampSide(s0.w + (ev.clientX - sx) / cam.z), h: dir === "e" ? s0.h : clampSide(s0.h + (ev.clientY - sy) / cam.z) });
          layoutFrame(f);
        };
        const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); root.classList.remove("dragging"); onChange?.("layout"); };
        addEventListener("pointermove", move); addEventListener("pointerup", up);
      };
    }
    const exp = el.querySelector(".fexp");
    exp.onpointerdown = (e) => e.stopPropagation();
    exp.onclick = () => onFullscreen?.(file);
    const del = el.querySelector(".fdel");
    del.onpointerdown = (e) => e.stopPropagation();
    del.onclick = () => onDelete?.(file);
    // drag by title bar
    el.querySelector(".ftitle").onpointerdown = (e) => {
      if (e.target.closest(".fctl") || e.button !== 0) return;
      select(file); root.classList.add("dragging"); const sx = e.clientX, sy = e.clientY, ox = f.x, oy = f.y;
      const move = (ev) => { f.x = ox + (ev.clientX - sx) / cam.z; f.y = oy + (ev.clientY - sy) / cam.z; layoutFrame(f); };
      const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); root.classList.remove("dragging"); onChange?.("layout"); };
      addEventListener("pointermove", move); addEventListener("pointerup", up); e.preventDefault();
    };
    el.classList.toggle("working", file === workingFile);
    f.noteEls = new Map(); f.notePos = { ...(saved.notes ?? {}), ...(saved.note ? { main: saved.note } : {}) }; // saved.note: the single note of an older version
    world.append(el); frames.set(file, f); applyDesc(f); layoutFrame(f); updateShields();
    return f;
  }
  function removeFrame(file) {
    const f = frames.get(file); if (!f) return;
    f.el.remove(); frames.delete(file); if (selected === file) select(null); onGone?.(file);
  }

  // ----- canvas gestures: wheel = pan, ctrl/cmd+wheel (and trackpad pinch) = zoom, drag background/shield = pan, click shield = select
  root.addEventListener("wheel", (e) => {
    if (e.target.closest("webview") || (e.target !== root && !e.target.closest("#world"))) return;
    if (e.target.closest(".fnote") && !(e.ctrlKey || e.metaKey)) return; // scrolling inside a note
    e.preventDefault();
    const r = root.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, cam.z * Math.exp(-Math.max(-40, Math.min(40, e.deltaY)) * 0.01));
    else { cam.x -= e.deltaX; cam.y -= e.deltaY; applyCam(false); }
  }, { passive: false });
  // right click on a screen (its shield or title bar; inside a selected screen the page forwards it): the app shows a menu
  root.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".frame"); if (!el || e.target.closest(".fnote")) return;
    const f = [...frames.values()].find((x) => x.el === el); if (!f) return;
    e.preventDefault();
    const r = root.getBoundingClientRect();
    onContextMenu?.({ file: f.file, clientX: e.clientX, clientY: e.clientY, at: { x: (e.clientX - r.left - cam.x) / cam.z - f.x, y: (e.clientY - r.top - cam.y) / cam.z - f.y } });
  });
  root.addEventListener("pointerdown", (e) => {
    if (e.target !== root && !e.target.closest("#world")) return; // overlays (toast, selection bar) keep their own clicks
    if (e.target.closest(".ftitle") || e.target.closest("webview") || (e.button !== 0 && e.button !== 1)) return;
    const shield = e.target.closest(".shield"), sx = e.clientX, sy = e.clientY, ox = cam.x, oy = cam.y;
    let moved = false; root.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true; root.classList.add("panning", "dragging");
      cam.x = ox + ev.clientX - sx; cam.y = oy + ev.clientY - sy; applyCam(false);
    };
    const up = () => {
      root.removeEventListener("pointermove", move); root.removeEventListener("pointerup", up); root.classList.remove("panning", "dragging");
      if (!moved) select(shield ? [...frames.values()].find((f) => f.shield === shield)?.file : null);
    };
    root.addEventListener("pointermove", move); root.addEventListener("pointerup", up);
  });

  return {
    files: () => [...frames.keys()],
    get: (file) => frames.get(file),
    all: () => [...frames.values()],
    addFrame, removeFrame, select,
    removeAll: () => { for (const f of [...frames.keys()]) removeFrame(f); },
    selected: () => selected,
    reload: (file) => frames.get(file)?.view.reload(),
    fitAll: (animate) => fitBounds([...frames.values()], animate),
    focus: (file) => { const f = frames.get(file); if (!f) return; select(file); fitBounds([f]); },
    zoomBy: (k) => { const r = root.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, cam.z * k); },
    panBy: (dx, dy) => { cam.x += dx; cam.y += dy; applyCam(false); },
    zoom100: () => { const r = root.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1); },
    setCamera: (c, animate) => { if (c) { cam = { ...c }; applyCam(animate); } },
    camera: () => ({ ...cam }),
    zoomPercent: () => Math.round(cam.z * 100),
    setInspecting: (v) => { inspecting = v; updateShields(); for (const f of frames.values()) { try { f.view.send("studio-pan-wheel", "alt"); } catch { /* the page is not ready: dom-ready sends it */ } } },
    /** Auto arrange: flow the screens left to right, wrapping into rows, with no overlaps. Keeps the current reading order. */
    arrange: () => {
      const list = [...frames.values()].sort((a, b) => (Math.round(a.y / 400) - Math.round(b.y / 400)) || a.x - b.x);
      if (!list.length) return;
      const maxRow = Math.max(4600, ...list.map((f) => size(f).w));
      let x = 0, y = 0, rowH = 0;
      for (const f of list) {
        const d = size(f);
        if (x > 0 && x + d.w > maxRow) { x = 0; y += rowH + GAP + 150; rowH = 0; } // 150: room for the next row's title bar, which grows when zoomed out
        f.x = x; f.y = y; x += d.w + GAP; rowH = Math.max(rowH, d.h); layoutFrame(f);
      }
      onChange?.("layout"); fitBounds(list);
    },
    setScreenNotes,
    /** `map`: { file: description } of the screens. */
    setDescriptions: (map = {}) => { descs = map; for (const f of frames.values()) applyDesc(f); },
    /** Brings a note into view and focuses its text; `at` (world offset from the screen's top-left) is the place for a new note. */
    showNote: (file, id, at) => {
      const f = frames.get(file); if (!f) return;
      if (at) f.notePos[id] = { x: at.x, y: at.y, min: false };
      else if (notePos(f, id).min) f.notePos[id] = { ...notePos(f, id), min: false };
      layoutNote(f, id);
      const el = f.noteEls.get(id); if (!el) return;
      const r = root.getBoundingClientRect(), n = el.getBoundingClientRect();
      const dx = n.left < r.left + 8 ? r.left + 24 - n.left : n.right > r.right - 8 ? r.right - 24 - n.right : 0, dy = n.top < r.top + 70 ? r.top + 90 - n.top : n.bottom > r.bottom - 8 ? r.bottom - 24 - n.bottom : 0;
      if (dx || dy) { cam.x += dx; cam.y += dy; applyCam(true); }
      el.querySelector(".fn-text").focus();
    },
    setWorking: (file) => { workingFile = file; for (const f of frames.values()) f.el.classList.toggle("working", f.file === file); },
    setDeviceAll: (device) => { for (const f of frames.values()) { f.device = device; layoutFrame(f); } onChange?.("layout"); },
    layout: () => Object.fromEntries([...frames.values()].map((f) => [f.file, { x: f.x, y: f.y, device: f.device, ...(f.device === "custom" ? { w: f.w, h: f.h } : {}), ...(Object.keys(f.notePos).some((id) => f.noteEls.has(id)) ? { notes: Object.fromEntries(Object.entries(f.notePos).filter(([id]) => f.noteEls.has(id))) } : {}) }])),
  };
}
