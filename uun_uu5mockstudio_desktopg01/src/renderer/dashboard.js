const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? "", textContent: text ?? "" });

const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const IDEAS = [
  ["List with filter", "A list of items with search, filter, sorting and a detail panel", svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>')],
  ["Detail page", "A detail page of one item with tabs, key facts and actions", svg('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>')],
  ["Create form", "A form for creating an item, with validation and a confirmation", svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/><line x1="8" y1="14" x2="16" y2="14"/>')],
  ["Dashboard", "An overview dashboard with key numbers, a chart and a list of recent items", svg('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>')],
  ["Wizard", "A step-by-step wizard with a summary on the last step", svg('<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><line x1="7" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="17" y2="12"/>')],
  ["Something else…", "", svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>')],
];
const TRASH = svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>');
const VIEW_KEY = "uu5studio.dashView";

/** "3 minutes ago", "yesterday", "12 Mar 2026". */
export function ago(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h > 1 ? "s" : ""} ago`; }
  if (s < 2 * 86400) return "yesterday";
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const unique = (base, taken) => { const set = new Set(taken.map((n) => n.toLowerCase())); let name = base, i = 2; while (set.has(name.toLowerCase())) name = `${base} ${i++}`; return name; };
const cap = (t) => t[0].toUpperCase() + t.slice(1);

/** The first name of a project started from the dashboard: neutral, because it is replaced by the name of the first screen (see below). */
export function newProjectName(taken = []) { return unique("New project", taken); }

/** The name of a project made of the name of its first screen: "thesis-assignment-form.html" -> "Thesis assignment form". */
export function projectNameFromScreen(file, taken = []) {
  const t = file.replace(/\.html$/i, "").replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? unique(cap(t).slice(0, 48), taken) : null;
}

/**
 * The first view of the app: write what to design (a project is made for it and the chat goes on there) or open a project from the recent ones.
 * `api` = window.studio (projectThumb, projectsFolder); the callbacks do the work in the renderer.
 */
export function createDashboard({ api, onStart, onOpen, onNew, onFolder, onDelete }) {
  const root = $("dash"), prompt = $("dash-prompt"), grid = $("dash-grid"), search = $("dash-search");
  let projects = [], plan = false, seq = 0, section = "recents", view = "grid";
  try { view = localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"; } catch { /* default */ }

  const refreshSend = () => { $("dash-send").disabled = !prompt.value.trim(); };
  function setPlan(on) {
    plan = on;
    for (const b of root.querySelectorAll("#dash-mode button")) { const o = (b.dataset.mode === "plan") === on; b.classList.toggle("on", o); b.setAttribute("aria-checked", String(o)); }
  }
  function setView(v) {
    view = v; try { localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered */ }
    grid.classList.toggle("list", v === "list");
    for (const b of root.querySelectorAll("#dash-views button")) b.classList.toggle("on", b.dataset.view === v);
  }
  function setSection(sec) {
    section = sec;
    for (const b of root.querySelectorAll("#dash-nav button")) b.classList.toggle("on", b.dataset.sec === sec);
    $("dash-h").textContent = sec === "all" ? `All projects${projects.length ? ` (${projects.length})` : ""}` : "Recents";
    paint();
  }
  function submit() {
    const text = prompt.value.trim(); if (!text) return;
    onStart({ text, plan, model: $("dash-model").value });
  }
  async function loadThumbs(shown, my) {
    for (const p of shown) { // one after another: the main process paints them one at a time anyway
      if (my !== seq) return;
      const img = await api.projectThumb(p.name).catch(() => null);
      if (my !== seq || typeof img !== "string") continue;
      const box = grid.querySelector(`[data-name="${CSS.escape(p.name)}"] .dc-pic`);
      if (box) { box.replaceChildren(Object.assign(document.createElement("img"), { src: img, alt: "", draggable: false })); box.classList.add("has"); }
    }
  }
  function paint() {
    const q = search.value.trim().toLowerCase(), my = ++seq;
    let shown = projects.filter((p) => !q || p.name.toLowerCase().includes(q));
    shown = section === "all" ? shown.sort((a, b) => a.name.localeCompare(b.name, "en")) : shown.sort((a, b) => b.updated - a.updated).slice(0, q ? 100 : 24);
    const cards = shown.map((p) => {
      const c = el("button", "dc"); c.type = "button"; c.dataset.name = p.name;
      const pic = el("div", "dc-pic"); pic.append(el("span", "dc-initial", p.name[0]?.toUpperCase() ?? "?"));
      const meta = el("div", "dc-meta"), when = `${p.screens ? `${p.screens} ${p.screens === 1 ? "screen" : "screens"}` : "No screen yet"} · ${ago(p.updated)}`;
      meta.append(el("b", "", p.name), el("small", "", when));
      c.append(pic, meta); c.onclick = () => onOpen(p.name);
      const del = el("button", "dc-del"); del.type = "button"; del.title = `Delete “${p.name}”`; del.setAttribute("aria-label", `Delete project ${p.name}`); del.innerHTML = TRASH;
      del.onclick = (e) => { e.stopPropagation(); onDelete?.(p.name); };
      const wrap = el("div", "dcw"); wrap.append(c, del);
      return wrap;
    });
    grid.replaceChildren(...cards);
    if (!cards.length) grid.append(el("p", "mute dc-none", q ? "No project matches." : "No project yet: describe a screen above to start one."));
    loadThumbs(shown.filter((p) => p.screens), my);
  }
  async function showFolder() {
    const r = await api.projectsFolder("path").catch(() => null);
    if (r?.path) { $("dash-path").textContent = r.path.split(/[\\/]/).filter(Boolean).pop() ?? r.path; $("dash-path").title = r.path; $("dash-change").disabled = Boolean(r.locked); }
  }

  prompt.addEventListener("input", () => { refreshSend(); if (!prompt.value.trim()) for (const b of $("dash-ideas").children) b.classList.remove("on"); });
  prompt.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
  $("dash-form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
  for (const b of root.querySelectorAll("#dash-mode button")) b.onclick = () => setPlan(b.dataset.mode === "plan");
  for (const b of root.querySelectorAll("#dash-nav button")) b.onclick = () => setSection(b.dataset.sec);
  for (const b of root.querySelectorAll("#dash-views button")) b.onclick = () => setView(b.dataset.view);
  search.addEventListener("input", paint);
  $("dash-newbtn").onclick = onNew;
  $("dash-reveal").onclick = () => onFolder("open");
  $("dash-change").onclick = () => onFolder("change");
  $("dash-ideas").replaceChildren(...IDEAS.map(([label, text, icon]) => {
    const b = el("button", "idea"); b.type = "button"; b.innerHTML = icon; b.append(label); if (text) b.title = text;
    b.onclick = () => { for (const o of $("dash-ideas").children) o.classList.toggle("on", o === b); prompt.value = text; refreshSend(); prompt.focus(); };
    return b;
  }));
  setPlan(false); refreshSend(); setView(view);

  return {
    show(list, { plan: p } = {}) { projects = list ?? []; root.hidden = false; if (typeof p === "boolean") setPlan(p); search.value = ""; showFolder(); setSection(section); },
    hide() { root.hidden = true; seq++; },
    reset() { prompt.value = ""; refreshSend(); for (const b of $("dash-ideas").children) b.classList.remove("on"); },
    focus() { prompt.focus(); },
  };
}
