/**
 * The flow layer: arrows on the canvas from a screen to the screens it links to (main/flow.mjs finds the links).
 * An SVG inside the canvas world, so it moves and zooms with the frames. `api.flowEdges()` -> [{ from, to, nav }];
 * `canvas.rects()` -> { file: { x, y, w, h } } in world coordinates.
 *
 * Kept readable when every screen links to every other one:
 *  - links that belong to a menu (`nav`) are hidden unless asked for (`setNav`) or the screen is focused, so only the real flow is drawn;
 *  - a pair that links both ways is one line with a head at each end;
 *  - an arrow leaves the side that faces the other screen (top/bottom when the screens are above each other) and the arrows on one
 *    side get their own spots along it, ordered by where they go, so they do not pile up in one point or cross needlessly;
 *  - the arrows of the focused screen (selected or under the pointer) are drawn strong, all the others fade.
 */
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

const PAD = 60, BAND = 600; // spots lie in the upper part of a side (screens are tall) and away from the corners
const DIR = { r: [1, 0], l: [-1, 0], b: [0, 1], t: [0, -1] };

/** The sides two screens face each other with: left/right when they are side by side, top/bottom when above each other. */
export function sidesFor(a, b) {
  const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (gx >= gy) { const right = b.x + b.w / 2 >= a.x + a.w / 2; return { from: right ? "r" : "l", to: right ? "l" : "r" }; }
  const down = b.y + b.h / 2 >= a.y + a.h / 2; return { from: down ? "b" : "t", to: down ? "t" : "b" };
}

/** A spot on a side of a rectangle; `t` (0..1) is the position along that side. */
export function portPoint(r, side, t = 0.5) {
  if (side === "l" || side === "r") return { x: side === "r" ? r.x + r.w : r.x, y: r.y + PAD + t * (Math.min(r.h, BAND) - 2 * PAD) };
  return { x: r.x + PAD + t * (r.w - 2 * PAD), y: side === "b" ? r.y + r.h : r.y };
}

/** The curve between two rectangles; `slots` = the position along the leaving side and along the entering side. */
export function arrowPath(a, b, slots = {}) {
  const s = sidesFor(a, b), p = portPoint(a, s.from, slots.from ?? 0.5), q = portPoint(b, s.to, slots.to ?? 0.5);
  const k = Math.min(320, Math.max(60, Math.hypot(q.x - p.x, q.y - p.y) / 2)), [fx, fy] = DIR[s.from], [tx, ty] = DIR[s.to];
  return { d: `M${p.x},${p.y} C${p.x + fx * k},${p.y + fy * k} ${q.x + tx * k},${q.y + ty * k} ${q.x},${q.y}`, start: p, end: q, sides: s };
}

/** Edges -> links to draw: a pair that points both ways becomes one link. Menu links are left out unless `showNav`, except those of the focused screen. */
export function linksOf(edges, showNav, focus = null) {
  const shown = edges.filter((e) => showNav || !e.nav || (focus && (e.from === focus || e.to === focus))), has = new Set(shown.map((e) => `${e.from}>${e.to}`)), links = [];
  for (const e of shown) {
    const both = has.has(`${e.to}>${e.from}`);
    if (both && e.from > e.to) continue; // the pair is drawn once, from the smaller name
    links.push({ from: e.from, to: e.to, both, nav: both ? e.nav && shown.find((o) => o.from === e.to && o.to === e.from).nav : e.nav });
  }
  return links;
}

export function createFlowLayer({ world, canvas, api, onDraw }) {
  const svg = svgEl("svg", { class: "flow-layer", width: "1", height: "1" });
  svg.innerHTML = '<defs><marker id="flow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>';
  world.prepend(svg);
  let edges = [], on = true, showNav = false, focus = null, seq = 0;

  function draw() {
    for (const g of [...svg.querySelectorAll("g.flow-link")]) g.remove();
    svg.style.display = on ? "" : "none";
    onDraw?.();
    if (!on) return;
    const rects = canvas.rects(), links = linksOf(edges, showNav, focus).filter((l) => rects[l.from] && rects[l.to]);
    // spots: the arrows on one side of a screen, ordered by where they go
    const groups = new Map();
    for (const l of links) {
      const a = rects[l.from], b = rects[l.to], s = sidesFor(a, b); l.sides = s;
      for (const [end, file, side, other] of [["from", l.from, s.from, b], ["to", l.to, s.to, a]]) {
        const key = `${file}|${side}`, vertical = side === "t" || side === "b";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ l, end, at: vertical ? other.x + other.w / 2 : other.y + other.h / 2 });
      }
    }
    for (const list of groups.values()) { list.sort((p, q) => p.at - q.at); list.forEach((m, i) => { (m.l.slots ??= {})[m.end] = (i + 1) / (list.length + 1); }); }
    const hot = (l) => focus && (l.from === focus || l.to === focus);
    for (const l of [...links].sort((p, q) => Number(hot(p)) - Number(hot(q)))) { // the focused ones on top
      const { d, start } = arrowPath(rects[l.from], rects[l.to], l.slots);
      const cls = ["flow-link", l.nav && "nav", focus && (hot(l) ? "hot" : "dim"), hot(l) && l.to === focus && !l.both && "in"].filter(Boolean).join(" ");
      const g = svgEl("g", { class: cls });
      const path = svgEl("path", { class: "flow-arrow", d, "marker-end": "url(#flow-head)" });
      if (l.both) path.setAttribute("marker-start", "url(#flow-head)"); else g.append(svgEl("circle", { class: "flow-dot", cx: start.x, cy: start.y, r: 5 }));
      g.append(path); svg.append(g);
    }
  }
  async function refresh() {
    const my = ++seq, r = await api.flowEdges().catch(() => null);
    if (my !== seq) return;
    edges = Array.isArray(r) ? r : []; draw();
  }
  return {
    refresh, draw,
    setOn(v) { on = Boolean(v); draw(); },
    isOn: () => on,
    setNav(v) { showNav = Boolean(v); draw(); },
    navOn: () => showNav,
    navCount: () => edges.filter((e) => e.nav).length,
    setFocus(file) { const f = file || null; if (f !== focus) { focus = f; draw(); } },
    count: () => edges.length,
    clear() { edges = []; draw(); },
  };
}
