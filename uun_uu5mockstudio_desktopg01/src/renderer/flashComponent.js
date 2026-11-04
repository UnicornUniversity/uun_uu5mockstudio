import { FIBER } from "./pageFiber.js";

/**
 * Page-side script that shows where a component of the message is: it scrolls the component into view and frames it for a moment
 * (works without the inspector, e.g. for a chip of a message whose picking is over). Call `flashCode(ordinal)` for a screen, `flashCode(ordinal, nth)` for one copy of an element rendered by `.map`.
 */
const FLASH = `(ord, nth) => {
  ${FIBER}
  const seen = []; // the copies of an element rendered by .map, in the order of the page: \`nth\` picks one of them
  for (const el of document.querySelectorAll("body *")) {
    const f = compAt(el); if (!f || ordOf(f) !== ord) continue;
    const T = outermost(f); if (seen.some((x) => x === T || x.alternate === T)) continue;
    seen.push(T); if (nth != null && seen.length - 1 !== nth) continue;
    const host = hostNodes(T)[0]; if (!host) continue;
    host.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    const old = document.getElementById("__studio_flash"); if (old) old.remove();
    const m = document.createElement("div"); m.id = "__studio_flash";
    m.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:2px solid #e8590c;border-radius:4px;background:rgba(232,89,12,.14);transition:opacity .5s";
    document.documentElement.appendChild(m);
    const t0 = Date.now(), tick = () => {
      const r = rectOf(T), age = Date.now() - t0;
      if (!r || age > 1800) return void m.remove();
      Object.assign(m.style, { left: r.left - 2 + "px", top: r.top - 2 + "px", width: r.width + 4 + "px", height: r.height + 4 + "px", opacity: age > 1300 ? "0" : "1" });
      requestAnimationFrame(tick);
    };
    tick();
    return true;
  }
  return false;
}`;
export const flashCode = (ordinal, nth = null) => `(${FLASH})(${Number(ordinal)}, ${Number.isInteger(nth) ? nth : "null"})`;
