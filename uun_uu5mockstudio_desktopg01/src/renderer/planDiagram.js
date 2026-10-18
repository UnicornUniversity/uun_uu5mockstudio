import { layoutTree, dropTarget, BOX } from "./planTree.js";

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k.startsWith("aria-")) n.setAttribute(k, v); else n[k] = v; }
  n.append(...kids.filter((x) => x != null));
  return n;
};
const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/**
 * The component tree as a diagram: boxes top-down, siblings left to right in the order of rendering, arrows from the child up to the parent, 1:1 (a small circle at the foot)
 * and 1:N (no circle, iteration). Zoom and pan, collapsing of a subtree, and (when editable) drag and drop of a box onto another one:
 * the left quarter puts it before, the right quarter after, the middle inside.
 *
 * `o` = { onNodeClick(node) (instead of select / detail), entry: { tree, sel, view, collapsed }, editable, known: Set, onSelect(path), onMove(from, to, position), onKey(path, event), onCollapse(key), onDetail(name), onChange() }.
 * Returns the element; `entry.view` = { zoom, x, y } keeps the position of the camera between repaints.
 */
export function renderDiagram(o) {
  const { entry, editable } = o, known = o.known ?? new Set();
  const layout = layoutTree(entry.tree, { collapsed: new Set(entry.collapsed ?? []) });
  const root = el("div", { className: "pd", tabIndex: -1, role: "group", "aria-label": "Component tree" });
  const stage = el("div", { className: "pd-stage" });
  stage.style.width = `${layout.width}px`; stage.style.height = `${layout.height}px`;
  const edges = svg("svg", { class: "pd-edges", width: layout.width + 20, height: layout.height + 20 });
  edges.style.overflow = "visible";
  stage.append(edges);
  const boxes = new Map();

  // ----- edges: they go from the child up to the parent (the arrow points at the component the other one is nested in); a small circle at the foot (the child) for 1:1
  const byKey = new Map(layout.nodes.map((b) => [b.key, b]));
  for (const e of layout.edges) {
    const child = byKey.get(e.to), mid = (e.y1 + e.y2) / 2, many = child.node.relation === "1:N", low = child.node.low;
    const g = svg("g", { class: `pd-edge${low ? " low" : ""}` });
    g.append(svg("path", { d: `M${e.x2} ${e.y2} V${mid} H${e.x1} V${e.y1 + 6}`, fill: "none" }), svg("path", { d: `M${e.x1 - 4.5} ${e.y1 + 7} L${e.x1} ${e.y1 + 0.5} L${e.x1 + 4.5} ${e.y1 + 7}`, fill: "none", class: "head" }));
    if (!many) g.append(svg("circle", { cx: e.x2, cy: e.y2 - 5, r: 4, class: "foot" }));
    edges.append(g);
  }

  // ----- boxes
  for (const b of layout.nodes) {
    const n = b.node, unknown = o.checkNames !== false && n.kind === "library" && !known.has(n.name), sel = b.key === (entry.sel ?? []).join(".");
    const box = el("div", {
      className: `pd-box k-${n.kind}${n.change ? ` c-${n.change}` : ""}${n.low ? " low" : ""}${sel && (editable || o.onNodeClick) ? " sel" : ""}${!editable && n.kind === "library" && !unknown ? " click" : ""}`,
      tabIndex: 0, role: "button",
      "aria-label": `${n.name}, ${n.kind}${n.change ? `, ${n.change}` : ""}${n.relation ? ", repeated" : ""}${b.path.length ? "" : ", root"}`,
      title: [n.name, n.note, n.data ? `receives: ${n.data}` : "", n.render ? `R: ${n.render}` : "", n.disabled ? `D: ${n.disabled}` : "", unknown ? "Not in the documentation of the uu5-development plugin." : ""].filter(Boolean).join("\n"),
    });
    box.dataset.key = b.key;
    Object.assign(box.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    const chips = el("div", { className: "pd-chips" });
    if (n.relation) chips.append(el("span", { className: "chip many", textContent: "×N" }));
    if (n.render) chips.append(el("span", { className: "chip r", textContent: "R", title: n.render }));
    if (n.disabled) chips.append(el("span", { className: "chip d", textContent: "D", title: n.disabled }));
    if (n.label) chips.append(el("span", { className: "chip lbl", textContent: `// ${n.label}` }));
    if (n.change) chips.append(el("span", { className: "chip chg", textContent: n.change }));
    if (unknown) chips.append(el("span", { className: "chip unk", textContent: "?" }));
    box.append(chips, el("code", { className: "pd-name", textContent: n.name }));
    const sub = n.data ? `← ${n.data}` : n.note;
    if (sub) box.append(el("span", { className: "pd-note", textContent: sub }));
    if (n.children?.length) {
      const c = el("button", { type: "button", className: "pd-fold", textContent: b.hidden ? `▸ ${b.hidden}` : "▾", title: b.hidden ? "Show the children" : "Hide the children", "aria-label": b.hidden ? `Show ${b.hidden} hidden components` : "Hide the children", "aria-expanded": String(!b.hidden) });
      c.onpointerdown = (e) => e.stopPropagation();
      c.onclick = (e) => { e.stopPropagation(); o.onCollapse?.(b.key); };
      box.append(c);
    }
    box.onclick = () => { if (dragged) { dragged = false; return; } if (o.onNodeClick) o.onNodeClick(n, b.path); else if (editable) o.onSelect?.(b.path); else if (n.kind === "library" && !unknown) o.onDetail?.(n.name); };
    box.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); box.click(); }
      else if (editable) o.onKey?.(b.path, e);
    };
    boxes.set(b.key, box); stage.append(box);
  }
  root.append(stage);

  // ----- camera
  const view = (entry.view ??= null);
  const apply = () => { const v = entry.view; stage.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.zoom})`; };
  const fit = () => {
    const w = root.clientWidth, h = root.clientHeight; if (!w || !h) return false;
    const natural = Math.min(1, (w - 32) / (layout.width + 20), (h - 32) / (layout.height + 20)), zoom = Math.max(0.2, natural);
    if (natural >= 0.45) entry.view = { zoom, x: (w - layout.width * zoom) / 2, y: Math.max(12, (h - layout.height * zoom) / 2) };
    else { const top = layout.nodes.find((b) => b.key === ""); entry.view = { zoom: 0.45, x: w / 2 - (top.x + top.w / 2) * 0.45, y: 16 }; } // too big to be readable at once: the top of the tree, the rest by panning or the large view
    apply(); return true;
  };
  const zoomAt = (factor, cx = root.clientWidth / 2, cy = root.clientHeight / 2) => {
    const v = entry.view, z = Math.max(0.2, Math.min(2, v.zoom * factor)), k = z / v.zoom;
    entry.view = { zoom: z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }; apply();
  };
  const bar = el("div", { className: "pd-bar" },
    ...[["−", "Zoom out", () => zoomAt(1 / 1.2)], ["+", "Zoom in", () => zoomAt(1.2)], ["Fit", "Show the whole tree", fit]].map(([t, title, fn]) => el("button", { type: "button", textContent: t, title, "aria-label": title, onclick: fn })));
  if (o.onFullscreen) bar.append(el("button", { type: "button", textContent: o.fullscreen ? "Close" : "⤢", title: o.fullscreen ? "Close the large view" : "Open large", "aria-label": o.fullscreen ? "Close the large view" : "Open large", onclick: o.onFullscreen }));
  root.append(bar);
  if (view) apply(); else {
    stage.style.visibility = "hidden";
    const first = () => { if (fit()) { stage.style.visibility = ""; return true; } return false; };
    requestAnimationFrame(() => { if (!first()) { const ro = new ResizeObserver(() => { if (first()) ro.disconnect(); }); ro.observe(root); } });
  }
  root.addEventListener("wheel", (e) => {
    if (!entry.view || !(e.ctrlKey || e.metaKey)) return; // a plain wheel scrolls the chat
    e.preventDefault(); const r = root.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // ----- pan (the background) and drag and drop (a box)
  let dragged = false;
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".pd-bar") || !entry.view) return;
    const box = e.target.closest(".pd-box");
    if (box) { if (editable && box.dataset.key !== "") startDrag(e, box); return; }
    const sx = e.clientX, sy = e.clientY, v0 = { ...entry.view };
    root.classList.add("panning");
    const move = (ev) => { entry.view = { ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy }; apply(); };
    const up = () => { root.classList.remove("panning"); removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });

  function startDrag(e, box) {
    const from = box.dataset.key.split(".").map(Number), sx = e.clientX, sy = e.clientY;
    let ghost = null, mark = null, target = null;
    const point = (ev) => { const r = root.getBoundingClientRect(), v = entry.view; return { x: (ev.clientX - r.left - v.x) / v.zoom, y: (ev.clientY - r.top - v.y) / v.zoom }; };
    const clear = () => { mark?.remove(); mark = null; };
    const show = (t) => {
      clear(); if (!t) return;
      const b = byKey.get(t.path.join(".")), m = el("div", { className: `pd-mark ${t.position}` });
      Object.assign(m.style, t.position === "inside" ? { left: `${b.x - 4}px`, top: `${b.y - 4}px`, width: `${b.w + 8}px`, height: `${b.h + 8}px` }
        : { left: `${t.position === "before" ? b.x - 8 : b.x + b.w + 5}px`, top: `${b.y}px`, height: `${b.h}px` });
      stage.append(m); mark = m;
    };
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        ghost = el("div", { className: "pd-ghost", textContent: box.querySelector(".pd-name").textContent }); root.append(ghost);
        box.classList.add("dragging"); root.classList.add("dragging");
      }
      const r = root.getBoundingClientRect(); ghost.style.left = `${ev.clientX - r.left + 10}px`; ghost.style.top = `${ev.clientY - r.top + 10}px`;
      const p = point(ev); target = dropTarget(layout, p.x, p.y, from); show(target);
    };
    const end = (cancel) => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("keydown", key, true);
      clear(); ghost?.remove(); box.classList.remove("dragging"); root.classList.remove("dragging");
      if (ghost) { dragged = true; setTimeout(() => { dragged = false; }, 0); }
      if (!cancel && ghost && target) o.onMove?.(from, target.path, target.position);
    };
    const up = () => end(false);
    const key = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); target = null; end(true); } };
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("keydown", key, true);
  }
  return root;
}

export { BOX };
