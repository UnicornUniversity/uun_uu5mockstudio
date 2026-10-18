const $ = (id) => document.getElementById(id);
const SETS = ["icons", "arrow", "edit", "media", "layout", "uiaction", "it", "education", "chart", "communication", "commerce", "home", "badge", "security", "shape", "time", "weather", "user", "navigation", "transport", "alert"];
const MAX = 480;

/** `uugds-plus` -> its icon font family; `uugdsstencil-edit-x` -> the "edit" set. */
export const fontOf = (code) => `uu_gds_svgg01-${code.startsWith("uugdsstencil-") ? code.split("-")[1] : "icons"}`;

/** uuBml state icons: `uubml-state-s02-active` = state number 02 of the kind "active" (the kind gives the colour). */
export const isStateCode = (code) => /^uubml-state-s\d{2}(-|$)/.test(String(code ?? ""));
/** Any icon of the uuBml font (`uubml-wrench`, `uubmlicon-...`, the states): drawn with the uuBml stylesheet. */
export const isBmlCode = (code) => /^uubml(icon)?-/.test(String(code ?? ""));
export function parseStateCode(code) {
  const m = String(code ?? "").match(/^uubml-state-s(\d{2})(?:-(.+))?$/);
  return m ? { number: m[1], variant: m[2] ?? "" } : null;
}
export const stateCode = (number, variant = "") => `uubml-state-s${number}${variant ? `-${variant}` : ""}`;
export const STATE_KINDS = { "": "No kind (grey)", default: "Default", initial: "Initial", active: "Active", "alternative-active": "Alternative active", problem: "Problem", passive: "Passive", final: "Final", "alternative-final": "Alternative final", cancelled: "Cancelled", system: "System" };

/** A rendered icon (the icon fonts must be loaded: see ensureFonts / ensureStateFonts). */
export function iconGlyph(code) {
  if (isBmlCode(code)) { const b = document.createElement("span"); b.className = `ib-bml uubml ${code}`; b.title = code; return b; }
  const g = document.createElement("span");
  g.className = `picon ${code.startsWith("uugdsstencil-") ? "uugdsstencil" : "uugds"} ${code}`; g.style.setProperty("--ff", fontOf(code)); g.title = code;
  return g;
}

/** Words of the prop's component text that name a standard action (create, delete, …) -> the icon the uuGDS convention table prescribes. */
export function suggest(text, actions = {}) {
  const t = ` ${String(text ?? "").toLowerCase()} `;
  return [...new Set(Object.entries(actions).filter(([k]) => t.includes(` ${k} `) || t.includes(` ${k}s `)).map(([, icon]) => icon))];
}

/** Does the catalog entry match every word of the query (name, code, keywords, category)? */
export function matches(icon, query) {
  const hay = `${icon.name} ${icon.code} ${icon.keywords.join(" ")} ${icon.category}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/**
 * Modal icon picker over the uuGDS catalog. The glyphs are drawn with the same icon fonts the mockup page loads
 * (the font stylesheets are taken from the CDN folder the page loaded them from).
 */
let lastLib = "gds"; // the library the picker opened with last time
export function createIconPicker({ getCatalog, getBml }) {
  let catalog = null, loadedBase = null, resolve = null, state = null, bmlLoaded = false;
  const box = $("iconbox");

  function loadFonts(base) {
    if (!base || base === loadedBase) return;
    loadedBase = base;
    for (const l of document.querySelectorAll("link[data-iconset]")) l.remove();
    for (const set of SETS) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `${base}uu_gds_svgg01-${set}.min.css`; l.setAttribute("data-iconset", set); document.head.append(l); }
  }

  function cell(icon, current, glyphs) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ib-icon" + (icon.code === current ? " on" : ""); b.title = `${icon.code}${icon.keywords.length ? `\n${icon.keywords.join(", ")}` : ""}${icon.deprecated ? "\n(deprecated)" : ""}`;
    const g = document.createElement("span"); g.className = `picon ${icon.code.startsWith("uugdsstencil-") ? "uugdsstencil" : "uugds"} ${icon.code}`; g.style.setProperty("--ff", fontOf(icon.code)); g.hidden = !glyphs;
    const n = document.createElement("span"); n.className = "ib-name"; n.textContent = icon.code.replace(/^uugds(stencil)?-/, "");
    b.append(g, n);
    b.onclick = () => done(icon.code);
    return b;
  }

  /** The uuBml icon font (the state icons) is loaded from the CDN stylesheet the main process found. */
  function loadBml(url) {
    if (bmlLoaded || !url) return; bmlLoaded = true;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = url; l.setAttribute("data-iconset", "bml"); document.head.append(l);
  }

  const head = (t) => Object.assign(document.createElement("h5"), { textContent: t });

  function stateCell(n, variant) {
    const code = stateCode(n, variant), b = document.createElement("button");
    b.type = "button"; b.className = "ib-icon ib-state" + (code === state.current ? " on" : ""); b.title = code;
    const g = document.createElement("span"); g.className = `ib-bml uubml ${code}`;
    const t = document.createElement("span"); t.className = "ib-name"; t.textContent = `s${n}`;
    b.append(g, t); b.onclick = () => done(code); return b;
  }
  function renderStates() {
    const q = $("ib-search").value.trim().replace(/^s/i, ""), variant = $("ib-cat").value, grid = $("ib-grid"); grid.replaceChildren();
    const list = state.states.numbers.filter((n) => !q || n.includes(q));
    const cur = parseStateCode(state.current), curKnown = cur && state.states.numbers.includes(cur.number);
    if (curKnown) grid.append(head("Current"), stateCell(cur.number, cur.variant), head(`All states of the kind: ${STATE_KINDS[variant] ?? variant}`)); // what is chosen now comes first
    grid.append(...list.filter((n) => !(curKnown && stateCode(n, variant) === state.current)).map((n) => stateCell(n, variant)));
    $("ib-note").textContent = `${list.length} state${list.length === 1 ? "" : "s"} · kind: ${STATE_KINDS[variant] ?? variant}`;
  }

  function bmlCell(i) {
    const b = document.createElement("button"); b.type = "button"; b.className = "ib-icon" + (i.code === state.current ? " on" : ""); b.title = i.code;
    const g = document.createElement("span"); g.className = `ib-bml uubml ${i.code}`;
    const n = document.createElement("span"); n.className = "ib-name"; n.textContent = i.name;
    b.append(g, n); b.onclick = () => done(i.code); return b;
  }
  function renderBml() {
    const words = $("ib-search").value.trim().toLowerCase().split(/\s+/).filter(Boolean), grp = $("ib-cat").value, grid = $("ib-grid"); grid.replaceChildren();
    const list = state.bml.icons.filter((i) => (!grp || i.group === grp) && words.every((w) => i.code.includes(w)));
    const cur = state.bml.icons.find((i) => i.code === state.current);
    if (cur) grid.append(head("Current"), bmlCell(cur), head("All icons")); // what is chosen now comes first
    grid.append(...list.filter((i) => i !== cur).slice(0, MAX).map(bmlCell));
    $("ib-note").textContent = list.length > MAX ? `Showing ${MAX} of ${list.length} — narrow the search.` : `${list.length} icon${list.length === 1 ? "" : "s"}`;
  }

  /** Switches the icon dialog between the uuGDS catalog and the uuBml icon font (its own groups, search by name). */
  function setLib(lib) {
    state.lib = lib; lastLib = lib; $("ib-lib").value = lib;
    if (lib === "bml") {
      loadBml(state.bml.cssUrl);
      const groups = [...new Set(state.bml.icons.map((i) => i.group))];
      $("ib-cat").replaceChildren(new Option("All groups", ""), ...groups.map((g) => new Option(g, g)));
      $("ib-search").placeholder = "Search uuBml icons (name)…"; $("ib-dep").parentElement.hidden = true;
    } else {
      const cats = [...new Set(catalog.icons.map((i) => i.category))].sort();
      $("ib-cat").replaceChildren(new Option("All categories", ""), ...cats.map((c) => new Option(c, c)));
      $("ib-search").placeholder = "Search icons (name, keyword)…"; $("ib-dep").parentElement.hidden = false;
    }
    $("ib-search").value = ""; render();
  }

  function render() {
    if (state?.mode === "state") return renderStates();
    if (state?.lib === "bml") return renderBml();
    const q = $("ib-search").value.trim(), cat = $("ib-cat").value, dep = $("ib-dep").checked, byCode = new Map(catalog.icons.map((i) => [i.code, i]));
    let list = catalog.icons.filter((i) => (dep || !i.deprecated || i.code === state.current) && (!cat || i.category === cat) && (!q || matches(i, q)));
    const grid = $("ib-grid"); grid.replaceChildren();
    const cur = byCode.get(state.current);
    if (cur) grid.append(head("Current"), cell(cur, state.current, state.glyphs)); // what is chosen now comes first
    const sug = !q && !cat ? suggest(state.text, catalog.actions).map((c) => byCode.get(c)).filter((i) => i && i !== cur) : [];
    if (sug.length) grid.append(head("Suggested for this component"), ...sug.map((i) => cell(i, state.current, state.glyphs)));
    if (cur || sug.length) grid.append(head("All icons"));
    if (!q && !cat) list = [...list].sort((a, b) => Number(b.common) - Number(a.common)); // common ones first
    const shown = list.filter((i) => i !== cur).slice(0, MAX);
    grid.append(...shown.map((i) => cell(i, state.current, state.glyphs)));
    $("ib-note").textContent = list.length > MAX ? `Showing ${MAX} of ${list.length} — narrow the search.` : `${list.length} icon${list.length === 1 ? "" : "s"}`;
    if (!state.glyphs) $("ib-note").textContent += " · Previews are not available (the mockup has not loaded the icon fonts yet): names only.";
  }

  function done(value) { box.hidden = true; const r = resolve; resolve = null; r?.(value); }
  $("ib-x").onclick = () => done(null);
  $("ib-search").oninput = render; $("ib-cat").onchange = render; $("ib-dep").onchange = render;
  $("ib-lib").onchange = () => setLib($("ib-lib").value);
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done(null); } });
  box.addEventListener("mousedown", (e) => { if (e.target === box) done(null); });

  /** The state palette: a kind (the colour) and one of the state numbers; resolves with `uubml-state-sNN[-kind]` or null. */
  async function pickState(current) {
    const st = await getBml?.(); if (!st) return null;
    loadBml(st.cssUrl);
    const cur = parseStateCode(current);
    state = { current, mode: "state", states: st };
    $("ib-title").textContent = "Choose a state"; $("ib-search").placeholder = "Filter by number, e.g. 02"; $("ib-dep").parentElement.hidden = true;
    $("ib-cat").replaceChildren(...st.variants.map((v) => new Option(STATE_KINDS[v] ?? v, v)));
    $("ib-cat").value = st.variants.includes(cur?.variant) ? cur.variant : st.variants.includes("active") ? "active" : st.variants[0];
    $("ib-search").value = ""; $("ib-cur").textContent = current ? `Current: ${current}` : "";
    renderStates(); box.hidden = false; $("ib-search").focus();
    return new Promise((r) => { resolve = r; });
  }

  return {
    /** Loads the icon font stylesheets from the CDN folder the mockup page used (needed to draw icons anywhere in the app). */
    ensureFonts: loadFonts,
    available: async () => Boolean((catalog ??= await getCatalog())),
    /** Loads the stylesheet of the uuBml icon font so that its icons and the state icons can be drawn in the panel. */
    async ensureBmlFonts() { const b = await getBml?.(); if (b) loadBml(b.cssUrl); return b; },
    /** Resolves with the chosen icon code, or null when cancelled. */
    async pick({ current, text, base, mode = "icon" }) {
      if (mode === "state") return pickState(current);
      catalog ??= await getCatalog();
      const bml = await getBml?.().catch(() => null), hasBml = Boolean(bml?.icons?.length);
      if (!catalog && !hasBml) return null;
      if (catalog) loadFonts(base);
      const lib = !hasBml ? "gds" : !catalog ? "bml" : isBmlCode(current) ? "bml" : current ? "gds" : lastLib; // the current value decides, an empty one takes the last choice
      state = { current, text, glyphs: Boolean(base), mode: "icon", lib, bml };
      $("ib-title").textContent = "Choose an icon";
      const sel = $("ib-lib"); sel.hidden = !(hasBml && catalog); // the library switch is only offered when both catalogs are there
      $("ib-dep").checked = false; $("ib-cur").textContent = current ? `Current: ${current}` : "";
      setLib(lib); box.hidden = false; $("ib-search").focus();
      return new Promise((r) => { resolve = r; });
    },
  };
}
