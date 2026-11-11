const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); n.append(...kids.filter((k) => k != null)); return n; };
const STATUS = { draft: "draft", approved: "approved", built: "built", discarded: "discarded" };

/**
 * The menus of the toolbar, one for the plans of the project and one for its sitemap (`show`: "plans" | "sitemap"): to show on the canvas (a hidden card comes back),
 * to hide again, and, for the sitemap, to create it when there is none. `state()` = { sitemap: { pages, built, hidden } | null, plans: [{ slug, title, status, hidden }], screens (how many) };
 * `actions` = { show(key), toggle(key), fromScreens(), fromLink(), empty(), askAgent() }; `key` is a slug or "@sitemap".
 */
/** "just now", "5 min ago", "3 h ago", "yesterday", "12 days ago" (older: the date). */
export function ago(ms, now = Date.now()) {
  if (!ms) return "";
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); if (d === 1) return "yesterday"; if (d < 30) return `${d} days ago`;
  return new Date(ms).toLocaleDateString();
}

export function createPlansMenu({ button, menu, state, actions, show = "plans" }) {
  const wrap = button.parentElement;
  const setOpen = (on) => { menu.hidden = !on; button.setAttribute("aria-expanded", String(on)); if (on) render(); };
  const run = (fn) => async () => { setOpen(false); await fn(); };
  const row = (key, title, meta, hidden, chip) => {
    const main = el("button", { type: "button", className: "pm-main", role: "menuitem", title: "Open it instead of the canvas (Esc goes back)" }, el("span", { className: "pm-title", textContent: title }), meta ? el("small", { className: "pm-meta", textContent: meta }) : null, chip ? el("span", { className: "pm-chip", textContent: chip }) : null);
    main.onclick = run(() => actions.show(key));
    const del = key === "@sitemap" ? null : el("button", { type: "button", className: "pm-eye pm-del", innerHTML: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>', title: "Delete this plan (the file goes to the trash)" });
    if (del) { del.setAttribute("aria-label", `Delete ${title}`); del.onclick = async (e) => { e.stopPropagation(); await actions.remove?.(key, title); render(); }; }
    return el("div", { className: `pm-row${state().viewing === key ? " cur" : ""}`, role: "none" }, main, del);
  };
  /** The ways to make a sitemap, with the line above them. */
  const makeMap = (s, text) => {
    const b = (label, title, fn, disabled = false) => el("button", { type: "button", className: "pm-act", textContent: label, title, disabled, role: "menuitem", onclick: run(fn) });
    return [el("div", { className: "pm-empty", textContent: text }), el("div", { className: "pm-acts" }, b("From the screens", s.screens ? "A first map made of the screens that exist and the links between them" : "The project has no screens yet", actions.fromScreens, !s.screens), b("From a link…", "Read the pages of an existing web site, uuBookKit book or uuManagementKit document / portal and pick all or some of them", actions.fromLink), b("Empty map", "Start with one page and add the others", actions.empty), b("Ask the agent…", "Describe the site or portal in Plan mode: the agent proposes the map", actions.askAgent))];
  };
  function render() {
    const s = state(), parts = [];
    if (show === "sitemap") {
    if (s.sitemap) parts.push(row("@sitemap", "Open the sitemap", `${s.sitemap.built} of ${s.sitemap.pages} ${s.sitemap.portal ? "portals and sheets" : "pages"} with a screen`, s.sitemap.hidden));
    else parts.push(...makeMap(s, "This project has no sitemap yet. Make one:"));
    menu.replaceChildren(...parts); return;
    }
    if (s.viewing && actions.closeView) parts.push(el("button", { type: "button", className: "pm-act", role: "menuitem", textContent: "← Back to the canvas", title: "Esc", onclick: run(actions.closeView) }));
    if (!s.plans.length) parts.push(el("div", { className: "pm-empty", textContent: "No plans yet. Switch the message field to Plan and describe what to plan." }));
    for (const p of [...s.plans].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))) parts.push(row(p.slug, p.title, ago(p.mtime), false, STATUS[p.status] ?? p.status));
    // a project that is not a web site or portal has no Sitemap button: the map is made from here, and the button comes with it
    if (s.offered === false && !s.sitemap) parts.push(el("i", { className: "pm-sep" }), ...makeMap(s, "Add a sitemap (a map of the pages of a web site or portal):"));
    menu.replaceChildren(...parts);
  }
  // an existing sitemap is no list: the button itself opens it (and closes it again) and is lit while it is shown
  const direct = () => show === "sitemap" && Boolean(state().sitemap);
  const sync = () => {
    const s = state(), on = show === "sitemap" ? s.viewing === "@sitemap" : Boolean(s.viewing) && s.viewing !== "@sitemap";
    button.classList.toggle("on", on); button.setAttribute("aria-pressed", String(on));
    button.querySelector(".zcar")?.toggleAttribute("hidden", direct());
    if (direct()) { button.removeAttribute("aria-haspopup"); button.removeAttribute("aria-expanded"); } else { button.setAttribute("aria-haspopup", "menu"); button.setAttribute("aria-expanded", String(!menu.hidden)); }
  };
  button.onclick = (e) => { e.stopPropagation(); if (direct()) { setOpen(false); return actions.toggleView?.("@sitemap"); } setOpen(menu.hidden); };
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !e.target.closest(`#${wrap.id}`)) setOpen(false); }, true); // capture: the cards of the canvas stop the event on their way up
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setOpen(false); e.stopPropagation(); button.focus(); } }, true);
  return { render: () => { sync(); if (!menu.hidden) render(); }, sync, close: () => setOpen(false) };
}
