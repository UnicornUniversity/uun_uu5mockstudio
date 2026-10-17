const $ = (id) => document.getElementById(id);
const SETS = ["icons", "arrow", "edit", "media", "layout", "uiaction", "it", "education", "chart", "communication", "commerce", "home", "badge", "security", "shape", "time", "weather", "user", "navigation", "transport", "alert"];
const MAX = 480;

/** `uugds-plus` -> its icon font family; `uugdsstencil-edit-x` -> the "edit" set. */
export const fontOf = (code) => `uu_gds_svgg01-${code.startsWith("uugdsstencil-") ? code.split("-")[1] : "icons"}`;

/** A rendered icon (the icon fonts must be loaded: see ensureFonts). */
export function iconGlyph(code) {
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
export function createIconPicker({ getCatalog }) {
  let catalog = null, loadedBase = null, resolve = null, state = null;
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

  function render() {
    const q = $("ib-search").value.trim(), cat = $("ib-cat").value, dep = $("ib-dep").checked, byCode = new Map(catalog.icons.map((i) => [i.code, i]));
    let list = catalog.icons.filter((i) => (dep || !i.deprecated || i.code === state.current) && (!cat || i.category === cat) && (!q || matches(i, q)));
    const grid = $("ib-grid"); grid.replaceChildren();
    const sug = !q && !cat ? suggest(state.text, catalog.actions).map((c) => byCode.get(c)).filter(Boolean) : [];
    if (sug.length) { grid.append(Object.assign(document.createElement("h5"), { textContent: "Suggested for this component" }), ...sug.map((i) => cell(i, state.current, state.glyphs))); grid.append(Object.assign(document.createElement("h5"), { textContent: "All icons" })); }
    if (!q && !cat) list = [...list].sort((a, b) => Number(b.common) - Number(a.common)); // common ones first
    const shown = list.slice(0, MAX);
    grid.append(...shown.map((i) => cell(i, state.current, state.glyphs)));
    $("ib-note").textContent = list.length > MAX ? `Showing ${MAX} of ${list.length} — narrow the search.` : `${list.length} icon${list.length === 1 ? "" : "s"}`;
    if (!state.glyphs) $("ib-note").textContent += " · Previews are not available (the mockup has not loaded the icon fonts yet): names only.";
  }

  function done(value) { box.hidden = true; const r = resolve; resolve = null; r?.(value); }
  $("ib-cancel").onclick = () => done(null);
  $("ib-search").oninput = render; $("ib-cat").onchange = render; $("ib-dep").onchange = render;
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done(null); } });
  box.addEventListener("mousedown", (e) => { if (e.target === box) done(null); });

  return {
    /** Loads the icon font stylesheets from the CDN folder the mockup page used (needed to draw icons anywhere in the app). */
    ensureFonts: loadFonts,
    available: async () => Boolean((catalog ??= await getCatalog())),
    /** Resolves with the chosen icon code, or null when cancelled. */
    async pick({ current, text, base }) {
      catalog ??= await getCatalog();
      if (!catalog) return null;
      loadFonts(base);
      state = { current, text, glyphs: Boolean(base) };
      const cats = [...new Set(catalog.icons.map((i) => i.category))].sort();
      $("ib-cat").replaceChildren(new Option("All categories", ""), ...cats.map((c) => new Option(c, c)));
      $("ib-search").value = ""; $("ib-dep").checked = false; $("ib-cur").textContent = current ? `Current: ${current}` : "";
      render(); box.hidden = false; $("ib-search").focus();
      return new Promise((r) => { resolve = r; });
    },
  };
}
