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
  /** The ways to make a sitemap: a heading, and one line per way (what it is, and what it does) instead of buttons that need a tooltip to be understood. */
  const SVG = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const WAYS = {
    screens: SVG('<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/><path d="M11 7.5h3a3 3 0 0 1 3 3V13"/>'),
    link: SVG('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    agent: SVG('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>'),
    empty: SVG('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M12 11v6M9 14h6"/>'),
  };
  const makeMap = (s, text) => {
    const way = (icon, label, hint, title, fn, disabled = false) => el("button", { type: "button", className: "pm-opt", title, disabled, role: "menuitem", onclick: run(fn) },
      el("span", { className: "pm-oico", innerHTML: WAYS[icon] }), el("span", { className: "pm-otxt" }, el("span", { className: "pm-otitle", textContent: label }), el("small", { className: "pm-ohint", textContent: hint })));
    const n = s.screens;
    return [el("div", { className: "pm-sec", textContent: "Sitemap" }), el("div", { className: "pm-empty", textContent: text }),
      way("screens", "From the screens", n ? `A first map of the ${n} screen${n === 1 ? "" : "s"} and the links between them` : "No screens in the project yet", "A first map made of the screens that exist and the links between them", actions.fromScreens, !n),
      way("link", "From a link…", "Read an existing site, book or portal and pick its pages", "Read the pages of an existing web site, uuBookKit book or uuManagementKit document / portal and pick all or some of them", actions.fromLink),
      way("agent", "Ask the agent…", "Describe the site and let the agent propose a map", "Describe the site or portal in Plan mode: the agent proposes the map", actions.askAgent),
      way("empty", "Empty map", "One page; add the others yourself", "Start with one page and add the others", actions.empty)];
  };
  function render() {
    const s = state(), parts = [];
    if (show === "sitemap") {
    if (s.sitemap) parts.push(row("@sitemap", "Open the sitemap", `${s.sitemap.built} of ${s.sitemap.pages} ${s.sitemap.portal ? "portals and sheets" : "pages"} with a screen`, s.sitemap.hidden));
    else parts.push(...makeMap(s, "This project has no sitemap yet. Start one:"));
    menu.replaceChildren(...parts); return;
    }
    // back to the canvas: the Canvas button next to it (and Esc)
    if (!s.plans.length) parts.push(el("div", { className: "pm-sec", textContent: "Plans" }), el("div", { className: "pm-empty", textContent: "No plans yet. A plan starts in the message field: switch it to Plan and describe what to plan." }));
    for (const p of [...s.plans].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))) parts.push(row(p.slug, p.title, ago(p.mtime), false, STATUS[p.status] ?? p.status));
    // a project that is not a web site or portal has no Sitemap button: the map is made from here, and the button comes with it
    if (s.offered === false && !s.sitemap) parts.push(el("i", { className: "pm-sep" }), ...makeMap(s, "A map of the pages of a web site or portal. Add one:"));
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
