/**
 * The flow layer: arrows on the canvas from a screen to the screens it links to (main/flow.mjs finds the links).
 * An SVG inside the canvas world, so it moves and zooms with the frames. `api.flowEdges()` -> [{ from, to }];
 * `canvas.rects()` -> { file: { x, y, w, h } } in world coordinates.
 */
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

/** The curve of an arrow between two rectangles: leaves the side that faces the other screen, enters the facing side of the target. */
export function arrowPath(a, b, offset = 0) {
  const right = b.x >= a.x + a.w / 2 ? 1 : -1;
  const ay = a.y + Math.min(a.h / 2, 260) + offset, by = b.y + Math.min(b.h / 2, 260) + offset; // `offset` keeps two arrows between the same screens apart
  const ax = right > 0 ? a.x + a.w : a.x, bx = right > 0 ? b.x : b.x + b.w;
  const k = Math.max(80, Math.abs(bx - ax) / 2);
  return { d: `M${ax},${ay} C${ax + right * k},${ay} ${bx - right * k},${by} ${bx},${by}`, start: { x: ax, y: ay } };
}

export function createFlowLayer({ world, canvas, api }) {
  const svg = svgEl("svg", { class: "flow-layer", width: "1", height: "1" });
  svg.innerHTML = '<defs><marker id="flow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>';
  world.prepend(svg);
  let edges = [], on = true, seq = 0;

  function draw() {
    for (const p of [...svg.querySelectorAll("path.flow-arrow, circle.flow-dot")]) p.remove();
    svg.style.display = on ? "" : "none";
    if (!on) return;
    const rects = canvas.rects();
    for (const e of edges) {
      const a = rects[e.from], b = rects[e.to]; if (!a || !b) continue;
      const both = edges.some((o) => o.from === e.to && o.to === e.from), { d, start } = arrowPath(a, b, both ? (e.from < e.to ? -20 : 20) : 0);
      svg.append(svgEl("circle", { class: "flow-dot", cx: start.x, cy: start.y, r: 7 }), svgEl("path", { class: "flow-arrow", d, "marker-end": "url(#flow-head)" }));
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
    count: () => edges.length,
    clear() { edges = []; draw(); },
  };
}
