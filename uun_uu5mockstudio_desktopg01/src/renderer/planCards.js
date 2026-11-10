import { markdownDoc, esc } from "./markdown.js";
import { parsePlan, serializePlan } from "./planDoc.js";
import { extractPlan, replaceTreeBlock, removeTreeBlock } from "./planTree.js";
import { renderTree } from "./planView.js";
import { replaceSitemapBlock, countPages, countSections, updateNode, reviseMessage, addScreenPage, sitemapFromScreens, fileFor, countBuilt, foldable, defaultCollapsed } from "./sitemap.js";
import { renderSitemap } from "./sitemapView.js";

const GAP = 120, W = 520, H = 640, SITEMAP_W = 840, SITEMAP_H = 920, MIN_W = 320, MIN_H = 240, TITLE_H = 34;
const STATUS_TEXT = { draft: "draft", approved: "approved, building", built: "built", discarded: "discarded" };

/**
 * The plans of the project (plans/*.md) as cards on the canvas, next to the screens: a card reads the plan (view mode) or edits its Markdown (edit mode).
 * The file is the truth: the card writes it on every change (after a short pause) and shows what changes in it from outside (the agent, an editor, the chat card).
 * `api` = { read(slug) -> { text }, write(slug, text) }; `ctx` = { adoptPlanMap(slug), saveSitemap(sitemap), restoreSitemap(), hasSitemap(), approve(slug), askAgent(slug, message, label), flowEdges() (the links between the screens), screens() (their file names), createScreen({ slug, node, file, where }), createScreens({ slug, items }), showDetail(name, host), docsDescribe(names), openScreen(file), isScreen(file), changed() (positions changed), getInset() }.
 */
export function createPlanCards({ root, world, canvas, api, ctx }) {
  const cards = new Map(); // slug -> card state
  let saved = {}; // slug -> { x, y, w, h } from the saved layout
  let pendingSeparate = 0; // after a project is opened: the cards of the plans and the sitemap are separated once (an older layout may have them on top of each other)

  const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); n.append(...kids.filter((k) => k != null)); return n; };

  function place(c) { c.el.style.left = c.x + "px"; c.el.style.top = c.y + "px"; c.el.style.width = c.w + "px"; c.el.style.height = c.h + "px"; ctx.moved?.(); }

  const rectOf = (c) => ({ x: c.x, y: c.y - TITLE_H, w: c.w, h: c.h + TITLE_H });
  const hit = (a, b, m = 24) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
  /** A place for the card where it overlaps no other card and no screen: in a column left of the screens, as far up as there is room. */
  function spotFor(c) {
    const screens = Object.values(canvas.rects()).map((r) => ({ x: r.x, y: r.y - TITLE_H, w: r.w, h: r.h + TITLE_H }));
    const all = [...[...cards.values()].filter((o) => o !== c && o.placed && !o.hidden).map(rectOf), ...screens]; // a hidden card takes no room; it is moved when it is shown and finds the place taken
    const x = (screens.length ? Math.min(...screens.map((r) => r.x)) : 0) - GAP - c.w;
    let y = 0; while (y < 40000 && all.some((r) => hit({ x, y: y - TITLE_H, w: c.w, h: c.h + TITLE_H }, r))) y += 40;
    return { x, y };
  }
  /** Cards that were saved on top of each other (an older layout) are moved apart, the later one of two. Runs once after a project is opened. */
  function separate() {
    const list = [...cards.values()].filter((c) => c.placed && !c.hidden);
    for (let i = 1; i < list.length; i++) {
      if (!list.slice(0, i).some((o) => hit(rectOf(o), rectOf(list[i]), 0))) continue;
      const sp = spotFor(list[i]); list[i].x = sp.x; list[i].y = sp.y; place(list[i]); ctx.changed?.();
    }
  }
  /** Does the card lie on another visible card or on a screen? */
  function collides(c) {
    const me = rectOf(c);
    return [...cards.values()].some((o) => o !== c && o.placed && !o.hidden && hit(rectOf(o), me, 0)) || Object.values(canvas.rects()).some((r) => hit({ x: r.x, y: r.y - TITLE_H, w: r.w, h: r.h + TITLE_H }, me, 0));
  }
  /** All the visible cards one under another in a column left of the screens (the sitemap first), no overlaps. */
  function arrange() {
    const list = [...cards.values()].filter((c) => c.placed && !c.hidden).sort((a, b) => (b.kind === "sitemap") - (a.kind === "sitemap") || a.y - b.y);
    if (!list.length) return;
    const screens = Object.values(canvas.rects()), minX = screens.length ? Math.min(...screens.map((r) => r.x)) : 0, maxW = Math.max(...list.map((c) => c.w));
    let y = 0;
    for (const c of list) { c.x = minX - GAP - maxW; c.y = y; y += c.h + TITLE_H + 60; place(c); }
    ctx.changed?.();
  }
  let zTop = 4; // the card that was clicked comes to the front

  /** The component tree of the plan: the same diagram / outline as in the chat, with a Hide / Show switch. A move of a box is written into the file. */
  function treeSection(c, tree) {
    c.te ??= { mode: "diagram", collapsed: [], sel: [], full: false };
    c.te.tree = tree; // the file is the truth
    const n = (t) => 1 + (t.children ?? []).reduce((a, k) => a + n(k), 0);
    const hide = el("button", { type: "button", className: "pc-mini", textContent: c.treeHidden ? "Show" : "Hide", title: c.treeHidden ? "Show the component tree" : "Hide the component tree" });
    hide.setAttribute("aria-expanded", String(!c.treeHidden));
    hide.onclick = () => { c.treeHidden = !c.treeHidden; renderView(c); };
    const drop = el("button", { type: "button", className: "pc-mini", textContent: "Remove", title: "Take the component tree out of the plan (the rest of the plan stays)" });
    drop.onclick = () => { c.body = removeTreeBlock(c.body); c.ta.value = c.body; c.te = null; flush(c); };
    const box = el("div", { className: "pc-tree" }, el("div", { className: "pc-treehead" }, el("h4", { textContent: `Component tree (${n(tree)})` }), hide, c.status === "draft" ? drop : null));
    if (c.treeHidden) return box;
    const tctx = {
      change: (e) => { if (e.tree !== tree) { c.body = replaceTreeBlock(c.body, e.tree); c.ta.value = c.body; flush(c); } else renderView(c); },
      checkNames: () => {}, showDetail: ctx.showDetail,
    };
    box.append(renderTree(c.te, tctx, { editable: false, movable: c.status === "draft", known: new Set(c.known ?? []), fullscreenable: false }));
    return box;
  }
  /** Which library components of the tree the documentation knows (the others are flagged in the diagram). */
  async function refreshKnown(c, tree) {
    const names = []; const walk = (t) => { if (t.kind === "library") names.push(t.name); (t.children ?? []).forEach(walk); }; walk(tree);
    const key = [...new Set(names)].join("|");
    if (!names.length || key === c.knownKey) return;
    c.knownKey = key;
    const r = await ctx.docsDescribe?.([...new Set(names)]);
    const known = r?.names ?? [];
    if (JSON.stringify(known) !== JSON.stringify(c.known ?? [])) { c.known = known; renderView(c); }
  }

  /** The editor of a selected page takes room below the map: the map moves so that the selected pages stay in sight. */
  function keepSelectedInView(scroll) {
    const sel = [...scroll.querySelectorAll(".sm-node.sel")].at(-1); if (!sel) return;
    const s = scroll.getBoundingClientRect(), r = sel.getBoundingClientRect(), pad = 24;
    const ky = s.height / (scroll.clientHeight || 1) || 1, kx = s.width / (scroll.clientWidth || 1) || 1; // the card is scaled with the canvas
    const dy = (r.top - s.top) / ky < pad ? (r.top - s.top) / ky - pad : (r.bottom - s.bottom) / ky > -pad ? (r.bottom - s.bottom) / ky + pad : 0;
    const dx = (r.left - s.left) / kx < pad ? (r.left - s.left) / kx - pad : (r.right - s.right) / kx > -pad ? (r.right - s.right) / kx + pad : 0;
    if (dy) scroll.scrollTop += dy; if (dx) scroll.scrollLeft += dx;
  }

  // the right side of the view: the editor and the comments of the selected page(s) (where the Edit mode has its panel on the canvas)
  const sideEl = () => document.getElementById("smside"), sideBody = () => document.getElementById("smside-body");
  function sideHost(on) { const a = sideEl(); if (!a) return undefined; a.hidden = !on; return on ? sideBody() : undefined; }
  // ---- the view: a plan or the sitemap shown INSTEAD of the canvas (the card fills the work area; the chat stays; tabs switch between Canvas, Sitemap and plans)
  let dv = null, viewCard = null;
  function ensureView() {
    if (dv) return dv;
    const host = document.getElementById("canvas"); if (!host) return null;
    dv = el("div", { id: "docview", hidden: true }, el("div", { className: "dv-body" }));
    for (const ev of ["pointerdown", "wheel", "dblclick", "contextmenu", "mousedown"]) dv.addEventListener(ev, (e) => e.stopPropagation()); // the canvas below does not pan, zoom or select
    host.append(dv); return dv;
  }
  const tabsOf = () => [...(cards.has("@sitemap") ? [["@sitemap", "Sitemap"]] : []), ...[...cards].filter(([k]) => k !== "@sitemap").map(([k, c]) => [k, c.title || k])];
  function fitView() {
    if (!dv || dv.hidden) return;
    const ins = ctx.getInset?.() ?? {};
    dv.style.paddingTop = `${ins.top ?? 0}px`; // the whole canvas: a floating chat lies over the view, as it lies over the canvas
  }
  const paintTabs = () => {}; // the toolbar (Sitemap, Plans) switches the views; there is no second row of chips
  function openView(key) {
    const c = cards.get(key), host = ensureView(); if (!c || !host) return false;
    if (viewCard && viewCard !== c) closeView(true);
    if (viewCard !== c) {
      viewCard = c; c.expanded = true;
      c.home = { parent: c.el.parentNode, next: c.el.nextSibling, wasHidden: c.el.hidden };
      c.el.hidden = false; c.el.classList.add("pc-inview"); dv.querySelector(".dv-body").append(c.el);
      host.hidden = false; dv.hidden = false;
      c.ro = new ResizeObserver(fitView); for (const id of ["canvas"]) { const n = document.getElementById(id); if (n) c.ro.observe(n); }
      c.fitTimer = setInterval(fitView, 400);
      c.esc = (e) => { if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("#dialog:not([hidden]),#confirm:not([hidden]),.pm-pop:not([hidden]),.sm-rename,.sm-ctx") && !(e.target instanceof HTMLElement && e.target.closest("select,#plansmenu,#mapmenu,#projmenu"))) { e.preventDefault(); e.stopPropagation(); closeView(); } };
      document.addEventListener("keydown", c.esc, true);
    }
    fitView(); paintTabs(); renderView(c); ctx.viewChanged?.(); return true;
  }
  function closeView(keepOpen = false) {
    const c = viewCard; if (!c) return;
    viewCard = null; c.expanded = false;
    document.querySelectorAll(".sm-rename,.sm-ctx").forEach((x) => x.remove()); // an open rename field or menu does not outlive the view
    document.removeEventListener("keydown", c.esc, true); c.ro?.disconnect(); clearInterval(c.fitTimer);
    c.el.classList.remove("pc-inview");
    if (c.home?.parent?.isConnected) c.home.parent.insertBefore(c.el, c.home.next?.parentNode === c.home.parent ? c.home.next : null);
    c.el.hidden = Boolean(c.hidden); c.home = null;
    if (!keepOpen) { dv.hidden = true; sideHost(false); }
    renderView(c); if (!keepOpen) ctx.viewChanged?.();
  }
  const setExpanded = (c, on) => { if (on) openView(c.slug); else closeView(); };

  /**
   * The sitemap as a section of a card: a header (progress, fold all / unfold all, hide) and the map in a box of its own. Used by the card of a plan (the map is a
   * proposal in it) and by the card of the sitemap of the project. `io` = { slug (of the plan, null for the project), write(sitemap) saves a changed map, revise(extra) | null }.
   */
  function mapSection(c, sitemap, io, note = "") {
    c.collapsed ??= new Set(defaultCollapsed(sitemap));
    const exists = (f) => ctx.isScreen?.(f) ?? false, built = countBuilt(sitemap, exists), pages = countPages(sitemap), sections = countSections(sitemap);
    const mini = (label, title, fn) => { const b = el("button", { type: "button", className: "pc-mini", textContent: label, title }); b.onclick = fn; return b; };
    const hide = mini(c.mapHidden ? "Show" : "Hide", c.mapHidden ? "Show the sitemap" : "Hide the sitemap", () => { c.mapHidden = !c.mapHidden; renderView(c); });
    hide.setAttribute("aria-expanded", String(!c.mapHidden));
    // the map as a picture, to share it
    const exportBtn = ctx.exportSitemap ? mini("Export", "The map as a picture to share", () => {
      document.querySelector(".sm-ctx")?.remove();
      const menu = el("div", { className: "sm-ctx", role: "menu" }), r = exportBtn.getBoundingClientRect();
      const close = () => { menu.remove(); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); };
      const away = (e) => { if (!menu.contains(e.target) && e.target !== exportBtn) close(); }, esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
      for (const [label, kind] of [["Save as PNG…", "png"], ["Save as SVG…", "svg"], ["Copy the picture", "copy"]]) {
        const b = el("button", { type: "button", role: "menuitem", className: "sm-ci", textContent: label }); b.onclick = () => { close(); ctx.exportSitemap(kind, sitemap, c.collapsed); }; menu.append(b);
      }
      document.body.append(menu); menu.style.left = `${Math.max(6, Math.min(r.left, innerWidth - menu.offsetWidth - 6))}px`; menu.style.top = `${r.bottom + 4}px`;
      document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc, true); menu.querySelector("button")?.focus();
    }) : null;
    // the card fills the whole work area (the canvas is covered, not changed); it is moved out of the scaled canvas for that, and back
    const expand = mini(c.expanded ? "Canvas" : "Full view", c.expanded ? "Back to the canvas (Esc)" : "The map instead of the canvas", () => setExpanded(c, !c.expanded));
    expand.setAttribute("aria-pressed", String(Boolean(c.expanded)));
    const head = el("div", { className: "pc-treehead" }, el("h4", { textContent: `Sitemap (${pages} pages${sections ? `, ${sections} sections` : ""})` }), el("span", { className: "pc-progress", textContent: `${built} of ${pages} with a screen`, title: "Pages that have a screen: designed. The others are only in the map." }),
      c.mapHidden ? null : mini("Fold all", "Fold every branch below the first level", () => { c.collapsed = new Set(foldable(sitemap, 1)); renderView(c); }),
      c.mapHidden ? null : mini("Unfold all", "Show every page", () => { c.collapsed = new Set(); renderView(c); }), exportBtn, c.expanded ? null : hide, c.expanded ? null : expand);
    head.querySelector(".pc-mini")?.style.setProperty("margin-left", "auto");
    const box = el("div", { className: "pc-sitemap" }, head);
    if (note || io.adopt) {
      const row = el("p", { className: "pc-note", textContent: note });
      if (io.adopt) { const b = el("button", { type: "button", className: "pc-mini", textContent: "Use as the sitemap of the project", title: "The map becomes the sitemap of the project (the plan keeps its text); a map it replaces is kept" }); b.onclick = io.adopt; row.append(" ", b); }
      box.append(row);
    }
    if (c.mapHidden) return box;
    box.append(el("div", { className: "pc-mapbox" }, renderSitemap(sitemap, {
      editorHost: c.expanded ? sideHost(true) : undefined,
      collapsed: c.collapsed, onToggle: (id) => { if (!c.collapsed.delete(id)) c.collapsed.add(id); renderView(c); },
      sel: c.sel ?? null, sels: c.sels?.length ? c.sels : c.sel ? [c.sel] : [], isScreen: exists,
      onSelect: (path, multi) => {
        const key = (p) => p.join(".");
        if (!path) { c.sel = null; c.sels = []; return renderView(c); } // a click on the empty map
        if (!multi) { // a click on the only selected page deselects it
          const only = c.sels?.length === 1 ? c.sels[0] : c.sel && !c.sels?.length ? c.sel : null;
          if (only && key(only) === key(path)) { c.sel = null; c.sels = []; } else { c.sel = path; c.sels = [path]; }
          return renderView(c);
        }
        const cur = c.sels?.length ? c.sels : c.sel ? [c.sel] : [];
        c.sels = cur.some((p) => key(p) === key(path)) ? cur.filter((p) => key(p) !== key(path)) : [...cur, path];
        c.sel = c.sels.at(-1) ?? null; renderView(c);
      },
      onBulk: (sm) => io.write(sm),
      onChange: (sm, path) => { c.sel = path; c.sels = [path]; io.write(sm); },
      onCreateMany: (items) => {
        let cur = sitemap; const out = [];
        for (const it of items) { const file = it.node.file ?? fileFor(cur, it.node); if (!it.node.file) cur = updateNode(cur, it.path, { file }); out.push({ node: it.node, file, where: it.where }); }
        if (cur !== sitemap) io.write(cur);
        ctx.createScreens?.({ slug: io.slug, items: out });
      },
      onOpen: (f) => ctx.openScreen?.(f),
      links: ctx.flowEdges ? {
        on: Boolean(c.linksOn), edges: c.edges ?? [], screens: ctx.screens?.() ?? [],
        onToggle: async () => { c.linksOn = !c.linksOn; if (c.linksOn) { c.edges = (await ctx.flowEdges()) ?? []; if (!Array.isArray(c.edges)) c.edges = []; } renderView(c); },
        onAdd: (f) => io.write(addScreenPage(sitemap, f, c.sel ?? [])),
      } : undefined,
      notes: ctx.loadNotes?.(c.slug) ?? (c.notes ??= []), onNotes: (l) => ctx.saveNotes?.(c.slug, l), draft: c.draft ?? "", onDraft: (v) => { c.draft = v; }, onRevise: io.revise ?? undefined,
      onCreate: ({ node, path, file, where }) => {
        if (node.file !== file) io.write(updateNode(sitemap, path, { file }));
        ctx.createScreen?.({ slug: io.slug, node, file, where });
      },
    })));
    return box;
  }

  /** What a card of a plan does with its map: the map is a proposal inside the plan file. */
  const planIo = (c) => ({
    slug: c.slug,
    write: (sm) => { c.body = replaceSitemapBlock(c.body, sm); c.ta.value = c.body; flush(c); },
    revise: c.status !== "discarded" && ctx.askAgent ? (extra) => ctx.askAgent(c.slug, reviseMessage({ slug: c.slug, sm: c.sitemap, extra, body: c.body }), "Revise the sitemap.") : null,
    adopt: ctx.adoptPlanMap ? () => ctx.adoptPlanMap(c.slug) : null,
  });
  /** What the card of the sitemap of the project does with it: it is saved in sitemap.json at once. */
  const projectIo = (c) => ({
    slug: null,
    write: (sm) => { c.sm = sm; renderView(c); ctx.saveSitemap?.(sm); },
    revise: ctx.askAgent ? (extra) => ctx.askAgent(null, reviseMessage({ slug: null, sm: c.sm, extra }), "Revise the sitemap.") : null,
  });

  /** Puts the parts into the card; the scroll of the card and of the map is kept, the selected page stays in sight. */
  function paint(c, parts) {
    const top = c.view.scrollTop, map = c.view.querySelector(".sm-scroll"), mapPos = map ? [map.scrollLeft, map.scrollTop] : null;
    c.view.replaceChildren(...parts);
    c.view.scrollTop = top; // a click inside the card does not throw the reader to the top
    const again = c.view.querySelector(".sm-scroll"); if (again && mapPos) { again.scrollLeft = mapPos[0]; again.scrollTop = mapPos[1]; }
    if (again) keepSelectedInView(again);
    c.view.querySelector(".sm")?.draw?.();
  }

  /** A plan that cannot be drawn shows why, instead of leaving the card empty (and the cards of the other plans unmade). */
  function renderView(c) {
    try { renderViewNow(c); } catch (e) {
      console.error("plan card", c.slug, e);
      c.view.replaceChildren(el("p", { className: "mute", textContent: `This plan could not be shown (${e?.message ?? e}). Its file is plans/${c.slug}.md: choose Edit to read or fix its text.` }));
    }
  }
  function renderViewNow(c) {
    if (c.kind === "sitemap") { syncHead(c); return paint(c, [mapSection(c, c.sm, projectIo(c))]); }
    const { text, tree, questions, sitemap } = extractPlan(c.body);
    if (c.expanded && !sitemap) sideHost(false);
    c.sitemap = sitemap; c.hasTree = Boolean(tree); syncHead(c);
    const parts = [];
    if (!sitemap && c.status !== "discarded" && ctx.askAgent && (ctx.sitemapOffered?.() ?? true)) { // only in a project of a web site or portal: a plan of one component needs no map
      // at the top: below a long tree it would not be seen
      const add = el("button", { type: "button", className: "pc-mini accent", textContent: tree || text.trim() ? "Make a sitemap from this plan" : "Add a sitemap", title: "The agent derives the tree of the pages (a map of the web site or portal) from this plan; you review it, then approve it as the sitemap of the project" });
      add.onclick = () => ctx.askAgent(c.slug, `Revise this plan, it is the file plans/${c.slug}.md (the user may have edited it, so start from this text). Make a SITEMAP from it: add the pages, groups and sections that this plan describes (or implies) as a \`uu5-sitemap\` block, the tree of the pages of the web site or portal. It is not a screen and not a component tree: a thing that is only a part of one page is a section of that page. Keep the rest of the plan as it is and answer with the whole plan.\n\n${c.body}`, "Make a sitemap from the plan.");
      parts.push(el("div", { className: "pc-bar" }, el("span", { textContent: "This plan has no sitemap (map of the pages) yet." }), el("span", { className: "pc-bar-acts" }, add)));
    }
    const doc = el("div", { innerHTML: markdownDoc(text, { known: (f) => ctx.isScreen?.(f) ?? true }) });
    if (!doc.innerHTML.trim() && !tree) doc.innerHTML = '<p class="mute">The plan is empty. Choose Edit to write it.</p>';
    parts.push(doc);
    if (sitemap) parts.push(mapSection(c, sitemap, planIo(c), ctx.hasSitemap?.() ? "Approving this plan replaces the sitemap of the project; the current one is kept and can be taken back." : "Approving this plan makes this map the sitemap of the project (a card of its own).")); // the text first, then the map and the tree, each of them only when the plan has it
    if (tree) { parts.push(treeSection(c, tree)); refreshKnown(c, tree); }
    if (questions.length) parts.push(el("div", { innerHTML: `<h4>Questions</h4><ul>${questions.map((x) => `<li>${esc(x.question)}${x.options?.length ? ` <span class="mute">(${x.options.map((o) => esc(o.label)).join(" / ")})</span>` : ""}</li>`).join("")}</ul>` }));
    paint(c, parts);
  }

  function syncHead(c) {
    if (c.kind === "sitemap") {
      const pages = countPages(c.sm), built = countBuilt(c.sm, (f) => ctx.isScreen?.(f) ?? false);
      c.name.textContent = "Sitemap"; c.name.title = "sitemap.json"; c.stat.textContent = `${pages} pages${countSections(c.sm) ? ` · ${countSections(c.sm)} sections` : ""} · ${built} with a screen`; c.el.dataset.status = "sitemap";
      c.modeBtn.hidden = true; c.buildBtn.hidden = true; c.delBtn.hidden = true; c.view.hidden = false; c.ta.hidden = true;
      return;
    }
    c.name.textContent = c.title; c.name.title = `plans/${c.slug}.md`;
    c.stat.textContent = c.status === "approved" && !c.hasTree && (c.sitemap || /The sitemap of this plan was approved/.test(c.body)) ? "map approved" : STATUS_TEXT[c.status] ?? c.status; c.el.dataset.status = c.status;
    c.modeBtn.textContent = c.mode === "edit" ? "Done" : "Edit"; c.modeBtn.setAttribute("aria-pressed", String(c.mode === "edit"));
    c.modeBtn.title = c.mode === "edit" ? "Back to reading the plan (⌘E / Ctrl+E)" : "Edit the Markdown of the plan (⌘E / Ctrl+E)";
    c.buildBtn.hidden = c.status !== "draft";
    const mapOnly = Boolean(c.sitemap && !c.hasTree); // a sitemap alone is agreed on, not built
    c.buildBtn.textContent = mapOnly ? "Approve the map" : "Approve & build";
    c.buildBtn.title = mapOnly ? "Agree on the structure. Nothing is built: create the screens page by page" : "";
    c.view.hidden = c.mode === "edit"; c.ta.hidden = c.mode !== "edit";
  }

  /** Takes the text of the file into the card (the title, status and body); the editor keeps what is being typed. */
  function apply(c, text) {
    const p = parsePlan(text), was = c.status, known = Boolean(c.text);
    c.text = text; c.meta = p.meta; c.status = p.meta.status || "draft"; c.title = p.meta.title || p.body.match(/^#\s+(.+)$/m)?.[1].trim() || c.slug;
    if (!(c.mode === "edit" && document.activeElement === c.ta)) { c.body = p.body; c.ta.value = p.body; }
    renderView(c); syncHead(c);
    // a plan that is no longer a proposal (approved, built, discarded) leaves the canvas: the sitemap or the screens are what is left of it; the Plans button brings it back
    if (known && was === "draft" && c.status !== "draft" && !c.hidden) setHidden(c, true);
  }

  async function reload(c) {
    const r = await api.read(c.slug).catch(() => null);
    if (r && !r.error && r.text !== c.text) apply(c, r.text);
  }

  /** The text of the editor is written after a short pause (and at once when the editor is left). */
  function flush(c) {
    clearTimeout(c.timer); c.timer = null;
    const text = serializePlan({ meta: c.meta, body: c.body });
    if (text === c.text) return;
    c.text = text; api.write(c.slug, text);
    c.title = c.meta.title || c.body.match(/^#\s+(.+)$/m)?.[1].trim() || c.slug; renderView(c); syncHead(c);
  }

  function setMode(c, mode) {
    if (c.mode === mode) return;
    if (c.mode === "edit") flush(c);
    c.mode = mode; syncHead(c);
    if (mode === "edit") c.ta.focus();
  }

  function setHidden(c, hidden) {
    if (Boolean(c.hidden) === hidden) return;
    c.hidden = hidden; c.el.hidden = hidden;
    if (!hidden && collides(c)) { const sp = spotFor(c); c.x = sp.x; c.y = sp.y; place(c); } // the place it left may be taken by now
    ctx.changed?.();
  }

  function build(slug, pos) {
    const c = { slug, mode: "view", text: "", meta: {}, body: "", title: slug, status: "draft", placed: false, ...pos };
    c.el = el("div", { className: "plancard" });
    c.el.setAttribute("role", "region"); c.el.setAttribute("aria-label", `Plan ${slug}`);
    c.name = el("span", { className: "pc-name" });
    c.stat = el("span", { className: "pc-status" });
    c.modeBtn = el("button", { type: "button", className: "pc-mode" });
    c.buildBtn = el("button", { type: "button", className: "pc-build", textContent: "Approve & build" });
    c.hideBtn = el("button", { type: "button", className: "pc-hide", textContent: "✕", title: "Hide from the canvas (the Plans menu in the toolbar brings it back)" });
    c.hideBtn.setAttribute("aria-label", "Hide the plan from the canvas");
    c.delBtn = el("button", { type: "button", className: "pc-del", innerHTML: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>', title: "Delete this plan (the file goes to the trash)" });
    c.delBtn.setAttribute("aria-label", "Delete the plan");
    c.delBtn.onclick = () => ctx.deletePlan?.(c.slug, c.title);
    const title = el("div", { className: "pc-title" }, el("span", { className: "pc-icon", "aria-hidden": "true", textContent: "▤" }), c.name, c.stat, el("span", { className: "pc-ctl" }, c.modeBtn, c.buildBtn, c.delBtn, c.hideBtn));
    c.view = el("div", { className: "pc-view plan-text" });
    c.ta = el("textarea", { className: "pc-edit", spellcheck: false });
    c.ta.setAttribute("aria-label", `Markdown of the plan ${slug}`);
    const grip = el("div", { className: "pc-rs" });
    c.el.append(title, el("div", { className: "pc-body" }, c.view, c.ta), grip);

    c.el.addEventListener("pointerdown", () => { c.el.style.zIndex = String(++zTop); }, true); // the card that was clicked comes to the front
    c.el.addEventListener("pointerdown", (e) => e.stopPropagation()); // the canvas does not pan or select under a card
    c.el.addEventListener("contextmenu", (e) => e.stopPropagation());
    c.el.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "e") { e.preventDefault(); e.stopPropagation(); setMode(c, c.mode === "edit" ? "view" : "edit"); } });
    c.modeBtn.onclick = () => setMode(c, c.mode === "edit" ? "view" : "edit");
    c.buildBtn.onclick = () => ctx.approve?.(c.slug);
    c.hideBtn.onclick = () => { setMode(c, "view"); setHidden(c, true); };
    c.ta.addEventListener("input", () => { c.body = c.ta.value; clearTimeout(c.timer); c.timer = setTimeout(() => flush(c), 500); });
    c.ta.addEventListener("blur", () => flush(c));
    c.view.addEventListener("click", (e) => { const a = e.target.closest("a[data-screen]"); if (a) ctx.openScreen?.(a.dataset.screen); });

    title.onpointerdown = (e) => {
      if (e.button !== 0 || e.target.closest("button") || c.expanded) return;
      e.preventDefault(); e.stopPropagation(); root.classList.add("dragging");
      const sx = e.clientX, sy = e.clientY, ox = c.x, oy = c.y;
      const move = (ev) => { const z = canvas.camera().z; c.x = ox + (ev.clientX - sx) / z; c.y = oy + (ev.clientY - sy) / z; c.placed = true; place(c); };
      const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); root.classList.remove("dragging"); ctx.changed?.(); };
      addEventListener("pointermove", move); addEventListener("pointerup", up);
    };
    grip.onpointerdown = (e) => {
      if (c.expanded) return;
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); root.classList.add("dragging");
      const sx = e.clientX, sy = e.clientY, w0 = c.w, h0 = c.h;
      const move = (ev) => { const z = canvas.camera().z; c.w = Math.max(MIN_W, Math.round(w0 + (ev.clientX - sx) / z)); c.h = Math.max(MIN_H, Math.round(h0 + (ev.clientY - sy) / z)); place(c); };
      const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); root.classList.remove("dragging"); ctx.changed?.(); };
      addEventListener("pointermove", move); addEventListener("pointerup", up);
    };
    world.append(c.el);
    return c;
  }

  /** Makes the cards match the list of plans ([{ slug, mtime }]): new files get a card, gone ones lose it, changed ones are read again. */
  async function setPlans(list) {
    const slugs = new Set(list.map((p) => p.slug));
    for (const [slug, c] of [...cards]) if (c.kind !== "sitemap" && !slugs.has(slug)) { if (viewCard === c) { c.home = null; closeView(); } c.el.remove(); cards.delete(slug); if (viewCard) paintTabs(); }
    for (const p of list) {
      try { await setOne(p); } catch (e) { console.error("plan", p.slug, e); } // one plan that fails does not stop the others
    }
    if (pendingSeparate && --pendingSeparate === 0) separate();
  }
  async function setOne(p) {
    {
      let c = cards.get(p.slug);
      if (!c) {
        const s = saved[p.slug];
        c = build(p.slug, { x: s?.x ?? 0, y: s?.y ?? 0, w: s?.w ?? W, h: s?.h ?? H, placed: Boolean(s) });
        cards.set(p.slug, c);
        if (s?.hidden) { c.hidden = true; c.el.hidden = true; }
        place(c); await reload(c);
        if (!s && c.status !== "draft") { c.hidden = true; c.el.hidden = true; } // a finished plan is not put on the canvas
        if (!s) { // a new card: its size is known after it is read (a map needs more room than a text), then it gets a free place
          if (c.sitemap) { c.w = SITEMAP_W; c.h = SITEMAP_H; }
          const sp = spotFor(c); c.x = sp.x; c.y = sp.y; c.placed = true; place(c); ctx.changed?.();
        } else c.placed = true;
        return;
      }
      await reload(c);
    }
  }

  /** The card of the sitemap of the project: `r` = { sitemap, hasPrev } or null (no sitemap: no card). */
  function setSitemap(r) {
    const key = "@sitemap";
    if (!r?.sitemap) { const c = cards.get(key); if (c) { if (viewCard === c) { c.home = null; closeView(); } c.el.remove(); cards.delete(key); if (viewCard) paintTabs(); } return; }
    let c = cards.get(key);
    if (!c) {
      const s = saved[key];
      c = build(key, { x: s?.x ?? 0, y: s?.y ?? 0, w: s?.w ?? SITEMAP_W, h: s?.h ?? SITEMAP_H, placed: Boolean(s), kind: "sitemap", title: "Sitemap" });
      c.el.setAttribute("aria-label", "Sitemap of the project"); c.el.classList.add("sitemapcard");
      cards.set(key, c);
      if (!s) { const sp = spotFor(c); c.x = sp.x; c.y = sp.y; }
      c.placed = true; place(c);
      if (s?.hidden) { c.hidden = true; c.el.hidden = true; }
      if (!s) ctx.changed?.();
    }
    c.sm = r.sitemap; c.hasPrev = Boolean(r.hasPrev);
    renderView(c);
    if (pendingSeparate && --pendingSeparate === 0) separate();
  }

  /** A plan or the map is shown one at a time, over the whole canvas (not as a tile on it). */
  function focus(slug) { return openView(slug); }

  return {
    setPlans, setSitemap, focus, arrange, openView, closeView, viewKey: () => (viewCard ? [...cards].find(([, c]) => c === viewCard)?.[0] ?? null : null),
    /** How many cards are on the canvas now (not hidden). */
    visibleCount: () => [...cards.values()].filter((c) => !c.hidden).length,
    /** The saved positions of the project ({ slug: { x, y, w, h } }); call before setPlans. */
    load: (layout) => { saved = layout && typeof layout === "object" ? layout : {}; pendingSeparate = 2; },
    clear: () => { for (const c of cards.values()) c.el.remove(); cards.clear(); saved = {}; },
    /** Hide / show a card (the Plans menu). */
    setHidden: (slug, hidden) => { const c = cards.get(slug); if (c) setHidden(c, hidden); },
    /** The cards are drawn again (a screen was created or deleted: the pages of a map show whether theirs exists). */
    refresh: async () => { for (const c of cards.values()) { if (c.linksOn && ctx.flowEdges) { const e = await ctx.flowEdges(); c.edges = Array.isArray(e) ? e : []; } renderView(c); } },
    has: (slug) => cards.has(slug),
    count: () => cards.size,
    isHidden: (slug) => Boolean(cards.get(slug)?.hidden),
    layout: () => Object.fromEntries([...cards].map(([slug, c]) => [slug, { x: Math.round(c.x), y: Math.round(c.y), w: c.w, h: c.h, ...(c.hidden ? { hidden: true } : {}) }])),
    /** The cards as rectangles in world coordinates (the zoom to fit takes them in). */
    rects: () => [].map((c) => ({ x: c.x, y: c.y - TITLE_H, w: c.w, h: c.h + TITLE_H })),
    /** The text of the card shown now (for checks). */
    textOf: (slug) => cards.get(slug)?.text ?? null,
    /** The map of the project has been replaced (Edit > Undo / Redo): the card shows it. */
    setSitemap,
    /** The sitemap card that has the focus now (or is expanded), or null. */
    sitemapFocused: () => { const c = cards.get("@sitemap"); return c && (!c.hidden || c.expanded) && (c.expanded || c.el.contains(document.activeElement)) ? c : null; },
    setMode: (slug, mode) => { const c = cards.get(slug); if (c) setMode(c, mode); },
  };
}
