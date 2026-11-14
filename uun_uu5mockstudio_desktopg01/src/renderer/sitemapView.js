import { relocateNode, splitComments, joinComments, getNode, updateNode, updateNodes, groupComments, linkDiff, addScreenPage, descendants, fileNodes, addChild, addSibling, duplicateNode, removeNode, moveNode, indentNode, outdentNode, fileFor, pathTitles, kindOf, typeLabels, typeShort, typesFor, isScreenType, childType, canFlag, isOutside, searchNodes, lockedIn, countApproved } from "./sitemap.js";

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k.startsWith("aria-")) n.setAttribute(k, v); else n[k] = v; }
  n.append(...kids.filter((x) => x != null));
  return n;
};
export const ZOOM_MIN = 0.3, ZOOM_MAX = 2;
const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(z) || 1));
const same = (a, b) => Boolean(a && b) && a.length === b.length && a.every((x, i) => x === b[i]);
const IC = {
  inside: '<path d="M5 4v8a3 3 0 0 0 3 3h9M13 11l4 4-4 4"/>', after: '<path d="M12 4v9M7.5 8.5h9M5 20h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>', down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  indent: '<path d="M3 6h18M12 12h9M3 18h18M3 9l3 3-3 3"/>', outdent: '<path d="M3 6h18M12 12h9M3 18h18M6 9l-3 3 3 3"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
};

/**
 * The sitemap as a map: the root on the left, the pages to the right, and below it a small editor of the selected page.
 * `sm` = { root }; `opts` = { sel: path | null, isScreen(file), onSelect(path | null, multi) (Shift / ⌘ / Ctrl + click adds or removes a page; a click on the selected page or on the empty map deselects), sels (all selected pages), onBulk(sitemap) (a change to all selected pages), onChange(sitemap, path), onOpen(file), onCreate({ node, path, file, where }), onCreateMany([{ node, path, where }]) (the selected pages, at most 8), onRevise(extra) (the comments and a wish go to the agent), collapsed (Set of ids of the folded pages), onToggle(id), links: { on, edges, screens, onToggle(), onAdd(file) } (the real links of the screens over the map) }.
 */
// F2 renames the selected page: one listener for the document, because a click re-draws the map and the focus is gone with the old buttons
let f2Rename = null;
if (typeof document !== "undefined") document.addEventListener("keydown", (e) => {
  if (e.key !== "F2" || e.metaKey || e.ctrlKey || e.altKey || !f2Rename || !document.querySelector(".pc-inview .sm")) return;
  const t = e.target; if (t instanceof HTMLElement && t.closest("input,textarea,select,[contenteditable]")) return;
  e.preventDefault(); f2Rename();
});

export function renderSitemap(sm, opts) {
  const { sel, sels = sel ? [sel] : [], isScreen = () => false, onSelect, onChange, onBulk, onOpen, onCreate, onCreateMany, onRevise, links, collapsed = new Set(), onToggle } = opts;
  const picked = (path) => sels.some((p) => same(p, path));
  const kind = kindOf(sm), TYPE_LABEL = typeLabels(kind), TYPES = typesFor(sm), portal = kind === "portal";
  const word = (t) => typeShort(kind, t).toLowerCase(); // "page", "portal", "sheet", "section"
  const root = el("div", { className: "sm" });

  const status = (n) => {
    if (n.type === "external") return el("span", { className: "sm-st ext", textContent: "↗", title: `Leads out of the ${portal ? "portal" : "site"}: not solved here` });
    if (isOutside(n)) return el("span", { className: "sm-st ns", textContent: "–", title: "Not solved here: it stays in the map, no screen is built for it" });
    if ((n.type === "group" && !n.file) || n.type === "section") return null;
    if (n.file && isScreen(n.file)) return el("span", { className: "sm-st ok", textContent: "✔", title: `Screen ${n.file} exists` });
    return el("span", { className: "sm-st todo", textContent: "○", title: n.file ? `Screen ${n.file} does not exist yet` : "No screen yet" });
  };
  /** An approved page with a screen is not changed (renamed, moved, retyped, deleted) without asking: the user has settled it and the screen file hangs on it. */
  const okToChange = (nodes, what) => {
    const hit = nodes.flatMap((x) => lockedIn(x, isScreen)); if (!hit.length) return true;
    const names = hit.slice(0, 3).map((x) => `“${x.title}”`).join(", ") + (hit.length > 3 ? ` and ${hit.length - 3} more` : "");
    return confirm(`${names} ${hit.length === 1 ? "is" : "are"} approved and ${hit.length === 1 ? "has" : "have"} a screen. ${what} anyway?`);
  };
  /** Rename on the spot: an input over the page; Enter or a click away keeps the name, Esc leaves it. */
  const renameNode = (b, n, path) => {
    const r = b.getBoundingClientRect(); let done = false;
    const inp = el("input", { type: "text", className: "sm-rename", value: n.title, spellcheck: false, "aria-label": `Name of ${n.title}` });
    Object.assign(inp.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${Math.max(r.width, 160)}px`, height: `${r.height}px` });
    const finish = (keep) => {
      if (done) return; done = true; const v = inp.value.trim(); inp.remove();
      if (keep && v && v !== n.title && okToChange([n], "Rename")) onChange?.(updateNode(sm, path, { title: v }), path);
    };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); } else if (e.key === "Escape") { e.preventDefault(); finish(false); } };
    inp.onblur = () => finish(true);
    for (const ev of ["click", "dblclick", "pointerdown", "keyup"]) inp.addEventListener(ev, (e) => e.stopPropagation());
    document.body.append(inp); inp.focus(); inp.select();
  };
  /** The menu of a page (right click): rename, type, add, duplicate, delete. With several pages selected the type is set for all of them. */
  const nodeMenu = (x, y, n, path) => {
    document.querySelector(".sm-ctx")?.remove();
    if (!picked(path)) onSelect?.(path, false);
    const many = picked(path) && sels.length > 1 ? sels.filter((p) => getNode(sm, p)) : null;
    const menu = el("div", { className: "sm-ctx", role: "menu" });
    const close = () => { menu.remove(); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); };
    const away = (e) => { if (!menu.contains(e.target)) close(); }, esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    const item = (label, fn, { on = false, danger = false, disabled = false } = {}) => {
      const b = el("button", { type: "button", role: "menuitem", className: `sm-ci${on ? " on" : ""}${danger ? " danger" : ""}`, textContent: label, disabled });
      b.onclick = () => { close(); fn(); }; return b;
    };
    const head = (t) => el("div", { className: "sm-ch", textContent: t });
    const act = (r) => onChange?.(r.sitemap, r.path);
    const isRoot = path.length === 0;
    if (!many) menu.append(item("Rename", () => { const b = [...document.querySelectorAll(".sm-node.sel")].find((x) => x.querySelector(".sm-title")?.textContent === n.title); if (b) renameNode(b, n, path); }));
    menu.append(head(many ? `Type of ${many.length} pages` : "Type"), ...TYPES.map((t) => item(TYPE_LABEL[t], () => { if (!okToChange(many ? many.map((p) => getNode(sm, p)) : [n], "Change the type")) return; many ? onBulk?.(updateNodes(sm, many, { type: t })) : onChange?.(updateNode(sm, path, { type: t }), path); }, { on: !many && n.type === t })));
    const flaggable = (many ? many.map((p) => getNode(sm, p)) : [n]).filter((x) => canFlag(x.type));
    if (flaggable.length) {
      const allOn = flaggable.every((x) => x.notSolved), v = !allOn;
      menu.append(el("hr"), item(`${allOn ? "✓ " : ""}Not solved here`, () => (many ? onBulk?.(updateNodes(sm, many.filter((p) => canFlag(getNode(sm, p).type)), { notSolved: v })) : onChange?.(updateNode(sm, path, { notSolved: v }), path)), { on: allOn }));
    }
    const apNodes = many ? many.map((p) => getNode(sm, p)) : [n], allAp = apNodes.every((x) => x.approved);
    menu.append(...(flaggable.length ? [] : [el("hr")]), item(`${allAp ? "✓ " : ""}Approved`, () => (many ? onBulk?.(updateNodes(sm, many, { approved: !allAp })) : onChange?.(updateNode(sm, path, { approved: !allAp }), path)), { on: allAp }));
    const inside = word(childType(sm, n)), after = portal && ["page", "sheet", "section"].includes(n.type) ? word(n.type) : "page";
    if (!many) menu.append(el("hr"), item(`Add ${inside} inside`, () => act(addChild(sm, path))), item(`Add ${after} after`, () => act(addSibling(sm, path)), { disabled: isRoot }), item("Duplicate", () => act(duplicateNode(sm, path)), { disabled: isRoot || n.children.length > 0 }),
      el("hr"), item("Delete", () => { if ((!n.children.length || confirm(`Delete “${n.title}” with its ${n.children.length} sub-page(s)?`)) && okToChange([n], "Delete")) act(removeNode(sm, path)); }, { danger: true, disabled: isRoot }));
    document.body.append(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.max(6, Math.min(x, innerWidth - w - 6))}px`; menu.style.top = `${Math.max(6, Math.min(y, innerHeight - h - 6))}px`;
    document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc, true);
    menu.querySelector("button:not([disabled])")?.focus();
  };
  let justDragged = false; // the click that ends a drag does not select
  const clearDrop = () => root.querySelectorAll(".drop-before,.drop-after,.drop-inside").forEach((x) => x.classList.remove("drop-before", "drop-after", "drop-inside"));
  const dropWhere = (b, y) => { const r = b.getBoundingClientRect(), f = (y - r.top) / (r.height || 1); return f < 0.28 ? "before" : f > 0.72 ? "after" : "inside"; };
  function startDrag(e, b, n, path) {
    const sx = e.clientX, sy = e.clientY; let ghost = null, target = null, where = null, cancelled = false;
    const scroller = root.querySelector(".sm-scroll");
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        ghost = el("div", { className: "sm-ghost", textContent: n.title }); document.body.append(ghost); b.classList.add("dragging"); document.body.classList.add("sm-dragging");
      }
      ghost.style.left = `${ev.clientX + 12}px`; ghost.style.top = `${ev.clientY + 8}px`;
      clearDrop(); target = null;
      const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.(".sm-node");
      if (t && root.contains(t) && t.dataset.path) {
        const tp = JSON.parse(t.dataset.path), w = dropWhere(t, ev.clientY);
        if (relocateNode(sm, path, tp, w).sitemap !== sm) { target = tp; where = w; t.classList.add(`drop-${w}`); }
      }
      if (scroller) { const r = scroller.getBoundingClientRect(); if (ev.clientY < r.top + 36) scroller.scrollTop -= 14; else if (ev.clientY > r.bottom - 36) scroller.scrollTop += 14; if (ev.clientX < r.left + 36) scroller.scrollLeft -= 14; else if (ev.clientX > r.right - 36) scroller.scrollLeft += 14; }
    };
    const end = (commit) => {
      document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true); document.removeEventListener("keydown", key, true);
      ghost?.remove(); b.classList.remove("dragging"); document.body.classList.remove("sm-dragging"); clearDrop();
      if (ghost) { justDragged = true; setTimeout(() => { justDragged = false; }, 0); if (commit && target && !cancelled) { const r = relocateNode(sm, path, target, where); if (r.sitemap !== sm && okToChange([n], "Move")) onChange?.(r.sitemap, r.path); } }
    };
    const up = () => end(true), key = (ev) => { if (ev.key === "Escape") { cancelled = true; ev.stopPropagation(); end(false); } };
    document.addEventListener("pointermove", move, true); document.addEventListener("pointerup", up, true); document.addEventListener("keydown", key, true);
  }
  // ----- search: the pages that match are marked, the rest is dimmed; Enter / Shift + Enter goes from one match to the next, Esc clears it
  const query = String(opts.query ?? ""), found = searchNodes(sm, query), hitIds = new Set(found.hits.map((h) => h.id));
  const hitAt = found.hits.length ? ((Number(opts.hit) || 0) % found.hits.length + found.hits.length) % found.hits.length : -1, curId = hitAt >= 0 ? found.hits[hitAt].id : null;
  const hitClass = (n) => (!query.trim() ? "" : hitIds.has(n.id) ? ` hit${n.id === curId ? " cur" : ""}` : " dim");
  /** The mark of the review on a page: a filled blue check when it is approved, a faint one on hover when it is not (a click switches it). Apart from the screen mark on the left. */
  const approvalMark = (n, path) => {
    if (n.type === "external" || (n.type === "group" && !n.file)) return null;
    const on = Boolean(n.approved), b = el("span", { className: `sm-ap${on ? " on" : ""}`, role: "button", tabIndex: 0, textContent: "✓", title: on ? "Approved: the agent keeps it as it is. Click to take it back" : "Mark as reviewed and approved" });
    b.setAttribute("aria-label", on ? `${n.title} is approved. Take the approval back` : `Approve ${n.title}`); b.setAttribute("aria-pressed", String(on));
    const flip = (e) => { e.stopPropagation(); e.preventDefault(); onChange?.(updateNode(sm, path, { approved: !on }), path, { keepSelection: true }); }; // only the mark: the page is not selected (no panel opens)
    b.onclick = flip; b.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") flip(e); }; b.onpointerdown = (e) => e.stopPropagation(); b.ondblclick = (e) => e.stopPropagation();
    return b;
  };
  const nodeEl = (n, path) => {
    const b = el("button", { type: "button", className: `sm-node t-${n.type}${isOutside(n) ? " ns" : ""}${picked(path) ? " sel" : ""}${n.comment ? " has-cm" : ""}${n.approved ? " ap" : ""}${n.approved && opts.dimApproved ? " apdim" : ""}${hitClass(n)}`, title: n.comment ? `Comment: ${n.comment}` : n.note || n.title }, status(n), el("span", { className: "sm-title", textContent: n.title }), ["page", "sheet", "section"].includes(n.type) && (portal || n.type === "sheet") ? el("span", { className: `sm-kind k-${n.type}`, textContent: typeShort(kind, n.type), "aria-label": `Type: ${typeShort(kind, n.type)}` }) : null, n.comment ? el("span", { className: "sm-cm", textContent: "!", title: n.comment, "aria-label": "Has a comment" }) : null, approvalMark(n, path));
    if (n.children.length) {
      const folded = collapsed.has(n.id), tgl = el("span", { className: "sm-tgl", role: "button", tabIndex: 0, textContent: folded ? `▸ ${descendants(n)}` : "▾", title: folded ? `Show the ${descendants(n)} pages below` : "Fold the branch" });
      tgl.setAttribute("aria-label", folded ? `Unfold ${n.title}` : `Fold ${n.title}`); tgl.setAttribute("aria-expanded", String(!folded));
      tgl.onclick = (e) => { e.stopPropagation(); onToggle?.(n.id); }; tgl.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggle?.(n.id); } };
      b.append(tgl);
    }
    b.setAttribute("aria-pressed", String(picked(path)));
    if (n.file) b.dataset.file = n.file;
    // drag and drop (with the pointer, not the HTML5 one that a button does not start reliably): the upper quarter of a page drops before it, the lower quarter after it, the middle inside it
    b.dataset.path = JSON.stringify(path);
    if (path.length && onChange) b.onpointerdown = (e) => { if (e.button === 0 && !e.target.closest(".sm-tgl")) startDrag(e, b, n, path); };
    b.onclick = (e) => { if (justDragged) return; onSelect?.(path, e.shiftKey || e.metaKey || e.ctrlKey); };
    b.ondblclick = (e) => { if (e.target.closest(".sm-tgl")) return; e.preventDefault(); getSelection()?.removeAllRanges(); renameNode(b, n, path); }; // double click: rename on the spot
    b.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); nodeMenu(e.clientX, e.clientY, n, path); }; // right click: the quick actions
    return b;
  };
  const branch = (n, path) => {
    const li = el("li", {}, nodeEl(n, path));
    if (n.children.length && !collapsed.has(n.id)) li.append(el("ul", {}, ...n.children.map((c, i) => branch(c, [...path, i]))));
    return li;
  };
  f2Rename = () => {
    const path = sels.length === 1 ? sels[0] : sel, n = path && getNode(sm, path); if (!n) return;
    const b = [...document.querySelectorAll(".pc-inview .sm-node.sel")].find((x) => x.querySelector(".sm-title")?.textContent === n.title); if (b) renameNode(b, n, path);
  };
  const comments = groupComments(sm).length;
  /** One comment or note of a list: the text (a click edits it on the spot: Enter or a click away keeps it, empty removes it, Esc leaves it) and a cross. */
  function noteLi(t, { removeTitle, remove, save, cancel }) {
    const x = el("button", { type: "button", className: "sm-note-x", textContent: "×", title: removeTitle, "aria-label": removeTitle }); x.onclick = remove;
    const txt = el("span", { textContent: t, title: "Click to edit", tabIndex: 0, role: "button" }), li = el("li", { className: "sm-note" }, txt, x);
    const edit = () => {
      const ed = el("textarea", { className: "sm-note-ed", value: t, rows: 1, spellcheck: false, "aria-label": "Edit the text" }); let done = false;
      const fit = () => { ed.style.height = "auto"; ed.style.height = `${ed.scrollHeight}px`; };
      const finish = (keep) => { if (done) return; done = true; const v = ed.value.trim(); if (!keep || v === t) { ed.replaceWith(txt); return cancel?.(); } save(v); };
      ed.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); finish(true); } else if (e.key === "Escape") { e.preventDefault(); finish(false); } };
      ed.oninput = fit; ed.onblur = () => finish(true);
      txt.replaceWith(ed); fit(); ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length);
    };
    txt.onclick = edit; txt.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit(); } };
    return li;
  }
  if (onRevise) {
    // Enter ADDS a note about the whole map (as many as you like, e.g. while reviewing with someone); only the button sends them all to the agent
    const notes = opts.notes ?? [];
    const wish = el("input", { type: "text", className: "sm-wish", placeholder: "Note on the whole map, e.g. merge the departments… (Enter adds it)", spellcheck: false, "aria-label": "A note about the whole map" });
    const go = el("button", { type: "button", className: "pc-mini accent", title: "The agent revises the map with your comments on the pages and your notes on the whole map" });
    const list = el("ul", { className: "sm-notes" });
    const count = () => comments + notes.length;
    const sync = () => {
      const n = count();
      go.textContent = n ? `Revise with the agent (${n} comment${n === 1 ? "" : "s"})` : "Revise with the agent";
      go.disabled = !n && !wish.value.trim();
      list.hidden = !notes.length;
      list.replaceChildren(...notes.map((t, i) => noteLi(t, {
        removeTitle: "Remove this note",
        remove: () => { notes.splice(i, 1); opts.onNotes?.(notes); sync(); },
        save: (v) => { if (v) notes[i] = v; else notes.splice(i, 1); opts.onNotes?.(notes); sync(); },
      })));
    };
    const add = () => { const t = wish.value.trim(); if (!t) return false; notes.push(t); wish.value = ""; opts.onDraft?.(""); opts.onNotes?.(notes); sync(); return true; };
    const send = () => { add(); const n = notes.splice(0).join("\n- "); opts.onNotes?.(notes); sync(); if (n || comments) onRevise(n ? `\n- ${n}` : ""); };
    wish.value = opts.draft ?? ""; // what was typed and not yet added stays when the map is repainted
    wish.oninput = () => { opts.onDraft?.(wish.value); sync(); }; sync();
    go.onclick = send;
    wish.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); add(); } };
    root.append(el("div", { className: "sm-review" }, wish, go), list);
  }
  const diff = links?.on ? linkDiff(sm, links.edges ?? [], links.screens ?? []) : null;
  if (links) {
    const tog = el("button", { type: "button", className: `pc-mini${links.on ? " on" : ""}`, textContent: "Real links", title: "Show the links that the screens really have and the map does not say" });
    tog.setAttribute("aria-pressed", String(Boolean(links.on))); tog.onclick = () => links.onToggle?.();
    root.querySelector(".sm-review")?.append(tog);
    if (!root.querySelector(".sm-review")) root.append(el("div", { className: "sm-review" }, tog));
    if (diff) {
      const where = fileNodes(sm), gone = diff.missing.map((f) => `${getNode(sm, where.get(f))?.title ?? f} (${f})`);
      const row = el("div", { className: "sm-diff" }, el("span", { textContent: `${diff.extra.length} link${diff.extra.length === 1 ? "" : "s"} between screens that the map does not show (orange)` }));
      if (gone.length) row.append(el("span", { textContent: ` · ${gone.length === 1 ? "a page names" : `${gone.length} pages name`} a screen file that does not exist: ${gone.join(", ")}`, title: "The page has a Screen file, but there is no such screen in the project. Create the screen, or change or clear the file of the page." }));
      if (diff.unmapped.length) {
        row.append(el("span", { className: "mute", textContent: " · screens not in the map: " }));
        for (const f of diff.unmapped) row.append(el("button", { type: "button", className: "pc-mini", textContent: `+ ${f.replace(/\.html$/, "")}`, title: `Add ${f} to the map${sel ? " under the selected page" : ""}`, onclick: () => links.onAdd?.(f) }));
      }
      root.append(row);
    }
  }
  const { approved: nOk, all: nAll } = countApproved(sm);
  if (nOk) {
    const row = root.querySelector(".sm-review") ?? root.appendChild(el("div", { className: "sm-review" }));
    row.append(el("span", { className: "sm-apcount", textContent: `${nOk} / ${nAll} approved`, title: "Pages you have reviewed and approved, of all the pages that count" }));
    if (opts.onDimApproved) { const t = el("button", { type: "button", className: `pc-mini${opts.dimApproved ? " on" : ""}`, textContent: "Dim approved", title: "Fade the approved pages so the ones still to review stand out" }); t.setAttribute("aria-pressed", String(Boolean(opts.dimApproved))); t.onclick = () => opts.onDimApproved(!opts.dimApproved); row.append(t); }
  }
  const treewrap = el("div", { className: "sm-treewrap" }, el("ul", { className: "sm-tree" }, branch(sm.root, [])));
  const scroll = el("div", { className: "sm-scroll" }, treewrap);
  scroll.onclick = (e) => { if (e.target === scroll || e.target.tagName === "UL" || e.target.tagName === "LI") onSelect?.(null, false); }; // the empty map: nothing selected

  // ----- zoom of the map: ⌘ / Ctrl + wheel and the pinch of a trackpad (Chromium sends it as Ctrl + wheel) around the pointer,
  // and the zoom pill of the toolbar while the map is the view (root.zoom); the map has no zoom bar of its own. The map is zoomed with CSS zoom, so it is laid out (and scrolls) at its size.
  let zoom = clampZoom(opts.zoom ?? 1);
  /** The scale of the card itself (it is scaled with the canvas when it lies on it). */
  const cardScale = () => scroll.getBoundingClientRect().width / (scroll.offsetWidth || 1) || 1;
  const applyZoom = () => { treewrap.style.zoom = String(zoom); };
  const setZoom = (z, clientX, clientY) => {
    z = clampZoom(z); if (Math.abs(z - zoom) < 1e-4) return;
    const r = scroll.getBoundingClientRect(), k = cardScale();
    const px = clientX == null ? scroll.clientWidth / 2 : (clientX - r.left) / k, py = clientY == null ? scroll.clientHeight / 2 : (clientY - r.top) / k; // the point that stays where it is
    const cx = (scroll.scrollLeft + px) / zoom, cy = (scroll.scrollTop + py) / zoom;
    zoom = z; applyZoom();
    scroll.scrollLeft = cx * zoom - px; scroll.scrollTop = cy * zoom - py;
    root.draw?.(); opts.onZoom?.(zoom);
  };
  /** The whole map in sight (never larger than 100 %). */
  const fitZoom = () => {
    const nodes = [...treewrap.querySelectorAll(".sm-node")]; if (!nodes.length) return;
    const w = treewrap.getBoundingClientRect(), k = cardScale() * zoom;
    const right = Math.max(...nodes.map((n) => n.getBoundingClientRect().right)), bottom = Math.max(...nodes.map((n) => n.getBoundingClientRect().bottom));
    const cw = (right - w.left) / k + 24, ch = (bottom - w.top) / k + 24; // the size of the map at 100 %
    const z = clampZoom(Math.min(1, (scroll.clientWidth - 24) / cw, (scroll.clientHeight - 16) / ch));
    zoom = z; applyZoom(); scroll.scrollLeft = 0; scroll.scrollTop = 0; root.draw?.(); opts.onZoom?.(zoom);
  };
  scroll.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; // a plain wheel scrolls the map
    e.preventDefault(); e.stopPropagation(); // the canvas below does not zoom
    setZoom(zoom * Math.exp(-Math.max(-40, Math.min(40, e.deltaY)) * 0.01), e.clientX, e.clientY);
  }, { passive: false });
  applyZoom();
  root.zoom = { by: (f) => setZoom(zoom * f), reset: () => setZoom(1), fit: fitZoom, percent: () => Math.round(zoom * 100) };
  // search: one small pill (the card moves it to its toolbar) (a magnifier, the text, "2 / 5", ↑ ↓ and a cross); the controls appear only when they are of use
  const mapwrap = el("div", { className: "sm-mapwrap" }, scroll);
  if (opts.onSearch) {
    const q = query.trim(), n = found.hits.length;
    const inp = el("input", { type: "text", className: "sm-search", placeholder: "Search the map", value: query, spellcheck: false, "aria-label": "Search the map" });
    const mini = (svg, title, fn) => { const b = el("button", { type: "button", className: "sm-sb", title, innerHTML: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>` }); b.setAttribute("aria-label", title); b.onclick = fn; return b; };
    const go = (t, hit) => opts.onSearch(t, hit, searchNodes(sm, t).open);
    inp.oninput = () => go(inp.value, 0);
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); if (n) go(inp.value, hitAt + (e.shiftKey ? -1 : 1)); }
      else if (e.key === "Escape" && inp.value) { e.preventDefault(); go("", 0); }
    };
    const icon = el("span", { className: "sm-sicon", "aria-hidden": "true", innerHTML: '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' });
    const bar = el("div", { className: `sm-searchbar${q ? " on" : ""}${q && !n ? " none" : ""}`, role: "search" }, icon, inp);
    if (q) bar.append(el("span", { className: "sm-searchn", textContent: n ? `${hitAt + 1} / ${n}` : "No match", "aria-live": "polite" }));
    if (n > 1) bar.append(mini('<path d="M6 15l6-6 6 6"/>', "Previous match (Shift + Enter)", () => go(query, hitAt - 1)), mini('<path d="M6 9l6 6 6-6"/>', "Next match (Enter)", () => go(query, hitAt + 1)));
    if (q) bar.append(mini('<path d="M6 6l12 12M18 6L6 18"/>', "Clear the search (Esc)", () => go("", 0)));
    bar.onclick = (e) => { if (!e.target.closest("button")) inp.focus(); }; // a click on the lupa opens the field
    root.searchBar = bar; // the card puts it on its toolbar (Fold all, Unfold all, Share); without a toolbar it floats over the map
    mapwrap.append(bar);
    if (opts.searchFocus) requestAnimationFrame(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); });
    if (opts.searchScroll && curId) requestAnimationFrame(() => [...scroll.querySelectorAll(".sm-node.cur")][0]?.scrollIntoView({ block: "center", inline: "center" }));
  }
  root.append(mapwrap);

  const field = (label, control) => el("label", { className: "sm-f" }, el("span", { textContent: label }), control);
  // the links of the screens that the map does not say: curves between the pages (drawn when the map is in the document: the card calls root.draw())
  root.draw = () => {
    const wrap = scroll.querySelector(".sm-treewrap"); wrap.querySelector(".sm-links")?.remove();
    if (!diff?.extra.length) return;
    const wr = wrap.getBoundingClientRect(), k = wr.width / (wrap.offsetWidth || 1) || 1;
    const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "sm-links"); svg.setAttribute("width", wrap.offsetWidth); svg.setAttribute("height", wrap.offsetHeight);
    svg.innerHTML = '<defs><marker id="sm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#e0912f"/></marker></defs>';
    const find = (f) => [...wrap.querySelectorAll(".sm-node")].find((n) => n.dataset.file === f);
    for (const e of diff.extra) {
      const a = find(e.from), b = find(e.to); if (!a || !b) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), ltr = rb.left >= ra.left;
      const ax = ((ltr ? ra.right : ra.left) - wr.left) / k, ay = (ra.top + ra.height / 2 - wr.top) / k, bx = ((ltr ? rb.left : rb.right) - wr.left) / k, by = (rb.top + rb.height / 2 - wr.top) / k, d = (ltr ? 1 : -1) * 36;
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", `M${ax} ${ay} C${ax + d} ${ay} ${bx - d} ${by} ${bx} ${by}`); p.setAttribute("class", "sm-link"); p.setAttribute("marker-end", "url(#sm-arrow)");
      const t = document.createElementNS(NS, "title"); t.textContent = `${e.from} links to ${e.to}, the map does not show it`; p.append(t); svg.append(p);
    }
    wrap.append(svg);
  };

  const chosen = sels.filter((p) => getNode(sm, p));
  const sideTitle = (t, closable = false) => {
    const aside = opts.editorHost?.closest("aside"), head = aside?.querySelector(".insp-head"); if (!head) return;
    aside.hidden = false; // a page is selected: the panel is there
    head.querySelector("h3").textContent = t;
    let x = head.querySelector(".smside-x"); if (!x) { x = el("button", { type: "button", className: "icon smside-x", textContent: "×", title: "Deselect the page", "aria-label": "Deselect the page" }); head.append(x); }
    x.hidden = !closable; x.onclick = () => onSelect?.(null, false);
  };
  const out = opts.editorHost ?? root; // the editor of the selected page(s): in the side panel when there is one, else below the map
  if (opts.editorHost) out.replaceChildren();
  if (chosen.length > 1) { sideTitle(`${chosen.length} pages`, true); out.append(multiEditor(chosen)); return root; }
  const node = sel ? getNode(sm, sel) : null;
  if (!node) { const a = opts.editorHost?.closest("aside"); if (a) a.hidden = true; /* nothing selected: no panel, the map has the whole width */ out.append(el("p", { className: "mute sm-hint", textContent: "Select a page to rename it, change its type or screen, add pages or move them. Shift / ⌘ + click selects more pages to comment on them together." })); return root; }

  /** The comments of the review on the page(s): a box of its own, apart from the settings of the page. Enter adds one more comment; × removes it. */
  function commentBox(list, label, setList, hint = "") {
    const ul = el("ul", { className: "sm-notes" });
    const inp = el("input", { type: "text", placeholder: "Add a comment…  (Enter)", spellcheck: false, "aria-label": label });
    const paint = () => ul.replaceChildren(...list.map((t, i) => noteLi(t, {
      removeTitle: "Remove this comment",
      remove: () => setList(list.filter((_, j) => j !== i)),
      save: (v) => setList(v ? list.map((c, j) => (j === i ? v : c)) : list.filter((_, j) => j !== i)),
      cancel: paint,
    })));
    paint(); ul.hidden = !list.length;
    inp.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); const t = inp.value.trim(); if (t) setList([...list, t]); } };
    return el("div", { className: "sm-cbox" }, el("div", { className: "sm-chead", title: hint || "The agent resolves the comments on a revision" }, el("b", { textContent: "Comments" }), list.length ? el("span", { className: "sm-ccount", textContent: String(list.length) }) : null), ul, inp);
  }

  // ----- several pages selected: one comment (or one type) for all of them
  function multiEditor(paths) {
    const nodes = paths.map((p) => getNode(sm, p)), same1 = nodes.every((n) => (n.comment ?? "") === (nodes[0].comment ?? ""));
    const bulk = (patch) => onBulk?.(updateNodes(sm, paths, patch));
    const addAll = (t) => onBulk?.(paths.reduce((m, p) => { const n = getNode(m, p); return updateNode(m, p, { comment: joinComments([...splitComments(n.comment), t]) }); }, sm));
    const cbox = same1 ? commentBox(splitComments(nodes[0].comment), `Comments on the ${paths.length} selected pages`, (l) => bulk({ comment: joinComments(l) }), `the same on all ${paths.length} pages`)
      : commentBox([], `Comment on the ${paths.length} selected pages`, (l) => addAll(l[0]), "the pages have different comments: a new one is added to each");
    const type = el("select", { "aria-label": "Type of all the selected pages" }, el("option", { value: "", textContent: "(keep)" }), ...TYPES.map((t) => el("option", { value: t, textContent: TYPE_LABEL[t] })));
    type.onchange = () => { if (type.value && okToChange(nodes, "Change the type")) bulk({ type: type.value }); else type.value = ""; };
    const ap = el("select", { "aria-label": "Approved, for all the selected pages" }, el("option", { value: "", textContent: "(keep)" }), el("option", { value: "1", textContent: "Yes, approved" }), el("option", { value: "0", textContent: "No, not yet" }));
    ap.onchange = () => { if (ap.value) bulk({ approved: ap.value === "1" }); };
    const flagPaths = paths.filter((p) => canFlag(getNode(sm, p).type));
    const ns = el("select", { "aria-label": "Not solved here, for all the selected pages", disabled: !flagPaths.length }, el("option", { value: "", textContent: "(keep)" }), el("option", { value: "1", textContent: "Yes, no screen is built" }), el("option", { value: "0", textContent: "No, solved here" }));
    ns.onchange = () => { if (ns.value) onBulk?.(updateNodes(sm, flagPaths, { notSolved: ns.value === "1" })); };
    return el("div", { className: "sm-edit", role: "group", "aria-label": `${paths.length} selected pages` },
      el("div", { className: "sm-multi" }, el("b", { textContent: `${paths.length} pages selected` }), el("span", { className: "mute", textContent: nodes.map((n) => n.title).join(" · ") })),
      cbox, el("div", { className: "sm-settings" }, field("Type", type), field("Not solved here", ns), field("Approved", ap)),
      el("div", { className: "sm-acts" }, el("button", { type: "button", textContent: "Clear the selection", onclick: () => onSelect?.(paths[paths.length - 1], false) }), createMany(paths)));
  }
  /** Several pages at once: the screens are created for the selected pages only, not for the whole map. */
  function createMany(paths) {
    const pages = paths.filter((p) => { const x = getNode(sm, p); return isScreenType(x?.type) && !x.notSolved; }), tooMany = pages.length > 8;
    return el("button", { type: "button", className: "primary", textContent: `Create the screens (${pages.length})`, disabled: !pages.length || tooMany, title: tooMany ? "Select at most 8 pages at a time" : pages.length ? "The agent builds a screen for each selected page (and for nothing else)" : portal ? "Select portals or sheets (not sections or groups)" : "Select pages (not sections or groups)", onclick: () => onCreateMany?.(pages.map((p) => ({ node: getNode(sm, p), path: p, where: pathTitles(sm, p) }))) });
  }

  // ----- the editor of the selected page
  const set = (patch) => onChange?.(updateNode(sm, sel, patch), sel);
  const text = (value, key, ph = "") => { const i = el("input", { type: "text", value: value ?? "", placeholder: ph, spellcheck: false }); i.onchange = () => { if (key === "title" && i.value.trim() && i.value.trim() !== value && !okToChange([node], "Rename")) { i.value = value ?? ""; return; } set({ [key]: i.value }); }; return i; };
  const type = el("select", {}, ...[...new Set([...TYPES, node.type])].map((t) => el("option", { value: t, textContent: TYPE_LABEL[t], selected: t === node.type })));
  type.onchange = () => { if (okToChange([node], "Change the type")) set({ type: type.value }); else type.value = node.type; };
  const btn = (label, fn, { title = "", disabled = false, cls = "" } = {}) => el("button", { type: "button", className: cls, textContent: label, title, disabled, onclick: fn });
  const parent = sel.length ? getNode(sm, sel.slice(0, -1)) : null, i = sel[sel.length - 1];
  const act = (r) => onChange?.(r.sitemap, r.path);
  // a disabled button shows no tooltip (the browser sends it no mouse events), so it is only dimmed (aria-disabled) and its tooltip says why it does nothing
  const ibtn = (svgPath, title, fn, disabled = false, cls = "", why = "") => { const b = el("button", { type: "button", className: `sm-ib ${cls}${disabled ? " off" : ""}`.trim(), title: disabled && why ? `${title} (${why})` : title, innerHTML: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${svgPath}</svg>` }); b.setAttribute("aria-label", title); if (disabled) b.setAttribute("aria-disabled", "true"); b.onclick = () => { if (!disabled) fn(); }; return b; };
  const exists = node.file && isScreen(node.file);
  const where = pathTitles(sm, sel);
  const screenBtn = isOutside(node) || node.type === "section" ? null : exists ? btn("Open the screen", () => onOpen?.(node.file), { cls: "primary" }) : btn("Create the screen", () => onCreate?.({ node, path: sel, file: node.file ?? fileFor(sm, node), where }), { title: "The agent builds this page as a screen", cls: "primary" });
  /** The file of the screen of the page: typed, or picked from the screens that exist (the ones no page names yet first), so an existing screen is linked to the page. */
  function screenField() {
    const input = text(node.file, "file", isScreenType(node.type) ? fileFor(sm, node) : node.type === "section" ? (portal ? "(part of the sheet above)" : "(part of the page above)") : ""), wrap = el("span", { className: "sm-screenpick" }, input), known = opts.screens ?? [];
    if (isScreenType(node.type) && known.length) {
      const used = fileNodes(sm), free = known.filter((f) => !used.has(f) || used.get(f).join(".") === sel.join(".")), taken = known.filter((f) => !free.includes(f));
      const pick = el("select", { "aria-label": "Link an existing screen to this page", title: "Link a screen that already exists to this page" }, el("option", { value: "", textContent: "Link an existing screen…" }),
        ...free.map((f) => el("option", { value: f, textContent: f, selected: f === node.file })), ...taken.map((f) => el("option", { value: f, textContent: `${f} (used by ${getNode(sm, used.get(f))?.title ?? "another page"})` })));
      pick.onchange = () => { if (pick.value) set({ file: pick.value }); };
      wrap.append(pick);
    }
    return wrap;
  }
  /** The address the page is taken from; when it is a link, a button next to it opens it in the system browser. */
  function sourceField() {
    const input = text(node.source, "source", "Address the page is taken from (read when its screen is built)"), wrap = el("span", { className: "sm-srcrow" }, input);
    const url = typeof node.source === "string" && /^https:\/\//.test(node.source.trim()) ? node.source.trim() : "";
    if (url) { const b = ibtn('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', "Open the link in the browser", () => window.studio.openExternal(url)); b.classList.add("sm-srcopen"); wrap.append(b); }
    return wrap;
  }
  /** The flag "not solved here": the page stays in the map, no screen is built for it, it is not counted. */
  function flagField() {
    const cb = el("input", { type: "checkbox", checked: Boolean(node.notSolved) }); cb.onchange = () => set({ notSolved: cb.checked });
    return el("label", { className: "sm-f sm-flag", title: "It stays in the map, but no screen is built for it here and it is not counted" }, cb, el("span", { textContent: "Not solved here" }));
  }
  /** The flag "approved": the user has reviewed the page and it stays as it is; the agent does not change it. */
  function approveField() {
    const cb = el("input", { type: "checkbox", checked: Boolean(node.approved) }); cb.onchange = () => set({ approved: cb.checked });
    return el("label", { className: "sm-f sm-flag", title: "You have reviewed this page: the agent keeps it as it is on a revision, and changing it here asks first when it has a screen" }, cb, el("span", { textContent: "Approved" }));
  }
  const cbox = commentBox(splitComments(node.comment), "Comment on this page", (l) => set({ comment: joinComments(l) }));
  sideTitle(node.title, true);
  out.append(el("div", { className: "sm-edit", role: "group", "aria-label": `Page ${node.title}` },
    cbox,
    el("div", { className: "sm-chead sm-shead" }, el("b", { textContent: "Page settings" })),
    el("div", { className: "sm-fields" }, field("Name", text(node.title, "title")), field("Type", type), canFlag(node.type) ? flagField() : null, node.type !== "external" ? approveField() : null, field("Screen file", screenField()), field("Note", text(node.note, "note", "What the page is for")), field("Source", sourceField())),
    el("div", { className: "sm-acts" },
      opts.editorHost ? null : btn("Deselect", () => onSelect?.(null, false), { title: "Select no page (also a click on the empty map, or on the selected page)" }),
      // one row of icon buttons (the name is in the tooltip): add | move | delete; the screen is the one primary button
      el("div", { className: "sm-bar", role: "toolbar", "aria-label": "Actions on the page" },
        ibtn(IC.inside, `Add a ${word(childType(sm, node))} inside this one`, () => act(addChild(sm, sel))), ibtn(IC.after, `Add a ${portal && ["page", "sheet", "section"].includes(node.type) ? word(node.type) : "page"} after this one (next to it)`, () => act(addSibling(sm, sel))), ibtn(IC.copy, "Duplicate this page (a copy right after it)", () => act(duplicateNode(sm, sel)), !sel.length || node.children.length > 0, "", sel.length ? "only a page without sub-pages can be duplicated" : "the root cannot be duplicated"), el("span", { className: "sm-bsep" }),
        ibtn(IC.up, "Move up among the pages of the same level", () => okToChange([node], "Move") && act(moveNode(sm, sel, -1)), !parent || i === 0, "", "it is the first one"), ibtn(IC.down, "Move down among the pages of the same level", () => okToChange([node], "Move") && act(moveNode(sm, sel, 1)), !parent || i === parent.children.length - 1, "", "it is the last one"),
        ibtn(IC.indent, "Put it inside the page above (one level deeper)", () => okToChange([node], "Move") && act(indentNode(sm, sel)), !parent || i === 0, "", "there is no page above it to go into"), ibtn(IC.outdent, "Move it one level up", () => okToChange([node], "Move") && act(outdentNode(sm, sel)), sel.length < 2, "", "it is already on the first level"), el("span", { className: "sm-bsep" }),
        ibtn(IC.trash, "Delete the page with its sub-pages", () => { if ((!node.children.length || confirm(`Delete “${node.title}” with its ${node.children.length} sub-page(s)?`)) && okToChange([node], "Delete")) act(removeNode(sm, sel)); }, !sel.length, "danger", "the root cannot be deleted")),
      screenBtn)));
  return root;
}
