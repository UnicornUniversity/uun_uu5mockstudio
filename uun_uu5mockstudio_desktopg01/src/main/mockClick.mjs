/**
 * Clicking an element of a mockup page for the agent (the `browser_click` tool): the element is found by its visible text
 * (or a CSS selector), scrolled into view and pressed with real mouse input; if the page did not see a click, `el.click()` is
 * the fallback. The page state is never saved: reloading the screen resets everything the click changed.
 */

const SELECTABLE = "button, a[href], [role=button], [role=tab], [role=menuitem], [role=option], [role=switch], [role=checkbox], summary, input[type=checkbox], input[type=radio], input[type=submit], input[type=button], label, select, [onclick]";

/** Script run in the page: finds the target, scrolls it into view, arms a flag that notices the click, returns its centre. */
export function findScript({ text, selector, index = 0 } = {}) {
  return `(() => {
    const q = ${JSON.stringify({ text: text ?? "", selector: selector ?? "", index })};
    const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !e.closest("[aria-hidden=true]"); };
    const label = (e) => (e.getAttribute("aria-label") || e.getAttribute("title") || e.innerText || e.value || e.placeholder || e.name || "").replace(/\\s+/g, " ").trim();
    const all = [...document.querySelectorAll(${JSON.stringify(SELECTABLE)})].filter(vis);
    let list = q.selector ? [...document.querySelectorAll(q.selector)].filter(vis) : all;
    if (q.text) { const t = q.text.toLowerCase(), exact = list.filter((e) => label(e).toLowerCase() === t); list = exact.length ? exact : list.filter((e) => label(e).toLowerCase().includes(t)); }
    list = list.filter((e) => !list.some((o) => o !== e && e.contains(o))); // a label around a button: the innermost one
    const el = list[q.index];
    if (!el) return { ok: false, count: list.length, items: all.map((e) => e.tagName.toLowerCase() + ": " + label(e).slice(0, 50)).slice(0, 60) };
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    window.__studioTarget = el; window.__studioClicked = false;
    document.addEventListener("click", () => { window.__studioClicked = true; }, { capture: true, once: true });
    const r = el.getBoundingClientRect();
    return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, label: label(el).slice(0, 80), tag: el.tagName.toLowerCase(), count: list.length };
  })()`;
}

/** Clicks in the web contents `wc`. Resolves { ok, label, tag, count, viaFallback } or { ok: false, count, items } when nothing matches. */
export async function clickIn(wc, query, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const found = await wc.executeJavaScript(findScript(query));
  if (!found.ok) return found;
  await sleep(120); // the scroll settles
  const pt = { x: Math.round(found.x), y: Math.round(found.y) };
  wc.sendInputEvent({ type: "mouseMove", ...pt });
  wc.sendInputEvent({ type: "mouseDown", ...pt, button: "left", clickCount: 1 });
  wc.sendInputEvent({ type: "mouseUp", ...pt, button: "left", clickCount: 1 });
  await sleep(250);
  let viaFallback = false;
  if (!(await wc.executeJavaScript("window.__studioClicked === true"))) { // the page saw no click: press it from the inside
    await wc.executeJavaScript("window.__studioTarget && window.__studioTarget.click()"); viaFallback = true;
  }
  return { ...found, viaFallback };
}
