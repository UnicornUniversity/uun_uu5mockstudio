import { FIBER } from "./pageFiber.js";

/**
 * Where, relative to a component, a dragged component would land: "before" / "after" it among its siblings or "inside" it.
 * `rect` = the box of the component, `pt` = the pointer, `axis` = "column" | "row" (the direction its siblings are laid out in),
 * `canInside` = it takes children. A component that takes children has an edge band along the axis (a quarter, 8 to 28 px) for
 * before / after; the rest is inside. One that does not take children is split in halves.
 */
export function zoneOf(rect, pt, axis, canInside) {
  const row = axis === "row", size = row ? rect.width : rect.height, at = (row ? pt.x - rect.left : pt.y - rect.top);
  if (!canInside) return at < size / 2 ? "before" : "after";
  const band = Math.min(28, Math.max(8, size / 4));
  return at < band ? "before" : at > size - band ? "after" : "inside";
}

// Page-side helpers shared by the inspector (a component dragged inside its own screen) and by DROP_INJECT (a component of the catalogue dragged over a screen).
// They need the helpers of FIBER in scope. `dropAt(x, y, { exclude })` takes the pointer in page coordinates, shows where the component would land
// (a line before / after, a frame inside; red when it cannot go there) and reports it; `dropClear()` hides that; `dropMark` is the element that shows it.
// `exclude` = the ordinal of the component that is being moved: it cannot be put into itself.
export const DROP_CORE = `
  const zoneOf = ${zoneOf.toString()};
  const dropMark = document.createElement("div");
  dropMark.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;display:none;box-sizing:border-box";
  document.documentElement.appendChild(dropMark);
  // the direction the siblings of the component are laid out in: a flex or grid parent in a row, inline things next to each other
  const axisOf = (T) => {
    const host = hostNodes(T)[0], p = host && host.parentElement; if (!p) return "column";
    const cs = getComputedStyle(p), d = getComputedStyle(host).display;
    if (cs.display.includes("flex")) return cs.flexDirection.startsWith("row") ? "row" : "column";
    return d.startsWith("inline") || cs.display.includes("grid") && cs.gridAutoFlow.startsWith("column") ? "row" : "column";
  };
  const takesChildren = (T) => {
    const p = T.memoizedProps || {}, c = p.children;
    if (c !== undefined && c !== null && c !== false) return true;
    const t = T.type || {}, pt = t.propTypes || (t.type && t.type.propTypes) || (t.render && t.render.propTypes) || null;
    return Boolean(pt && "children" in pt);
  };
  const paint = (r, zone, axis, ok) => {
    const c = ok ? "#4f8cff" : "#ff5a5a";
    if (zone === "inside") Object.assign(dropMark.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", border: "2px solid " + c, background: ok ? "rgba(79,140,255,.10)" : "rgba(255,90,90,.10)", borderRadius: "3px" });
    else if (axis === "row") Object.assign(dropMark.style, { display: "block", left: (zone === "before" ? r.left : r.left + r.width) - 1.5 + "px", top: r.top + "px", width: "3px", height: r.height + "px", border: "0", background: c, borderRadius: "2px" });
    else Object.assign(dropMark.style, { display: "block", left: r.left + "px", top: (zone === "before" ? r.top : r.top + r.height) - 1.5 + "px", width: r.width + "px", height: "3px", border: "0", background: c, borderRadius: "2px" });
  };
  const dropAt = (x, y, opts) => {
    const el = document.elementFromPoint(x, y), f0 = el && compAt(el);
    if (!f0) { dropMark.style.display = "none"; return null; }
    const T = outermost(f0), r = rectOf(T); if (!r) { dropMark.style.display = "none"; return null; }
    const ord = ordOf(T), exclude = opts && Number.isInteger(opts.exclude) ? opts.exclude : null;
    let ok = true;
    if (exclude !== null) for (let g = T; g; g = g.return) if (ordOf(g) === exclude) { ok = false; break; }
    const axis = axisOf(T), canInside = takesChildren(T), zone = zoneOf(r, { x, y }, axis, canInside);
    paint(r, zone, axis, ok);
    return { ordinal: ord, zone, ok, name: publicName(T), canInside };
  };
  const dropClear = () => { dropMark.style.display = "none"; };
`;

// Runs inside the mockup page (injected when a component is dragged over the screen).
export const DROP_INJECT = `(() => {
  if (window.__studioDrop) return;
  ${FIBER}
  ${DROP_CORE}
  window.__studioDrop = { at: dropAt, clear: dropClear, off() { dropMark.remove(); delete window.__studioDrop; } };
})()`;
