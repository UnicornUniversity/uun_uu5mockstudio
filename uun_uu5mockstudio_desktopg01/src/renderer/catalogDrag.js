import { DROP_INJECT } from "./dropTarget.js";

const THRESHOLD = 5;

/**
 * Dragging a component of the catalogue onto a screen of the canvas. A <webview> is a page of its own that gets no pointer events of the
 * app, so the drag runs on the app's side: a ghost follows the pointer, a transparent overlay keeps the events away from the pages, and the
 * pointer position is converted to the coordinates of the page under it, where `__studioDrop` (dropTarget.js) shows and reports the place.
 * `start(name, event)` is called on pointerdown of a catalogue item; a movement of a few pixels starts the drag (before that it is a click).
 * `onDrop({ file, name, ordinal, zone })` is called when the component is let go over a valid place.
 */
export function createCatalogDrag({ canvas, onDrop, onCancel }) {
  const injected = new WeakSet();
  let active = null;

  /** The screen under a point of the window and the point in the coordinates of its page. */
  function frameAt(cx, cy) {
    for (const f of canvas.all()) {
      const r = f.view.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom || !f.view.offsetWidth) continue;
      const k = r.width / f.view.offsetWidth;
      return { f, view: f.view, x: (cx - r.left) / k, y: (cy - r.top) / k };
    }
    return null;
  }
  const exec = (view, code) => { try { return view.executeJavaScript(code).catch(() => null); } catch { return Promise.resolve(null); } };
  async function probe(a, cx, cy) {
    const hit = frameAt(cx, cy);
    if (a.last && a.last.view !== hit?.view) { exec(a.last.view, "window.__studioDrop && window.__studioDrop.clear()"); a.last = null; a.hit = null; }
    if (!hit) return null;
    if (!injected.has(hit.view)) { injected.add(hit.view); await exec(hit.view, DROP_INJECT); }
    a.last = hit;
    const r = await exec(hit.view, `window.__studioDrop ? window.__studioDrop.at(${hit.x}, ${hit.y}, {}) : null`);
    a.hit = r ? { file: hit.f.file, ...r } : null;
    return a.hit;
  }
  /** Probes the pointer position; one probe runs at a time and the newest position replaces the ones that waited. */
  function schedule(a) {
    if (a.busy) { a.again = true; return; }
    a.busy = true;
    probe(a, a.cx, a.cy).then(() => {
      a.busy = false; if (active === a) paintGhost(a);
      if (a.again) { a.again = false; if (active === a) schedule(a); }
    });
  }
  function paintGhost(a) {
    const g = a.ghost, h = a.hit;
    g.style.left = a.cx + 14 + "px"; g.style.top = a.cy + 12 + "px";
    g.dataset.state = !h ? "none" : h.ok ? "ok" : "no";
    g.lastChild.textContent = !h ? "" : !h.ok ? "not here" : `${h.zone}${h.name ? " " + h.name.replace(/^(Uu5|Plus4U5)\w*\./, "") : ""}`;
  }
  function end(drop) {
    const a = active; if (!a) return; active = null;
    removeEventListener("pointermove", a.move, true); removeEventListener("pointerup", a.up, true); removeEventListener("keydown", a.key, true);
    a.ghost?.remove(); a.overlay?.remove(); document.body.classList.remove("catalog-dragging");
    if (a.last) exec(a.last.view, "window.__studioDrop && window.__studioDrop.clear()");
    if (drop && a.hit?.ok) onDrop({ file: a.hit.file, name: a.name, ordinal: a.hit.ordinal, zone: a.hit.zone }); else if (a.started) onCancel?.(Boolean(a.hit));
  }

  return {
    get dragging() { return Boolean(active?.started); },
    start(name, e) {
      if (e.button !== 0 || active) return;
      const a = active = { name, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, started: false, hit: null, last: null, busy: false, again: false };
      a.move = (ev) => {
        a.cx = ev.clientX; a.cy = ev.clientY;
        if (!a.started) {
          if (Math.hypot(a.cx - a.sx, a.cy - a.sy) < THRESHOLD) return;
          a.started = true; document.body.classList.add("catalog-dragging");
          a.overlay = Object.assign(document.createElement("div"), { className: "catalog-drag-overlay" });
          a.ghost = Object.assign(document.createElement("div"), { className: "catalog-drag-ghost" });
          a.ghost.append(Object.assign(document.createElement("b"), { textContent: name }), document.createElement("span"));
          document.body.append(a.overlay, a.ghost);
        }
        ev.preventDefault(); paintGhost(a); schedule(a);
      };
      a.up = async (ev) => {
        if (!a.started) return end(false);
        a.cx = ev.clientX; a.cy = ev.clientY;
        while (a.busy) await new Promise((r) => setTimeout(r, 10)); // the place under the pointer when it is let go decides
        await probe(a, a.cx, a.cy);
        end(true);
      };
      a.key = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); end(false); } };
      addEventListener("pointermove", a.move, true); addEventListener("pointerup", a.up, true); addEventListener("keydown", a.key, true);
    },
  };
}
