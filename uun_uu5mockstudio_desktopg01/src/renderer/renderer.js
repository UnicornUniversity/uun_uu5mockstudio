import { createCanvas, DEVICES } from "./canvas.js";
import { createInspector, describePick, agentContext } from "./inspector.js";
import { createPropsPanel } from "./propsPanel.js";
import { createIconPicker } from "./iconPicker.js";
import { createMemory } from "./memory.js";
import { createRulesPanel } from "./rulesPanel.js";
import { createDescPanel } from "./descPanel.js";
import { createFsNote } from "./fsnote.js";
import { createSetup } from "./setup.js";
import { esc, markdown } from "./markdown.js";
import { createChatDock } from "./chatdock.js";

const $ = (id) => document.getElementById(id);

const log = $("log");
let port, webviewPreload = "", chatId = null, chatList = [], project = "", projectList = [], loading = false, ready = false, busy = false, setup = null;
/** Persisted chat: {kind:"user"|"ai"|"err"|"note", text} | {kind:"steps", steps:[{id,label,status}]} */
let entries = [];

log.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-href]"); if (a) window.studio.openExternal(a.dataset.href);
  const m = e.target.closest("a.mention"); if (m) canvas.focus(m.dataset.screen);
});

// ---------- chat rendering ----------
const TOOL_LABELS = {
  Skill: (i) => `Skill ${i.skill ?? ""}`, Read: (i) => `Reading ${base(i.file_path)}`, Write: (i) => `Writing ${base(i.file_path)}`,
  Edit: (i) => `Editing ${base(i.file_path)}`, MultiEdit: (i) => `Editing ${base(i.file_path)}`, Glob: () => "Searching files", Grep: () => "Searching file contents",
"mcp__studio-browser__browser_open": (i) => `Preview: opening ${i.file ?? ""}`,
  "mcp__studio-browser__browser_reload": () => "Preview: reload and check", "mcp__studio-browser__browser_console": () => "Preview: reading console",
  "mcp__studio-browser__browser_snapshot": () => "Preview: snapshot", "mcp__studio-browser__browser_screenshot": () => "Preview: screenshot",
};
const base = (p) => (p ?? "").split("/").pop();
const labelOf = (b) => (TOOL_LABELS[b.name]?.(b.input ?? {}) ?? b.name).trim();

function entryEl(e) {
  if (e.kind === "steps") {
    const d = document.createElement("details"); d.className = "steps";
    const running = e.steps.find((s) => s.status === "run");
    d.open = d.dataset.open === "1";
    d.innerHTML = `<summary><span class="st ${running ? "run" : "ok"}"></span>${running ? esc(running.label) : `${e.steps.length} ${e.steps.length === 1 ? "step" : "steps"}`}</summary><ul>${
      e.steps.map((s) => `<li><span class="st ${s.status}"></span> ${esc(s.label)}</li>`).join("")}</ul>`;
    return d;
  }
  const el = document.createElement("div");
  el.className = `msg ${e.kind === "note" ? "note" : e.kind === "err" ? "err" : e.kind}`;
  if (e.kind === "ai") el.innerHTML = markdown(e.text);
  else if (e.kind === "user") {
    el.innerHTML = highlightMentions(e.text);
    if (e.images?.length) { const row = Object.assign(document.createElement("div"), { className: "atts" }); for (const im of e.images) row.append(Object.assign(document.createElement("img"), { src: im.thumb, alt: im.name ?? "attachment", title: im.name ?? "" })); el.append(row); }
  }
  else el.textContent = e.text;
  return el;
}
const nodes = new WeakMap();
function paint(e) {
  const old = nodes.get(e), el = entryEl(e);
  if (old?.tagName === "DETAILS") el.open = old.open;
  old ? old.replaceWith(el) : log.append(el);
  nodes.set(e, el); log.scrollTop = log.scrollHeight;
}
let saveTimer;
const chatSnapshot = () => entries.filter((e) => e.kind !== "steps" || e.steps.length);
const persist = () => {
  if (loading) return;
  const p = project, cid = chatId, snap = chatSnapshot(); // captured now: the user may switch project or conversation before the timer fires
  clearTimeout(saveTimer); saveTimer = setTimeout(() => window.studio.saveChat(p, cid, snap), 400);
};
function push(e) { entries.push(e); paint(e); persist(); return e; }
const last = () => entries[entries.length - 1];

// ---------- model selector: what "Default" resolves to ----------
const DEFAULT_MODEL_KEY = "uu5studio.defaultModel";
const prettyModel = (id) => { const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id ?? ""); return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : id; };
function showDefaultModel(id) {
  const opt = $("model").querySelector('option[value=""]');
  opt.textContent = id ? `Default (${prettyModel(id)})` : "Default";
  $("model").title = id ? `Default = the model from your Claude Code: ${id}. Pick another one to override it for the next requests.` : "Default = the model configured in your Claude Code.";
}
try { showDefaultModel(localStorage.getItem(DEFAULT_MODEL_KEY)); } catch { showDefaultModel(null); }
let sentModel = "";
function learnDefaultModel(id) {
  if (sentModel !== "" || !id) return; // only when no explicit model was requested
  try { localStorage.setItem(DEFAULT_MODEL_KEY, id); } catch {}
  showDefaultModel(id);
}

// ---------- "Claude is working" indicator ----------
const WORK = {
  Skill: "Loading rules and templates…", Read: "Reading files…", Glob: "Searching files…", Grep: "Searching file contents…",
  Write: "Writing the mockup…", Edit: "Editing the mockup…", MultiEdit: "Editing the mockup…",
  "mcp__studio-browser__browser_open": "Opening the preview…", "mcp__studio-browser__browser_reload": "Verifying the render…",
  "mcp__studio-browser__browser_console": "Reading the console…", "mcp__studio-browser__browser_snapshot": "Checking the content…", "mcp__studio-browser__browser_screenshot": "Taking a screenshot…",
};
const EMPTY_TEXT = "No mockup yet. Describe it in the chat.";
let workStart = 0, workTimer;
// Which screen the agent is working on: shown on the canvas frame, its tab and (in fullscreen) the fullscreen bar.
let workFile = null;
function setWorkFile(file) {
  workFile = file; canvas.setWorking(file); renderTabs();
  $("fs").classList.toggle("working", Boolean(file) && file === fsFile);
}
const toolFile = (b) => { const i = b.input ?? {}, p = i.file_path ?? i.path ?? i.file; return typeof p === "string" && p.endsWith(".html") ? p.split("/").pop() : null; };
function updateScreenCtx() {
  const el = $("screenctx");
  el.hidden = !fsFile; if (!fsFile) return;
  el.replaceChildren("Working on ", Object.assign(document.createElement("b"), { textContent: fsFile.replace(/\.html$/, "") }), " (fullscreen)");
}
function setWork(label) { if (busy) $("work-label").textContent = label; }
function tickWork() { const s = Math.round((Date.now() - workStart) / 1000); $("work-time").textContent = s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; }
function setBusy(b) {
  const was = busy; busy = b; setup?.paintStrip();
  $("stop").hidden = !b; $("send").hidden = b; $("send").disabled = !ready || !project;
  $("working").hidden = !b; $("chatbusy").hidden = !b;
  clearInterval(workTimer);
  if (!b && workFile) setWorkFile(null);
  if (b) {
    if (!was) { workStart = Date.now(); $("work-label").textContent = "Thinking…"; }
    tickWork(); workTimer = setInterval(tickWork, 1000);
  }
  const empty = $("empty"); empty.classList.toggle("working", b);
  $("empty-text").textContent = b ? "Claude is preparing a screen…" : EMPTY_TEXT;
}
function finishSteps(status) { for (const e of entries) if (e.kind === "steps") { for (const s of e.steps) if (s.status === "run") s.status = status; paint(e); } }

window.studio.onEvent((m) => {
  if (m.type === "system" && m.subtype === "init") learnDefaultModel(m.model);
  if (m.type === "stream_event" && m.event?.type === "content_block_start") {
    const b = m.event.content_block;
    if (b?.type === "tool_use") setWork(WORK[b.name] ?? "Working…");
    else if (b?.type === "thinking") setWork("Thinking…");
    else if (b?.type === "text") setWork("Writing the answer…");
  } else if (m.type === "stream_event" && m.event?.delta?.type === "text_delta") {
    setWork("Writing the answer…");
    let e = last(); if (e?.kind !== "ai" || e.done) e = push({ kind: "ai", text: "" });
    e.text += m.event.delta.text; paint(e);
  } else if (m.type === "assistant") {
    const e = last(); if (e?.kind === "ai") e.done = true;
    for (const b of m.message.content) if (b.type === "tool_use") {
      let g = last(); if (g?.kind !== "steps") g = push({ kind: "steps", steps: [] });
      g.steps.push({ id: b.id, label: labelOf(b), status: "run" }); paint(g);
      setWork(WORK[b.name] ?? labelOf(b));
      const wf = toolFile(b); if (wf) setWorkFile(wf);
    }
  } else if (m.type === "user" && Array.isArray(m.message?.content)) {
    for (const b of m.message.content) if (b.type === "tool_result") for (const g of entries) if (g.kind === "steps") {
      const s = g.steps.find((x) => x.id === b.tool_use_id); if (s) { s.status = b.is_error ? "bad" : "ok"; paint(g); persist(); }
    }
    setWork("Thinking…");
  } else if (m.type === "result") {
    finishSteps("ok"); setBusy(false); persist();
    if (m.is_error) push({ kind: "err", text: `Error: ${m.result ?? m.subtype}` });
  } else if (m.type === "stopped") {
    finishSteps("bad"); setBusy(false); push({ kind: "note", text: "Zastaveno" });
  } else if (m.type === "app_error") {
    finishSteps("bad"); setBusy(false); push({ kind: "err", text: m.message }); checkClaude(true);
  }
});

// ---------- canvas (frames, zoom/pan, devices) ----------
let saveLayoutTimer, savedLayout = {}, rules = null, desc = null;
const persistLayout = () => {
  if (loading || !project) return;
  const p = project, layout = { frames: canvas.layout(), camera: canvas.camera() };
  clearTimeout(saveLayoutTimer); saveLayoutTimer = setTimeout(() => window.studio.saveLayout(p, layout), 500);
};
const inspector = createInspector({ onPick: showPick, onEscape: () => setInspect(false) });
const canvas = createCanvas({
  root: $("canvas"), world: $("world"), preloadUrl: () => webviewPreload, urlFor: (f) => `http://127.0.0.1:${port}/${encodeURIComponent(project)}/${encodeURIComponent(f)}`,
  onReady: (file, id) => window.studio.registerView(file, id),
  onDelete: (file) => deleteScreen(file),
  onFullscreen: (file) => toggleFullscreen(file),
  onRequestSize: askSize,
  onGone: (file) => { window.studio.unregisterView(file); renderTabs(); },
  onChange: (what) => { $("zpct").textContent = canvas.zoomPercent() + "%"; persistLayout(); },
  onNoteEdit: (f, id, t) => memory.noteEdited(f, id, t), onNoteBlur: (f, id, t) => memory.noteBlurred(f, id, t), onNoteDelete: (f, id) => memory.deleteNote(f, id),
  onContextMenu: (ev) => showContextMenu(ev),
  onDescClick: (file) => openDesc(file),
  onSelect: () => { renderTabs(); updateSelbar(); },
  onPageReady: (f) => inspector.injectIfOn(f.view),
});
function syncFrames(screens) {
  for (const f of screens) if (!canvas.get(f)) {
    const fr = canvas.addFrame(f, savedLayout[f]);
    fr.view.addEventListener("console-message", (e) => inspector.handleConsole(f, e.message));
  }
  for (const f of canvas.files()) if (!screens.includes(f)) canvas.removeFrame(f);
  $("empty").hidden = screens.length > 0; renderTabs(); desc?.refreshScreens();
}
function renderTabs() {
  const keep = $("tabs").scrollLeft; // replaceChildren would reset the strip to the left
  $("tabs").replaceChildren(...canvas.files().map((s) => {
    const t = Object.assign(document.createElement("div"), { className: `tab${s === canvas.selected() ? " on" : ""}${s === workFile ? " working" : ""}`, title: s });
    t.append(Object.assign(document.createElement("span"), { textContent: s.replace(".html", "") }));
    const x = Object.assign(document.createElement("button"), { className: "x", title: "Delete screen" });
    x.setAttribute("aria-label", "Delete screen"); x.innerHTML = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
    x.onclick = (e) => { e.stopPropagation(); deleteScreen(s); };
    t.append(x); t.onclick = () => canvas.focus(s); return t;
  }));
  $("tabs").scrollLeft = keep;
  $("tabs").querySelector(".tab.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
// a mouse wheel scrolls the tab strip sideways (trackpads already send horizontal deltas)
$("tabs").addEventListener("wheel", (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); $("tabs").scrollLeft += e.deltaY; } }, { passive: false });
async function deleteScreen(file) {
  const name = file.replace(/\.html$/, "");
  const ok = await askConfirm({ title: `Delete the screen “${name}”?`, detail: `The file ${file} will be removed from the project “${project}”. It is moved to the trash, so you can restore it.`, ok: "Delete screen" });
  if (!ok) return;
  const r = await window.studio.deleteScreen(file);
  if (r?.canceled) return;
  if (r?.error) toast(r.error, { err: true }); else toast(`The screen ${file.replace(".html", "")} was deleted (the file is in the trash).`);
}
window.studio.onNavigated((file) => { if (canvas.get(file)) canvas.focus(file); });
window.studio.onPreviewChanged(({ project: p, screens, changed }) => {
  if (p !== project) return;
  const fresh = screens.filter((f) => !canvas.get(f));
  syncFrames(screens);
  for (const f of changed) if (!fresh.includes(f)) canvas.reload(f);
  for (const f of changed) propsPanel.refresh(f); // the inspector re-reads the picked component (or clears when it is gone)
  if (fsFile && changed.includes(fsFile)) fsView?.reload();
  if (fsFile && !screens.includes(fsFile)) closeFullscreen();
  if (fresh.length) canvas.focus(fresh[fresh.length - 1]);
});
$("zin").onclick = () => canvas.zoomBy(1.25); $("zout").onclick = () => canvas.zoomBy(0.8);
$("zpct").onclick = () => canvas.zoom100(); $("fit").onclick = () => canvas.fitAll(true);
$("alldev").onchange = (e) => { if (e.target.value) canvas.setDeviceAll(e.target.value); e.target.value = ""; };
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); toggleFullscreen(canvas.selected()); return; }
  if (fsFile || confirmOpen) return;
  if (e.target.matches("textarea,input,select")) return;
  if ((e.metaKey || e.ctrlKey) && e.key === "0") { e.preventDefault(); canvas.fitAll(true); }
  else if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); canvas.zoomBy(1.25); }
  else if ((e.metaKey || e.ctrlKey) && e.key === "-") { e.preventDefault(); canvas.zoomBy(0.8); }
  else if (e.key === "i" && !e.metaKey && !e.ctrlKey) setInspect(!inspector.on);
  else if ((e.key === "Delete" || e.key === "Backspace") && canvas.selected() && !inspector.on) { e.preventDefault(); deleteScreen(canvas.selected()); }
  else if (e.key === "Escape") { if (inspector.on) setInspect(false); else canvas.select(null); }
});

// ---------- inspector ----------
// chat mode: the picker works without the side panel; every click adds the component to the message being written
let chatPick = false;
function setInspect(v, { chat = false } = {}) {
  chatPick = v && chat;
  inspector.set(v, canvas.all().map((f) => f.view)); canvas.setInspecting(v);
  $("inspect").classList.toggle("on", v && !chatPick); $("pickcomp").classList.toggle("on", chatPick);
  $("inspector").hidden = !v || chatPick; $("pickhint").hidden = !chatPick;
  if (!v || chatPick) propsPanel.clear();
}
$("inspect").onclick = () => setInspect(!inspector.on || chatPick);
$("pickcomp").onclick = () => { if (!project) return; setInspect(!chatPick, { chat: true }); };
const iconPicker = createIconPicker({ getCatalog: () => window.studio.iconCatalog() });
const propsPanel = createPropsPanel({
  api: { pickIcon: (o) => iconPicker.pick(o), ensureIconFonts: (b) => iconPicker.ensureFonts(b), setBranch: window.studio.jsxSetBranch, inspect: window.studio.jsxInspect, set: window.studio.jsxSet, remove: window.studio.jsxRemove, openExternal: window.studio.openExternal },
  onUse: (p) => { addChip(p); $("prompt").focus(); },
});
async function showPick(p) {
  if (!chatPick) return propsPanel.show(p);
  // chat mode: resolve names and the source of the component, then add it to the message
  let r = await window.studio.jsxInspect(p.file, p.chain, p.sub);
  let sub = p.sub;
  if (r?.error && p.sub) { sub = null; r = await window.studio.jsxInspect(p.file, p.chain, null); }
  if (r?.error) return toast(r.error, { err: true });
  addChip({ ...p, chain: r.chain, element: r.element, sub: r.element.item ? sub : null });
}
// components picked for the message being written (several can be added)
let chips = [];
const MAX_CHIPS = 8;
const chipKey = (p) => `${p.file}#${(p.chain ?? []).map((c) => (typeof c === "number" ? c : c.ordinal)).join(",")}|${p.sub ? `${p.sub.prop}[${p.sub.index}]` : ""}`;
function renderChips() {
  const box = $("chips"); box.hidden = !chips.length; box.replaceChildren();
  chips.forEach((c, i) => {
    const t = Object.assign(document.createElement("span"), { textContent: "📍 " + describePick(c), title: describePick(c) });
    const x = Object.assign(document.createElement("button"), { type: "button", title: "Remove", textContent: "✕", onclick: () => { chips.splice(i, 1); renderChips(); } });
    const chip = Object.assign(document.createElement("div"), { className: "chip" });
    chip.append(t, x); box.append(chip);
  });
}
function addChip(p) {
  if (chips.some((c) => chipKey(c) === chipKey(p))) return toast("That component is already in the message.");
  if (chips.length >= MAX_CHIPS) return toast(`At most ${MAX_CHIPS} components per message.`);
  chips.push(p); renderChips();
}
function clearChips() { chips = []; renderChips(); }

// ---------- project menu: export + offline CDN cache ----------
let toastTimer;
function toast(msg, { reveal, err, action } = {}) {
  const t = $("toast"); t.className = err ? "err" : ""; t.textContent = msg; t.hidden = false;
  if (action) { const a = Object.assign(document.createElement("a"), { textContent: action.label }); a.onclick = action.run; t.append(a); }
  if (reveal) { const a = Object.assign(document.createElement("a"), { textContent: "Show" }); a.onclick = () => window.studio.reveal(reveal); t.append(a); }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), err ? 8000 : 5000);
}
const mb = (n) => (n / 1048576).toFixed(1);
async function refreshCdn(st) {
  st ??= await window.studio.cdnStatus();
  $("cdn-info").textContent = `CDN cache: ${st.files} files · ${mb(st.bytes)} MB${st.offline ? " · OFFLINE" : ""}`;
  $("offline-box").textContent = st.offline ? "☑" : "☐";
  $("menubtn").classList.toggle("warn", st.offline);
}
/** Bring a frame fully into view (a hidden/clipped webview may not paint) before it is captured. */
async function showFrame(file) { canvas.focus(file); await new Promise((r) => setTimeout(r, 700)); }
const closeMenu = () => ($("menu").hidden = true);
$("menubtn").onclick = (e) => { e.stopPropagation(); $("menu").hidden = !$("menu").hidden; if (!$("menu").hidden) refreshCdn(); };
addEventListener("click", (e) => { if (!e.target.closest("#menu")) closeMenu(); });
window.studio.onCdnProgress((p) => toast(`Warming up the cache (${p.index + 1}/${p.total}): ${p.name}…`));
const report = (r, ok) => { if (r?.error) toast(r.error, { err: true }); else if (r?.path && !r.canceled) toast(ok(r), { reveal: r.path }); };
const notifyShare = (r) => { if (r?.error) toast(r.error, { err: true }); else if (r?.method === "eml") toast("An e-mail draft with the attachment is open in your mail client."); };

// ---------- custom screen size dialog ----------
function askSize({ w, h }) {
  return new Promise((resolve) => {
    const box = $("sizebox"), iw = $("sz-w"), ih = $("sz-h");
    iw.value = w; ih.value = h; $("sz-err").textContent = ""; box.hidden = false; iw.focus(); iw.select();
    const done = (v) => { box.hidden = true; box.onkeydown = null; box.firstElementChild.onsubmit = null; $("sz-cancel").onclick = null; resolve(v); };
    $("sz-cancel").onclick = () => done(null);
    box.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); } };
    box.firstElementChild.onsubmit = (e) => {
      e.preventDefault();
      const nw = Number(iw.value), nh = Number(ih.value), ok = (n) => Number.isInteger(n) && n >= 200 && n <= 10000;
      if (!ok(nw) || !ok(nh)) { $("sz-err").textContent = "Enter whole numbers from 200 to 10000."; return; }
      done({ w: nw, h: nh });
    };
  });
}

// ---------- confirmation dialog (in-app, replaces the native one) ----------
let confirmOpen = false;
function askConfirm({ title, detail = "", ok = "Delete", danger = true }) {
  if (confirmOpen) return Promise.resolve(false);
  confirmOpen = true;
  return new Promise((resolve) => {
    const box = $("confirm"), okBtn = $("cf-ok"), cancel = $("cf-cancel");
    $("cf-title").textContent = title; $("cf-detail").textContent = detail;
    okBtn.textContent = ok; okBtn.classList.toggle("danger", danger);
    box.hidden = false; cancel.focus(); // default action is the safe one
    const done = (v) => { box.hidden = true; confirmOpen = false; box.onclick = null; box.onkeydown = null; okBtn.onclick = cancel.onclick = null; resolve(v); };
    okBtn.onclick = () => done(true); cancel.onclick = () => done(false);
    box.onclick = (e) => { if (e.target === box) done(false); };
    box.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } };
  });
}

// ---------- fullscreen preview ----------
let fsFile = null, fsView = null, fsWrap = null;
/** The webview always fills its wrapper; only the wrapper is sized (webviews keep a stale guest viewport when resized directly). */
function layoutFullscreen() {
  if (!fsWrap) return;
  const dev = DEVICES[$("fsdev").value];
  fsWrap.classList.toggle("dev", Boolean(dev));
  if (!dev) { fsWrap.style.cssText = ""; return; }
  const st = $("fsstage").getBoundingClientRect(), k = Math.min(1, (st.width - 40) / dev.w, (st.height - 40) / dev.h);
  Object.assign(fsWrap.style, { width: dev.w + "px", height: dev.h + "px", transform: `scale(${k})` });
}
async function openFullscreen(file) {
  if (fsFile) closeFullscreen();
  fsFile = file; updateScreenCtx(); fsNote.open(); fsNote.set(memory.notesOf(file)); updateNoteButton(); $("fs").classList.toggle("working", file === workFile); $("fsname").textContent = file.replace(/\.html$/, ""); $("fsdev").value = "";
  fsView = document.createElement("webview");
  fsView.setAttribute("preload", webviewPreload); fsView.setAttribute("webpreferences", "backgroundThrottling=no");
  fsView.addEventListener("ipc-message", (e) => { if (e.channel === "studio-fullscreen") closeFullscreen(); });
  fsView.src = `http://127.0.0.1:${port}/${encodeURIComponent(project)}/${encodeURIComponent(file)}`;
  fsWrap = Object.assign(document.createElement("div"), { className: "fswrap" }); fsWrap.append(fsView);
  $("fsstage").replaceChildren(fsWrap); $("fs").hidden = false; layoutFullscreen();
  dock.enterFullscreen(); // the chat stays available as a floating window above the preview
  await window.studio.setFullScreen(true);
  fsView.addEventListener("dom-ready", () => fsView?.focus(), { once: true });
}
function closeFullscreen() {
  if (!fsFile) return;
  fsFile = null; fsNote.close(); fsView = null; fsWrap = null; $("fsstage").replaceChildren(); $("fs").hidden = true; $("fs").classList.remove("working"); updateScreenCtx();
  dock.exitFullscreen();
  window.studio.setFullScreen(false);
}
function toggleFullscreen(file) { if (fsFile) closeFullscreen(); else if (file) openFullscreen(file); }
$("fsclose").onclick = closeFullscreen;
$("fsreload").onclick = () => fsView?.reload();
$("fsdev").onchange = layoutFullscreen;
addEventListener("resize", layoutFullscreen);

// ---------- @ mentions of screens ----------
const screenNames = () => canvas.files().map((f) => f.replace(/\.html$/, ""));
const trimPunct = (n) => n.replace(/[.,;:!?)\]]+$/, "");
/** Names of existing screens mentioned as @name in a text (in order, unique). */
function mentionedScreens(text) {
  const known = new Set(screenNames()), out = [];
  for (const m of text.matchAll(/(^|\s)@([^\s@]+)/g)) { const n = trimPunct(m[2]); if (known.has(n) && !out.includes(n)) out.push(n); }
  return out;
}
/** Paths of repository files mentioned as @repo/<path> (in order, unique). */
function mentionedRepoFiles(text) {
  const out = [];
  for (const m of text.matchAll(/(^|\s)@repo\/([^\s@]+)/g)) { const p = trimPunct(m[2]); if (p && !out.includes(p)) out.push(p); }
  return out;
}
function highlightMentions(text) {
  const known = new Set(screenNames());
  return esc(text).replace(/(^|\s)@([^\s@]+)/g, (all, pre, name) => {
    if (name.startsWith("repo/")) { const base = trimPunct(name); return `${pre}<span class="mention repo" title="File of the linked repository">@${esc(base)}</span>${esc(name.slice(base.length))}`; }
    const base = trimPunct(name);
    return known.has(base) ? `${pre}<a class="mention" data-screen="${esc(base)}.html">@${esc(base)}</a>${esc(name.slice(base.length))}` : all;
  });
}
let mentionIdx = 0;
function mentionContext() {
  const t = $("prompt"), before = t.value.slice(0, t.selectionStart), m = before.match(/(^|\s)@([^\s@]*)$/);
  return m ? { start: t.selectionStart - m[2].length - 1, query: m[2].toLowerCase() } : null;
}
let mentionSeq = 0;
/** Suggestions after "@": screens first, then (when a repository is linked) its files as @repo/<path>. */
async function updateMentions() {
  const box = $("mentions"), ctx = mentionContext(), seq = ++mentionSeq;
  const names = ctx ? screenNames().filter((n) => n.toLowerCase().includes(ctx.query)).slice(0, 6) : [];
  let files = [];
  if (ctx && repo && !repo.error) {
    const q = ctx.query.startsWith("repo/") ? ctx.query.slice(5) : ctx.query;
    if (ctx.query.startsWith("repo") || q.length >= 2) files = ((await window.studio.repoFiles(q)) ?? []).slice(0, 8).map((p) => `repo/${p}`);
    if (seq !== mentionSeq) return; // a newer keystroke is already being answered
  }
  const items = [...names, ...files];
  if (!items.length) { box.hidden = true; return; }
  mentionIdx = Math.min(mentionIdx, items.length - 1);
  box.replaceChildren(...items.map((n, i) => Object.assign(document.createElement("button"), {
    type: "button", textContent: "@" + n, className: i === mentionIdx ? "on" : "",
    onmousedown: (e) => { e.preventDefault(); insertMention(n); },
  })));
  box.hidden = false;
}
function insertMention(name) {
  const t = $("prompt"), ctx = mentionContext();
  if (ctx) { t.value = t.value.slice(0, ctx.start) + "@" + name + " " + t.value.slice(t.selectionStart); t.selectionStart = t.selectionEnd = ctx.start + name.length + 2; }
  else { const sep = t.value && !/\s$/.test(t.value.slice(0, t.selectionStart)) ? " " : ""; t.setRangeText(sep + "@" + name + " ", t.selectionStart, t.selectionEnd, "end"); }
  $("mentions").hidden = true; mentionIdx = 0; t.focus();
}
$("prompt").addEventListener("input", () => { mentionIdx = 0; updateMentions(); });
$("prompt").addEventListener("click", updateMentions);
$("prompt").addEventListener("blur", () => setTimeout(() => ($("mentions").hidden = true), 120));

// ---------- project memory: linked repository, business rules, notes of a screen ----------
let repo = null; // { path, name, branch } | { path, name, error } | null
/** Always-visible line under the chat header: the git repository the project is linked to, the branch Claude reads and Unlink. */
function showRepo(r) {
  repo = r;
  const strip = $("repostrip"); strip.hidden = !r; strip.classList.toggle("err", Boolean(r?.error)); $("branchmenu").hidden = true;
  if (!r) return;
  $("rs-name").textContent = r.error ? `${r.name} (not available)` : r.name;
  const shown = r.view || r.branch; $("rs-branch").textContent = shown ? `${shown} ▾` : ""; $("rs-branch").hidden = !shown || Boolean(r.error);
  $("rs-branch").title = r.view ? `Claude reads a snapshot of branch ${r.view} (the checked-out branch is ${r.branch || "?"}). Click to change.` : "Claude reads the checked-out branch. Click to read another branch.";
  $("rs-note").textContent = r.error ? "check the folder" : r.view ? "snapshot · read-only" : "read-only for Claude";
  $("rs-main").title = `${r.error ? `Linked git repository is not available: ${r.error}` : "Linked git repository (Claude reads it, never writes)"}\n${r.path}${r.branch ? `\nChecked out: ${r.branch}` : ""}\nClick to open the folder`;
}
$("rs-main").onclick = async () => { const r = repo && (await window.studio.repoOpen()); if (r?.error) toast(r.error, { err: true }); }; // opens the repository folder itself in the file manager
$("rs-unlink").onclick = async () => { await window.studio.repoUnlink(); showRepo(null); toast("Repository unlinked."); };
$("rs-branch").onclick = async (e) => {
  e.stopPropagation();
  const m = $("branchmenu"); if (!m.hidden) { m.hidden = true; return; }
  const r = await window.studio.repoBranches(); if (r?.error) return toast(r.error, { err: true });
  const active = r.view || r.current;
  const item = (b) => {
    const btn = document.createElement("button"); btn.className = b.name === active ? "cur" : "";
    btn.append(Object.assign(document.createElement("span"), { textContent: b.name }), Object.assign(document.createElement("small"), { textContent: b.name === r.current ? "checked out" : b.remote ? "remote" : "" }));
    btn.onclick = () => pickBranch(b.name);
    return btn;
  };
  m.replaceChildren(...r.branches.map(item), document.createElement("hr"),
    Object.assign(document.createElement("div"), { className: "mute", textContent: "Claude reads the branch you pick as a read-only snapshot. Your checkout and the files in the repository are never changed." }));
  const br = $("rs-branch").getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(br.left, innerWidth - 308)) + "px"; m.style.top = br.bottom + 6 + "px"; m.hidden = false;
};
addEventListener("click", (e) => { if (!e.target.closest("#branchmenu")) $("branchmenu").hidden = true; });
async function pickBranch(name) {
  $("branchmenu").hidden = true; $("rs-note").textContent = "preparing…";
  const r = await window.studio.repoSetBranch(name);
  if (r?.error) { showRepo(repo); return toast(r.error, { err: true }); }
  showRepo(r); toast(r.view ? `Claude now reads branch ${r.view} of ${r.name} (read-only snapshot).` : `Claude reads the checked-out branch ${r.branch} of ${r.name}.`);
}
// ---------- project memory: business rules, notes of a screen ----------
const memory = createMemory({
  api: window.studio, toast, getScreens: () => canvas.files(),
  setCards: (file, notes) => { canvas.setScreenNotes(file, notes); if (file === fsFile) fsNote.set(notes); },
  onNotes: () => updateNoteButton(),
});
// the notes of the screen that is open in fullscreen
const fsNote = createFsNote({
  host: $("fs"), onEdit: (id, t) => fsFile && memory.noteEdited(fsFile, id, t), onDelete: (id) => fsFile && memory.deleteNote(fsFile, id),
  onBlur: (id, t) => fsFile && memory.noteBlurred(fsFile, id, t), onAdd: () => fsFile && addNote(fsFile),
});
/** A new note on a screen: an empty card next to it (at `at` when given, e.g. where the user right-clicked) with the cursor in it. */
async function addNote(file, at) {
  const id = await memory.addNote(file);
  if (file === fsFile) fsNote.focus(id); else canvas.showNote(file, id, at);
  return id;
}
$("fsnotebtn").onclick = () => fsFile && addNote(fsFile);
const updateNoteButton = () => {
  $("fsnotebtn").textContent = fsFile && memory.count(fsFile) ? `Add note (${memory.count(fsFile)})` : "Add note";
};
const REVEAL_LABEL = { darwin: "Show in Finder", win32: "Show in Explorer" }[window.studio.platform] ?? "Show in folder"; // what the file button does
// the business rules: a dialog from the toolbar icon; the icon shows how many rules there are
rules = createRulesPanel({
  api: window.studio, getScreens: () => canvas.files(),
  onCount: (n) => { const b = $("rulesbadge"); b.textContent = n > 99 ? "99+" : String(n); b.hidden = n === 0; $("rulesbtn").title = n ? `Business rules of this project (${n})` : "Business rules of this project"; },
});
const openRules = (screen) => project && rules.open({ screen: typeof screen === "string" ? screen : undefined });
$("rulesbtn").onclick = openRules;
// the description of the project and of its screens (PROJECT.md): a strip above the canvas, a dialog of its own
desc = createDescPanel({
  api: window.studio, getScreens: () => canvas.files(),
  onScreens: (map) => canvas.setDescriptions(map),
  onProject: (text) => { $("descstrip").hidden = text == null; $("ds-text").textContent = text ?? ""; $("ds-main").title = text ? `${text}\n\nClick to edit the description` : "Click to add a project description"; },
});
const openDesc = (focus) => project && desc.open({ focus });
$("ds-main").onclick = () => openDesc(null);
window.studio.onMemoryChanged((ev) => {
  if (ev.project !== project) return;
  memory.changed(ev);
  if (ev.kind === "rules") rules.reload();
  if (ev.kind === "project") desc.reload();
  if (ev.kind === "rules") toast(`Business rules updated${ev.added.length ? `: ${ev.added.length} added` : ""}${ev.removed.length ? `, ${ev.removed.length} removed` : ""}.`, { action: { label: "Show", run: openRules } });
});
async function linkRepoFlow() {
  const r = await window.studio.repoLink();
  if (r?.canceled) return;
  if (r?.error) return toast(r.error, { err: true });
  showRepo(r); toast(`Repository ${r.name}${r.branch ? ` (${r.branch})` : ""} linked, read-only for Claude. Mention its files with @repo/…`);
}

// ---------- right click on a screen ----------
function showContextMenu({ file, clientX, clientY, at }) {
  canvas.select(file);
  const m = $("ctxmenu"), name = file.replace(/\.html$/, "");
  const items = [
    [at ? "Add note here" : "Add note", () => addNote(file, at)], ["Add rule…", () => openRules(file)], ["Open fullscreen", () => openFullscreen(file)], ["Mention in chat", () => insertMention(name)],
    ["Description…", () => openDesc(file)], [REVEAL_LABEL, () => window.studio.revealScreen(file)], null, ["Delete screen…", () => deleteScreen(file), true],
  ];
  m.replaceChildren(...items.map((it) => it ? Object.assign(document.createElement("button"), { textContent: it[0], className: it[2] ? "danger" : "", onclick: () => { m.hidden = true; it[1](); } }) : document.createElement("hr")));
  m.style.left = Math.min(clientX, innerWidth - 220) + "px"; m.style.top = Math.min(clientY, innerHeight - 40 * items.length) + "px"; m.hidden = false;
}
addEventListener("click", () => { $("ctxmenu").hidden = true; });
addEventListener("keydown", (e) => { if (e.key === "Escape") $("ctxmenu").hidden = true; });
addEventListener("blur", () => { $("ctxmenu").hidden = true; });

// ---------- actions on the selected screen (bar above the canvas) ----------
const SCREEN_MENUS = {
  export: [["image", "Image… (PNG, JPEG, PDF)"], ["copy-html", "Save a copy of the HTML…"]],
  // on macOS these open the system share sheet (contacts and apps such as Messages, Mail, AirDrop, WhatsApp, Signal); elsewhere an e-mail draft
  share: [["share-png", "Share image…"], ["share-html", "Share HTML file…"], ["share-zip", "Share the whole project (ZIP)…"]],
};
function updateSelbar() {
  const f = canvas.selected();
  $("selbar").hidden = !f; $("selmenu").hidden = true;
  $("selname").textContent = f ? f.replace(".html", "") : ""; updateNoteButton();
  for (const b of $("selbar").querySelectorAll("button.on")) b.classList.remove("on");
  drags.clear(); for (const c of $("selbar").querySelectorAll(".dchip")) delete c.dataset.state; // a different screen: prepare again
}
async function screenAction(act, file) {
  if (act === "copy-html") report(await window.studio.exportHtml(file), (r) => `Saved: ${r.path.split("/").pop()}`);
  else if (act === "image") { await showFrame(file); report(await window.studio.exportImage(file), (r) => `Image saved: ${r.path.split("/").pop()}`); }
  else if (act === "fullscreen") openFullscreen(file);
  else if (act === "more") { const r = $("morebtn").getBoundingClientRect(); showContextMenu({ file, clientX: r.left, clientY: r.bottom + 6 }); }
  else if (act === "reveal") window.studio.revealScreen(file);
  else if (act.startsWith("share-")) { const kind = act.slice(6); if (kind === "png") await showFrame(file); notifyShare(await window.studio.shareMail(kind, file)); }
}
// ----- drag the selected screen as a file (into WhatsApp, Signal, Teams, Mail, a folder, ...)
const drags = new Map(); // kind -> { file, path, at }
// one of the two is always chosen (and remembered); only the chosen one can be dragged
let dragKind = (() => { try { return localStorage.getItem("uu5studio.dragKind") === "html" ? "html" : "png"; } catch { return "png"; } })();
function applyDragKind() {
  for (const c of document.querySelectorAll("#seldrag .dchip")) {
    const on = c.dataset.drag === dragKind;
    c.classList.toggle("on", on); c.draggable = on; c.setAttribute("aria-pressed", String(on));
    c.title = on ? "Drag this into a chat, a mail or a folder" : "Click to drag this instead";
  }
}
applyDragKind();
async function prepareDrag(chip) {
  const file = canvas.selected(), kind = chip.dataset.drag; if (!file) return;
  const have = drags.get(kind);
  if (have && have.file === file && Date.now() - have.at < 15000 && have.path) return;
  chip.dataset.state = "preparing"; drags.set(kind, { file, path: null, at: Date.now() });
  const r = await window.studio.dragPrepare(kind, file);
  if (r?.error) { delete chip.dataset.state; drags.delete(kind); return toast(r.error, { err: true }); }
  drags.set(kind, { file, path: r.path, at: Date.now() }); chip.dataset.state = "ready";
}
for (const chip of document.querySelectorAll("#seldrag .dchip")) {
  chip.addEventListener("pointerenter", () => chip.dataset.drag === dragKind && prepareDrag(chip));
  chip.addEventListener("click", () => {
    dragKind = chip.dataset.drag; try { localStorage.setItem("uu5studio.dragKind", dragKind); } catch { /* not persisted */ }
    applyDragKind(); prepareDrag(chip);
  });
  chip.addEventListener("dragstart", (e) => {
    e.preventDefault();
    if (chip.dataset.drag !== dragKind) return;
    const d = drags.get(chip.dataset.drag);
    if (!d?.path || d.file !== canvas.selected()) return toast("The file is still being prepared: try again in a moment.");
    window.studio.dragStart(d.path);
  });
}
$("selbar").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  e.stopPropagation();
  const file = canvas.selected(); if (!file) return;
  if (b.dataset.act) return screenAction(b.dataset.act, file);
  const m = $("selmenu"), open = !m.hidden && m.dataset.for === b.dataset.menu;
  m.hidden = true; updateSelbar(); if (open) return;
  m.replaceChildren(...SCREEN_MENUS[b.dataset.menu].map(([act, label]) => Object.assign(document.createElement("button"), { textContent: label, onclick: () => { m.hidden = true; b.classList.remove("on"); screenAction(act, file); } })));
  const cr = $("canvas").getBoundingClientRect(), br = b.getBoundingClientRect();
  m.style.left = br.left - cr.left + "px"; m.style.top = br.bottom - cr.top + 6 + "px"; m.dataset.for = b.dataset.menu; m.hidden = false; b.classList.add("on");
};
addEventListener("click", (e) => { if (!e.target.closest("#selbar") && !e.target.closest("#selmenu")) $("selmenu").hidden = true; });

$("menu").onclick = async (e) => {
  const act = e.target.closest("button")?.dataset.act; if (!act) return; closeMenu();
  if (act === "arrange") canvas.arrange();
  else if (act === "projects-open" || act === "projects-change") { const r = await window.studio.projectsFolder(act.slice(9)); if (r?.error) toast(r.error, { err: true }); }
  else if (act === "zip") report(await window.studio.exportZip(), (r) => `ZIP saved (${r.files} screens)`);
  else if (act === "share-zip") notifyShare(await window.studio.shareMail("zip"));
  else if (act === "offline") {
    const st = await window.studio.cdnSetOffline(!$("offline-box").textContent.includes("☑"));
    refreshCdn(st); toast(st.offline ? "Offline mode on: everything loads from the cache only." : "Offline mode off.");
    canvas.all().forEach((f) => f.view.reload());
  } else if (act === "warmup") {
    const { results, status } = await window.studio.cdnWarmup(); refreshCdn(status);
    const bad = results.filter((r) => !r.ok);
    toast(bad.length ? `Cache ready, did not load: ${bad.map((b) => b.name).join(", ")}` : `Cache ready (${status.files} files, ${mb(status.bytes)} MB).`, { err: bad.length > 0 });
  } else if (act === "folder") window.studio.revealProject();
  else if (act === "update") {
    if (!meta.updates) toast("Updates are not configured in this build (UU5STUDIO_UPDATE_URL was missing at build time).", { err: true });
    else window.studio.checkUpdates();
  } else if (act === "setup") setup.open();
  else if (act === "about") openAbout();
  else if (act === "clear") { refreshCdn(await window.studio.cdnClear()); toast("CDN cache cleared."); }
};
refreshCdn();

// ---------- theme ----------
const THEME_ICON = { auto: "◐", light: "☀", dark: "☾" }, THEME_NAME = { auto: "automatic", light: "light", dark: "dark" };
function syncTheme() {
  const pref = window.__theme.get();
  $("themebtn").textContent = THEME_ICON[pref]; $("themebtn").title = `Appearance: ${THEME_NAME[pref]} (click to switch)`;
  window.studio.setTheme(pref === "auto" ? "system" : pref);
}
$("themebtn").onclick = () => { window.__theme.next(); syncTheme(); };
syncTheme();

// ---------- docked / floating chat panel ----------
const dock = createChatDock({ chat: $("chat"), header: $("chat").querySelector("header"), toggleBtn: $("chatmode"), onModeChange: (_mode, shiftX) => canvas.panBy(shiftX, 0) });
$("chatmin").onclick = () => dock.toggleCollapsed();
$("fschat").onclick = () => dock.toggleCollapsed();

// ---------- app info + updates ----------
document.body.dataset.platform = window.studio.platform;
const meta = await window.studio.meta();
if (meta.platform !== "darwin") $("share-zip").textContent = "E-mail project ZIP…"; // macOS opens the system share sheet, other systems an e-mail draft
// ---------- About ----------
const PLATFORM = { darwin: "macOS", win32: "Windows", linux: "Linux" };
const aboutRows = () => {
  const rt = meta.runtime ?? {}, d = meta.deps ?? {}, v = (x) => (x ? ` ${x}` : "");
  return [
    ["Application shell", `Electron${v(rt.electron)} (Chromium${v(rt.chrome)}, Node.js${v(rt.node)})`],
    ["AI backend", `Claude Code installed on this computer, driven through the Claude Agent SDK${v(d["@anthropic-ai/claude-agent-sdk"])}`],
    ["Mockup UI", "uu5 / uuGDS (uu5g05 libraries, loaded from the Plus4U CDN and cached locally)"],
    ["Component reference", "uu5-development and uugds Claude Code plugins (read from your local installation)"],
    ["JSX source editing", `Babel parser${v(d["@babel/parser"])}`],
    ["Export and updates", `fflate${v(d.fflate)} (ZIP), electron-updater${v(d["electron-updater"])}`],
  ];
};
const LICENSE_TEXT = "Copyright © 2026 Unicorn Vysoká škola. GNU General Public License v3 with an additional permission for the Claude Agent SDK (files LICENSE and NOTICE in the application resources).";
function openAbout() {
  $("ab-version").textContent = `Version ${meta.version} · ${PLATFORM[meta.platform] ?? meta.platform}`;
  $("ab-about").textContent = "A desktop app for designing uu5 / uuGDS user interfaces with an AI model. Describe a screen in the chat and Claude Code builds it as an interactive uu5 mockup, shown live on an infinite canvas next to your other screens. Screens are plain HTML files in a project folder; the inspector shows the uu5 components of a screen and edits their props straight in the file.";
  $("ab-tech").replaceChildren(...aboutRows().flatMap(([k, t]) => [Object.assign(document.createElement("dt"), { textContent: k }), Object.assign(document.createElement("dd"), { textContent: t })]));
  $("ab-authors").textContent = "Marek Beránek, Unicorn University";
  $("ab-license").textContent = LICENSE_TEXT;
  $("about").hidden = false; $("ab-close").focus();
}
const closeAbout = () => { $("about").hidden = true; };
$("ab-close").onclick = closeAbout;
$("about").addEventListener("mousedown", (e) => { if (e.target === $("about")) closeAbout(); });
$("about").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeAbout(); } });
$("ab-copy").onclick = async () => {
  const text = [`uu5Mock Studio ${meta.version} (${PLATFORM[meta.platform] ?? meta.platform})`, ...aboutRows().map(([k, t]) => `${k}: ${t}`), "Authors: Marek Beránek, Unicorn University", `License: ${LICENSE_TEXT}`].join("\n");
  try { await navigator.clipboard.writeText(text); toast("Details copied."); } catch { toast("Could not copy.", { err: true }); }
};
$("app-info").textContent = `uu5Mock Studio ${meta.version} · ${meta.platform}`;
window.studio.onUpdate((u) => {
  if (u.type === "available") toast(`Stahuji aktualizaci ${u.version}…`);
  else if (u.type === "ready") { toast(`Update ${u.version} is ready. `); const a = Object.assign(document.createElement("a"), { textContent: "Restart" }); a.onclick = () => window.studio.installUpdate(); $("toast").append(a); }
  else if (u.type === "none") toast("You are up to date.");
  else if (u.type === "error") toast(`Aktualizace selhala: ${u.message}`, { err: true });
});

// ---------- projects ----------
function loadProject(info) {
  closeFullscreen();
  loading = true;
  port = info.port; webviewPreload = info.webviewPreload; project = info.project; projectList = info.projects ?? projectList;
  setBusy(false); clearChips();
  chatId = info.chatId; chatList = info.chats ?? [];
  entries = info.chat ?? [];
  for (const e of entries) if (e.kind === "steps") for (const st of e.steps) if (st.status === "run") st.status = "bad";
  log.replaceChildren(); entries.forEach(paint);
  canvas.removeAll(); savedLayout = info.layout?.frames ?? {};
  syncFrames(info.screens);
  showRepo(info.repo ?? null); rules.load(Boolean(project)); desc.load(Boolean(project)); memory.setNotes(info.notes); memory.loadTexts();
  if (info.layout?.camera) canvas.setCamera(info.layout.camera, false); else setTimeout(() => canvas.fitAll(false), 300);
  $("projbtn").textContent = project ? `${project} ▾` : "No project ▾"; $("projbtn").title = project ? `Project: ${project}` : "Open or create a project";
  updateNoProject();
  loading = false;
}
/** Start screen + disabled chat while no project is open. */
function updateNoProject() {
  const none = !project;
  if (none) document.body.dataset.noproject = "1"; else delete document.body.dataset.noproject;
  $("welcome").hidden = !none;
  $("prompt").disabled = none; $("send").disabled = none || !ready || busy;
  $("prompt").placeholder = none ? "Open or create a project first…" : "Describe the screen you want to design…";
  const list = $("w-list"); list.replaceChildren();
  if (none) for (const p of projectList) {
    const b = Object.assign(document.createElement("button"), { type: "button" });
    b.append(Object.assign(document.createElement("span"), { textContent: p.name }), Object.assign(document.createElement("small"), { textContent: `${p.screens} ${p.screens === 1 ? "screen" : "screens"}` }));
    b.onclick = () => changeProject(() => window.studio.openProject(p.name)); list.append(b);
  }
}
$("w-new").onclick = () => newProjectFlow();
/** Write pending chat/canvas changes of the current project before the workspace is swapped. */
async function flushSaves() {
  clearTimeout(saveTimer); clearTimeout(saveLayoutTimer);
  if (!project) return;
  await Promise.all([window.studio.saveChat(project, chatId, chatSnapshot()), window.studio.saveLayout(project, { frames: canvas.layout(), camera: canvas.camera() })]);
}
async function changeProject(action) {
  await flushSaves();
  const r = await action();
  if (r?.error) toast(r.error, { err: true }); else if (r && !r.canceled) loadProject(r);
  return r;
}
function askText({ title, value = "", ok = "OK" }) {
  return new Promise((resolve) => {
    const dlg = $("dialog"), input = $("dlg-input");
    $("dlg-title").textContent = title; $("dlg-ok").textContent = ok; $("dlg-err").textContent = ""; input.value = value;
    dlg.hidden = false; input.focus(); input.select();
    const done = (v) => { dlg.hidden = true; $("dlg-cancel").onclick = null; dlg.onkeydown = null; $("dialog").firstElementChild.onsubmit = null; resolve(v); };
    $("dlg-cancel").onclick = () => done(null);
    dlg.onkeydown = (e) => { if (e.key === "Escape") done(null); };
    $("dialog").firstElementChild.onsubmit = (e) => { e.preventDefault(); input.value.trim() ? done(input.value.trim()) : ($("dlg-err").textContent = "Enter a name."); };
  });
}
async function renderProjectMenu() {
  projectList = await window.studio.listProjects();
  const m = $("projmenu"); m.replaceChildren();
  for (const p of projectList) {
    const b = Object.assign(document.createElement("button"), { className: p.name === project ? "cur" : "" });
    b.append(Object.assign(document.createElement("span"), { textContent: p.name }), Object.assign(document.createElement("small"), { textContent: `${p.screens} ${p.screens === 1 ? "screen" : "screens"}` }));
    b.dataset.open = p.name; m.append(b);
  }
  m.append(document.createElement("hr"));
  const items = [["new", "＋ New project…"]];
  if (project) items.push(["rename", `Rename “${project}”…`], ["delete", `Delete “${project}”…`], ["folder", "Reveal project folder"], ["close", "Close project"]);
  if (project) {
    items.push(["desc-open", "Project description…"], ["rules-open", "Business rules…"]);
    if (repo && !repo.error) items.push(["repo-unlink", `Unlink repository ${repo.name}`]);
    else items.push(["repo-link", repo?.error ? "Link another git repository…" : "Link git repository…"]);
  }
  items.push(["projects-open", "Open projects folder"], ["projects-change", "Change projects folder…"]);
  for (const [act, label] of items) {
    const b = Object.assign(document.createElement("button"), { textContent: label });
    b.dataset.act = act; m.append(b);
  }
}
$("projbtn").onclick = async (e) => {
  if (dock.collapsed()) return; // on a minimized bar the click restores the chat instead (handled by the header)
  e.stopPropagation(); const m = $("projmenu");
  if (!m.hidden) { m.hidden = true; return; }
  await renderProjectMenu(); m.hidden = false;
  const r = $("projbtn").getBoundingClientRect(); // open right under the button, wherever the chat panel is
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + "px"; m.style.top = r.bottom + 6 + "px";
};
async function newProjectFlow() { const name = await askText({ title: "New project", ok: "Create" }); if (name) await changeProject(() => window.studio.createProject(name)); }
async function renameProjectFlow() {
  if (!project) return;
  const name = await askText({ title: "Rename project", value: project, ok: "Rename" });
  if (name && name !== project) await changeProject(() => window.studio.renameProject(project, name));
}
async function deleteProjectFlow() {
  if (!project) return;
  const ok = await askConfirm({ title: `Delete the project “${project}”?`, detail: "The project folder (screens and chat history) is moved to the trash, so you can restore it.", ok: "Delete project" });
  if (ok) await changeProject(() => window.studio.deleteProject(project));
}
async function closeProjectFlow() { if (project) await changeProject(() => window.studio.closeProject()); }
$("projmenu").onclick = async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $("projmenu").hidden = true;
  if (b.dataset.open) { if (b.dataset.open !== project) await changeProject(() => window.studio.openProject(b.dataset.open)); return; }
  const act = b.dataset.act;
  if (act === "new") await newProjectFlow();
  else if (act === "rename") await renameProjectFlow();
  else if (act === "delete") await deleteProjectFlow();
  else if (act === "close") await closeProjectFlow();
  else if (act === "folder") window.studio.revealProject();
  else if (act === "desc-open") openDesc(null);
  else if (act === "rules-open") openRules();
  else if (act === "repo-link") await linkRepoFlow();
  else if (act === "repo-unlink") { await window.studio.repoUnlink(); showRepo(null); toast("Repository unlinked."); }
  else if (act === "projects-open" || act === "projects-change") { const r = await window.studio.projectsFolder(act.slice(9)); if (r?.error) toast(r.error, { err: true }); }
};
addEventListener("click", (e) => { if (!e.target.closest("#projmenu")) $("projmenu").hidden = true; });

// ---------- application menu actions (the menu itself lives in main; it only sends action ids) ----------
{
  const target = () => canvas.selected() ?? canvas.files()[0];
  const withScreen = (fn) => { const t = target(); if (t) fn(t); else toast("Select a screen first.", { err: true }); };
  const needProject = (fn) => (project ? fn() : toast("Open or create a project first.", { err: true }));
  window.studio.onMenu(async (action) => {
    if (action.startsWith("project:open:")) return changeProject(() => window.studio.openProject(action.slice("project:open:".length)));
    if (action.startsWith("view:theme:")) { window.__theme.set(action.slice("view:theme:".length)); return syncTheme(); }
    switch (action) {
      case "project:new": return newProjectFlow();
      case "project:switcher": return $("projbtn").click();
      case "project:close": return closeProjectFlow();
      case "project:rename": return renameProjectFlow();
      case "project:delete": return deleteProjectFlow();
      case "chat:new": return needProject(() => $("newchat").click());
      case "chat:history": return needProject(() => $("chathist").click());
      case "screen:image": return withScreen((f) => screenAction("image", f));
      case "screen:html": return withScreen((f) => screenAction("copy-html", f));
      case "screen:share-html": return withScreen((f) => screenAction("share-html", f));
      case "screen:share-png": return withScreen((f) => screenAction("share-png", f));
      case "project:rules": return needProject(openRules);
      case "project:desc": return needProject(() => openDesc(null));
      case "project:repo-link": return needProject(() => linkRepoFlow());
      case "project:zip": return needProject(async () => report(await window.studio.exportZip(), (r) => `ZIP saved (${r.files} screens)`));
      case "project:share-zip": return needProject(async () => notifyShare(await window.studio.shareMail("zip")));
      case "view:zoomin": return $("zin").click();
      case "view:zoomout": return $("zout").click();
      case "view:fit": return $("fit").click();
      case "view:arrange": return canvas.arrange();
      case "view:fullscreen": return withScreen((f) => toggleFullscreen(f));
      case "view:inspector": return needProject(() => $("inspect").click());
      case "view:chatmode": return $("chatmode").click();
      case "app:about": return openAbout();
      case "claude:setup": return setup.open();
      case "plugins:check": return setup.checkUpdates(true);
      case "update:check": return meta.updates ? window.studio.checkUpdates() : toast("Updates are not configured in this build.", { err: true });
    }
  });
}

// ---------- Claude Code setup wizard (Claude Code, sign-in, plugins; plugin updates) ----------
setup = createSetup({
  api: window.studio, toast, isBusy: () => busy,
  onStatus: (st) => {
    ready = st.state === "ready";
    $("send").disabled = busy || !ready || !project;
    if (ready) $("model").title = `Claude Code ${st.version} · ${st.email ?? ""}`;
  },
});
const checkClaude = (refresh) => setup.check(refresh);
// ---------- attached screenshots ----------
const MAX_IMAGES = 8, MAX_SIDE = 2000, THUMB_SIDE = 320;
let pending = []; // [{id,name,mime,data(base64),thumb}]
let preparing = 0;
const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
/** Normalizes any image to a PNG (or JPEG when huge) of at most 2000 px plus a small thumbnail. */
async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.max(1, Math.round(bmp.width * k)), height: Math.max(1, Math.round(bmp.height * k)) });
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await toBlob(c, "image/png"), mime = "image/png";
  if (blob.size > 4 * 1024 * 1024) { blob = await toBlob(c, "image/jpeg", 0.9); mime = "image/jpeg"; }
  const tk = Math.min(1, THUMB_SIDE / Math.max(c.width, c.height));
  const t = Object.assign(document.createElement("canvas"), { width: Math.max(1, Math.round(c.width * tk)), height: Math.max(1, Math.round(c.height * tk)) });
  t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
  return { id: crypto.randomUUID(), name: file.name || "screenshot.png", mime, data: await blobToBase64(blob), thumb: t.toDataURL("image/jpeg", 0.75) };
}
function renderAttachments() {
  const box = $("attachments"); box.replaceChildren();
  for (const im of pending) {
    const d = Object.assign(document.createElement("div"), { className: "att", title: im.name });
    d.append(Object.assign(document.createElement("img"), { src: im.thumb, alt: im.name }));
    d.append(Object.assign(document.createElement("button"), { type: "button", textContent: "✕", title: "Remove attachment", onclick: () => { pending = pending.filter((x) => x.id !== im.id); renderAttachments(); } }));
    box.append(d);
  }
  if (preparing) box.append(Object.assign(document.createElement("div"), { className: "att busy", textContent: "…" }));
  box.hidden = !pending.length && !preparing;
}
async function addImages(files) {
  const imgs = [...files].filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) return;
  if (pending.length + preparing + imgs.length > MAX_IMAGES) { toast(`You can attach at most ${MAX_IMAGES} images at a time.`, { err: true }); imgs.splice(Math.max(0, MAX_IMAGES - pending.length - preparing)); }
  preparing += imgs.length; renderAttachments();
  for (const f of imgs) {
    try { pending.push(await prepareImage(f)); } catch { toast(`The image “${f.name || "from the clipboard"}” could not be loaded.`, { err: true }); }
    preparing--; renderAttachments();
  }
  $("prompt").focus();
}
$("prompt").addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) { e.preventDefault(); addImages(files); } // plain text pastes are left alone
});
$("attach").onclick = () => $("attachfile").click();
$("attachfile").onchange = (e) => { addImages(e.target.files); e.target.value = ""; };
{
  const chat = $("chat"), hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  let depth = 0;
  chat.addEventListener("dragenter", (e) => { if (hasFiles(e)) { depth++; $("drophint").hidden = false; } });
  chat.addEventListener("dragleave", (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; $("drophint").hidden = true; } });
  chat.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  chat.addEventListener("drop", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; $("drophint").hidden = true; addImages(e.dataTransfer.files); });
}

// ---------- input ----------
$("form").onsubmit = async (e) => {
  e.preventDefault();
  if (busy || !ready) return;
  if (preparing) return toast("The images are still loading, one moment.");
  const imgs = pending.slice();
  let prompt = $("prompt").value.trim();
  if (!prompt && !imgs.length) return;
  if (!prompt) prompt = "Attaching a screenshot, see the attachment.";
  // attached screenshots become files in the project (hidden folder) that the agent opens with Read
  let paths = [];
  if (imgs.length) {
    const r = await window.studio.saveAttachments(imgs.map(({ mime, data }) => ({ mime, data })));
    if (!Array.isArray(r)) return toast(r?.error ?? "The attachments could not be saved.", { err: true });
    paths = r;
  }
  const ctx = chips.length ? chips.slice() : null;
  push({ kind: "user", text: ctx ? `${prompt}\n${ctx.map((c) => `📍 ${describePick(c)}`).join("\n")}` : prompt, ...(imgs.length ? { images: imgs.map(({ thumb, name }) => ({ thumb, name })) } : {}) });
  $("prompt").value = ""; pending = []; renderAttachments(); setBusy(true);
  const refs = mentionedScreens(prompt), repoRefs = mentionedRepoFiles(prompt);
  const noteBlock = await memory.notesFor([...refs.map((n) => `${n}.html`), ...(fsFile ? [fsFile] : []), ...(ctx ?? []).map((c) => c.file)]);
  if (fsFile) setWorkFile(fsFile); // the target is known up front when a screen is open in fullscreen
  const extra = [
    refs.length && `Referenced screens (files in the project's working folder): ${refs.map((n) => n + ".html").join(", ")}. Read their current content first, change only what the user asks for and leave the rest unchanged.`,
    repoRefs.length && repo && `Referenced files of the linked git repository (read-only, ${repo.readDir ?? repo.path}): ${repoRefs.map((p) => `${repo.readDir ?? repo.path}/${p}`).join(", ")}. Read them first and stay consistent with their names, props and structure.`,
    noteBlock,
    paths.length && `Attached images (screenshots from the user, as files): ${paths.join(", ")}. Open them with the Read tool first and base your work on what they show.`,
    fsFile && `Context: the user is viewing the screen ${fsFile} in fullscreen preview right now. Unless they name another screen, their request is about ${fsFile}: change that file.`,
    ctx && agentContext(ctx),
  ].filter(Boolean);
  sentModel = $("model").value;
  window.studio.send(extra.length ? `${prompt}\n\n${extra.join("\n")}` : prompt, sentModel || undefined);
  clearChips(); if (chatPick) setInspect(false);
};
$("prompt").onkeydown = (e) => {
  const box = $("mentions");
  if (!box.hidden) {
    const n = box.children.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); mentionIdx = (mentionIdx + (e.key === "ArrowDown" ? 1 : n - 1)) % n; updateMentions(); return; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(box.children[mentionIdx].textContent.slice(1)); return; }
    if (e.key === "Escape") { e.preventDefault(); box.hidden = true; return; }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("form").requestSubmit(); }
};
$("stop").onclick = () => window.studio.stop();
/** Show another conversation of the open project (main has already switched the Claude session). */
function showChat(v) {
  chatId = v.chatId; chatList = v.chats ?? chatList;
  entries = v.entries ?? [];
  for (const e of entries) if (e.kind === "steps") for (const st of e.steps) if (st.status === "run") st.status = "bad";
  loading = true; log.replaceChildren(); entries.forEach(paint); loading = false;
  setBusy(false); clearChips();
}
const fmtWhen = (ts) => {
  const d = new Date(ts), t = d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((day(new Date()) - day(d)) / 864e5);
  return diff === 0 ? `today ${t}` : diff === 1 ? `yesterday ${t}` : `${d.toLocaleDateString("en", { day: "numeric", month: "short" })} ${t}`;
};
const chatCount = (n) => `${n} ${n === 1 ? "message" : "messages"}`;
async function switchToChat(id) {
  if (id === chatId) return;
  if (busy && !(await askConfirm({ title: "Switch conversation?", detail: "Claude is working right now. Switching stops the running task.", ok: "Switch", danger: false }))) return;
  await flushSaves(); showChat(await window.studio.switchChat(id));
}
async function renderHistMenu() {
  chatList = await window.studio.listChats();
  const m = $("histmenu"); m.replaceChildren(Object.assign(document.createElement("h4"), { textContent: `Chat history · ${project}` }));
  for (const c of chatList) {
    const row = document.createElement("div"); row.className = "row" + (c.id === chatId ? " cur" : "");
    const open = document.createElement("button"); open.className = "open"; open.type = "button";
    open.append(Object.assign(document.createElement("b"), { textContent: c.title }), Object.assign(document.createElement("small"), { textContent: `${fmtWhen(c.updatedAt)} · ${chatCount(c.messages)}` }));
    open.onclick = () => { m.hidden = true; switchToChat(c.id); };
    const del = Object.assign(document.createElement("button"), { className: "del", type: "button", textContent: "✕", title: "Delete conversation" });
    del.onclick = async (e) => {
      e.stopPropagation(); m.hidden = true;
      if (!(await askConfirm({ title: `Delete the conversation “${c.title}”?`, detail: "This conversation will be removed. The screens on the canvas stay unchanged.", ok: "Delete conversation" }))) return;
      await flushSaves(); showChat(await window.studio.deleteChat(c.id));
    };
    row.append(open, del); m.append(row);
  }
}
$("chathist").onclick = async (e) => {
  e.stopPropagation(); const m = $("histmenu");
  if (!m.hidden) { m.hidden = true; return; }
  await renderHistMenu(); m.hidden = false;
  const r = $("chathist").getBoundingClientRect(); // right under the button, wherever the chat panel is
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + "px"; m.style.top = r.bottom + 6 + "px";
};
addEventListener("click", (e) => { if (!e.target.closest("#histmenu")) $("histmenu").hidden = true; });
$("newchat").onclick = async () => {
  await flushSaves();
  const v = await window.studio.newChat(); showChat(v);
  toast(v.created ? "New chat. You will find the previous one in the history." : "This chat is empty, you can start typing right away.");
  $("prompt").focus();
};


// ---------- boot ----------
const info = await window.studio.info();
loadProject(info);
checkClaude(false).then((st) => { if (st?.state === "ready") setup.checkUpdates(false); }); // a quiet look for plugin updates once Claude is ready
