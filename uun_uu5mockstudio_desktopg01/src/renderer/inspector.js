const PICK = "__studio_pick__";

// Runs inside the mockup page. Reports the clicked uu5 component through console.log (read by the <webview> console-message event).
// The server tags every uu5 component of the mockup with `data-uu5-src="<ordinal of its JSX element in the file>"` (see jsxSource.mjs);
// the React fiber tree is walked from the clicked DOM node to the nearest tagged component and its tagged ancestors.
export const INJECT = `(async () => {
  if (window.__studioInspect) return;
  window.__studioInspect = { off() { delete window.__studioInspect; } };
  const SRC = "data-uu5-src";

  // Values the uuGds / uu5 palettes allow for props like colorScheme and borderRadius (the prop docs only say "colorScheme").
  let palettes = {};
  (async () => {
    try {
      const u = await window.Uu5Loader.import("uu5g05"), P = u.PropTypes || (u.default && u.default.PropTypes);
      if (P && P.COLOR_SCHEME) palettes.colorScheme = P.COLOR_SCHEME;
    } catch {}
    try {
      const E = (await window.Uu5Loader.import("uu5g05-elements")).default;
      palettes.borderRadius = Object.keys(E.UuGds.RadiusPalette.getValue(["box"], { height: 40 }));
    } catch {}
  })();

  const fiberOf = (el) => { for (let n = el; n; n = n.parentElement) { const k = Object.keys(n).find((x) => x.startsWith("__reactFiber$")); if (k) return n[k]; } return null; };
  const ordOf = (f) => { const v = f.memoizedProps ? f.memoizedProps[SRC] : undefined; return v === undefined || v === null ? null : Number(v); };
  const compAt = (el) => { for (let f = fiberOf(el); f; f = f.return) { if (ordOf(f) !== null) return f; } return null; };
  const hostNodes = (f, out = []) => { for (let c = f.child; c; c = c.sibling) { if (c.tag === 5 && c.stateNode instanceof Element) out.push(c.stateNode); else hostNodes(c, out); } return out; };
  const chainOf = (f) => { const out = []; for (; f && out.length < 8; f = f.return) { const o = ordOf(f); if (o !== null && o !== out[out.length - 1]) out.push(o); } return out; };
  const rectOf = (f) => {
    const rs = hostNodes(f).map((n) => n.getBoundingClientRect()).filter((r) => r.width || r.height);
    if (!rs.length) return null;
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    return { left: l, top: t, width: Math.max(...rs.map((r) => r.right)) - l, height: Math.max(...rs.map((r) => r.bottom)) - t };
  };
  const sum = (v) => {
    if (v === null || ["string", "number", "boolean", "undefined"].includes(typeof v)) return v;
    if (typeof v === "function") return "ƒ()";
    if (v && v.$$typeof) return "<element>";
    try { const j = JSON.stringify(v); return j && j.length > 160 ? j.slice(0, 157) + "…" : j; } catch { return "{…}"; }
  };
  // A component rendered from an object in a list prop (e.g. one button of ActionGroup.itemList) has no JSX element of its own:
  // find the fiber under the tagged component whose props carry the same values as one of the list items.
  const plainObj = (v) => v && typeof v === "object" && !Array.isArray(v) && !v.$$typeof;
  const publicName = (f) => { const t = f.type, n = typeof t === "string" ? "" : (t && (t.displayName || t.name)) || ""; const m = String(n).match(/((?:Uu5|Plus4U5)[A-Za-z0-9]*\\.[A-Z][\\w.]*)\\)*$/); return m ? m[1] : null; };
  const subOf = (T0, clicked) => {
    // the tag is passed down through wrapper components (Block -> BlockView -> Box ...): the props that hold the list live on the outermost fiber with the same ordinal
    let T = T0; const ord = ordOf(T0);
    for (let g = T0.return; g; g = g.return) { const o = ordOf(g); if (o === null) continue; if (o === ord) T = g; else break; }
    const path = []; for (let f = clicked; f && f !== T; f = f.return) path.unshift(f);
    const lists = Object.entries(T.memoizedProps || {}).filter(([k, v]) => k !== "children" && Array.isArray(v) && v.some(plainObj));
    if (!lists.length) return null;
    for (let gi = 0; gi < path.length; gi++) {
      const pp = path[gi].memoizedProps; if (!pp || typeof pp !== "object") continue;
      let best = null;
      for (const [prop, arr] of lists) arr.forEach((it, i) => {
        if (!plainObj(it)) return;
        const keys = Object.keys(it).filter((k) => it[k] !== undefined); if (!keys.length) return;
        const hit = keys.filter((k) => Object.is(pp[k], it[k])).length;
        if (hit >= Math.ceil(keys.length * 0.6) && (!best || hit > best.hit)) best = { prop, index: i, count: arr.length, hit };
      });
      if (best) { let name = null; for (const h of path.slice(gi)) if ((name = publicName(h))) break; return { prop: best.prop, index: best.index, count: best.count, name, fiber: path[gi] }; }
    }
    return null;
  };
  // what is under the pointer: the tagged component and, when it is an item of one of its list props, that item
  const outermost = (T0) => { let T = T0; const ord = ordOf(T0); for (let g = T0.return; g; g = g.return) { const o = ordOf(g); if (o === null) continue; if (o === ord) T = g; else break; } return T; };
  const resolve = (el) => { const clicked = fiberOf(el); const T0 = clicked && compAt(el); if (!T0) return null; const T = outermost(T0); return { T, sub: subOf(T, clicked) }; };
  const typeProps = (f, key) => { const T = f.type || {}; return T[key] || (T.type && T.type[key]) || (T.render && T.render[key]) || null; };

  const box = document.createElement("div");
  box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #4f8cff;background:transparent;box-shadow:0 0 0 1px rgba(255,255,255,.7),inset 0 0 0 1px rgba(255,255,255,.35);border-radius:3px;display:none";
  document.documentElement.appendChild(box);
  // the marked components (Shift / Cmd / Ctrl + click adds or removes one) keep an orange frame; a plain click marks just that one
  const sel = new Map(), marks = [];
  const keyOf = (T, sub) => ordOf(T) + "|" + (sub ? sub.prop + "[" + sub.index + "]" : "");
  const paintSel = () => {
    while (marks.length > sel.size) marks.pop().remove();
    while (marks.length < sel.size) {
      const m = document.createElement("div");
      m.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #e8590c;background:transparent;box-shadow:0 0 0 1px rgba(255,255,255,.7),inset 0 0 0 1px rgba(255,255,255,.35);border-radius:3px;display:none";
      document.documentElement.appendChild(m); marks.push(m);
    }
    let i = 0;
    for (const fib of sel.values()) {
      const r = rectOf(fib), m = marks[i++];
      if (!r) { m.style.display = "none"; continue; }
      Object.assign(m.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    }
  };
  const selTimer = setInterval(paintSel, 400); // the page re-renders and scrolls: keep the frames on their components
  const move = (e) => {
    const hit = resolve(e.target), r = hit && rectOf(hit.sub ? hit.sub.fiber : hit.T);
    if (!r) { box.style.display = "none"; return; }
    Object.assign(box.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  };
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  let levels = [], lastSub = null; // the components around the last pick, nearest first (the panel can pick one of them without a click)
  const click = (e) => {
    stop(e);
    const hit = resolve(e.target); if (!hit) return;
    const f = hit.T, sub = hit.sub, shown = sub ? sub.fiber : f;
    levels = []; lastSub = sub;
    for (let g = f, last = null; g && levels.length < 8; g = g.return) { const o = ordOf(g); if (o !== null && o !== last) { levels.push(outermost(g)); last = o; } }
    const key = keyOf(f, sub), additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) { if (sel.has(key)) sel.delete(key); else sel.set(key, shown); } else { sel.clear(); sel.set(key, shown); }
    paintSel();
    const r = rectOf(shown) || { width: 0, height: 0 }, props = {};
    for (const [k, v] of Object.entries(shown.memoizedProps || {})) if (k !== SRC && k !== "children") props[k] = sum(v);
    const ownerRuntime = {};
    if (sub) for (const [k, v] of Object.entries(f.memoizedProps || {})) if (k !== SRC && k !== "children") ownerRuntime[k] = sum(v);
    console.log("${PICK}" + JSON.stringify({
      key, additive, selected: sel.has(key),
      chain: chainOf(f), runtime: props, ownerRuntime, propNames: Object.keys(typeProps(shown, "propTypes") || {}), ownerPropNames: Object.keys(typeProps(f, "propTypes") || {}),
      sub: sub ? { prop: sub.prop, index: sub.index, count: sub.count, name: sub.name } : null,
      assets: { gdsBase: (() => { const e = performance.getEntriesByType("resource").find((x) => /uu_gds_svgg01-icons\\.min\\.css/.test(x.name)); return e ? e.name.slice(0, e.name.lastIndexOf("/") + 1) : null; })() },
      palettes, text: (hostNodes(shown)[0]?.innerText || "").trim().slice(0, 100), w: Math.round(r.width), h: Math.round(r.height),
    }));
  };
  const swallow = (e) => stop(e);
  const events = ["mousedown", "mouseup", "submit", "pointerdown", "pointerup"];
  const esc = (e) => { if (e.key === "Escape") console.log("__studio_esc__"); }; // the app listens for Escape, which the page swallows
  addEventListener("keydown", esc, true);
  addEventListener("mousemove", move, true); addEventListener("click", click, true);
  addEventListener("scroll", paintSel, true); addEventListener("resize", paintSel);
  for (const t of events) addEventListener(t, swallow, true);
  document.documentElement.style.cursor = "crosshair";
  window.__studioInspect = {
    drop(key) { sel.delete(key); paintSel(); }, clear() { sel.clear(); paintSel(); },
    /* The frame goes to the component i levels above the last pick (or to the picked item of a list). */
    markLevel(i, item) { const fib = item && lastSub ? lastSub.fiber : levels[i]; if (!fib) return; sel.clear(); sel.set(keyOf(levels[i] ?? levels[0], item ? lastSub : null), fib); paintSel(); },
    off() {
      removeEventListener("keydown", esc, true); removeEventListener("mousemove", move, true); removeEventListener("click", click, true);
      removeEventListener("scroll", paintSel, true); removeEventListener("resize", paintSel); clearInterval(selTimer);
      for (const t of events) removeEventListener(t, swallow, true);
      box.remove(); for (const m of marks) m.remove(); document.documentElement.style.cursor = ""; delete window.__studioInspect;
    },
  };
})()`;
const OFF = `window.__studioInspect && window.__studioInspect.off()`;

export function createInspector({ onPick, onEscape }) {
  let on = false;
  const run = (view, code) => { try { return view.executeJavaScript(code).catch(() => {}); } catch { /* webview not ready */ } };
  return {
    get on() { return on; },
    set(v, views) { on = v; for (const view of views) run(view, v ? INJECT : OFF); },
    injectIfOn: (view) => on && run(view, INJECT),
    /** Takes the frame of one marked component off the page of `view` / takes all frames off the pages of `views`. */
    drop: (view, key) => run(view, `window.__studioInspect && window.__studioInspect.drop(${JSON.stringify(key)})`),
    markLevel: (view, i, item) => run(view, `window.__studioInspect && window.__studioInspect.markLevel(${Number(i)}, ${item ? "true" : "false"})`),
    clearIn: (views) => { for (const view of views) run(view, "window.__studioInspect && window.__studioInspect.clear()"); },
    /** Call from each webview's console-message event. Returns true when the message was an inspector pick. */
    handleConsole(file, message) {
      if (message === "__studio_esc__") { onEscape?.(); return true; }
      if (!message.startsWith(PICK)) return false;
      try { onPick({ file, ...JSON.parse(message.slice(PICK.length)) }); } catch {}
      return true;
    },
  };
}

export const MAX_MARKED = 8;
/**
 * The components marked in the inspector. A plain click marks just that one; Shift / Cmd / Ctrl + click adds one or (when the page
 * says it was marked before, `selected: false`) removes it. Returns the new list, the component the panel should show (null when
 * nothing is left), the files whose pages still carry frames of the old selection and the pick that had to be refused (too many).
 */
export function updateSelection(list, p, max = MAX_MARKED) {
  const k = (x) => `${x.file}|${x.key}`;
  if (!p.additive) return { selection: [p], active: p, clearFiles: [...new Set(list.map((x) => x.file))].filter((f) => f !== p.file), refused: null };
  if (p.selected === false) { const selection = list.filter((x) => k(x) !== k(p)); return { selection, active: selection.at(-1) ?? null, clearFiles: [], refused: null }; }
  if (list.some((x) => k(x) === k(p))) return { selection: list, active: p, clearFiles: [], refused: null };
  if (list.length >= max) return { selection: list, active: list.at(-1) ?? null, clearFiles: [], refused: p };
  return { selection: [...list, p], active: p, clearFiles: [], refused: null };
}

/** Compact one-line description used in the chat chip and the sent message. */
export function describePick(p) {
  const what = p.text ? ` “${p.text}”` : "";
  const chain = (p.chain ?? []).map((c) => c.name).filter(Boolean);
  if (p.sub) return `${p.element?.name || "item"}${what} — item ${p.sub.index + 1} of ${p.sub.prop} of ${chain[0] ?? "component"} in ${p.file}`.replace(/\s+/g, " ");
  const nested = chain.length > 1 ? ` (inside ${chain.slice(1, 3).join(" › ")})` : "";
  return `${chain[0] ?? "component"}${what}${nested} in ${p.file}`.replace(/\s+/g, " ");
}

const LEVEL = `The file is a React/JSX program (a <script type="text/babel"> block) that is interpreted and rendered into HTML by the uu5 loader. ` +
  `Work at the component level: change props, children or the place in the JSX tree, using the uu5/uuGDS component API — do not think in terms of the resulting DOM, CSS selectors or HTML.`;
const fence = (code) => (code ? `\n\`\`\`jsx\n${code}\n\`\`\`` : "");

/** One selected component (or list item) as a sentence plus its source. */
function describeForAgent(p) {
  const chain = (p.chain ?? []).map((c) => c.name).filter(Boolean);
  if (p.sub) {
    return `item ${p.sub.index + 1} (counting from 1) of the \`${p.sub.prop}\` prop of ${chain[0] ?? "(unknown)"} in ${p.file}` +
      `${p.element?.name && p.element.name !== "item" ? `, which that component renders as ${p.element.name}` : ""}${p.text ? `, rendered text: "${p.text}"` : ""}. ` +
      `The item as written in the file (an object inside the \`${p.sub.prop}\` array):${fence(p.element?.snippet)}`;
  }
  return `the uu5 component ${chain[0] ?? "(unknown)"} in ${p.file}` +
    `${chain.length > 1 ? `, nested in ${chain.slice(1).join(" › ")} (nearest parent first)` : ""}${p.text ? `, rendered text: "${p.text}"` : ""}. ` +
    `Its opening tag in the file:${fence(p.element?.snippet)}`;
}

/** What the agent is told: the selected component(s) at React level, with the exact source from the file. Takes one pick or a list. */
export function agentContext(picks) {
  const list = Array.isArray(picks) ? picks : [picks];
  // the picks are linked in the text of the request as [#1 …], [#2 …] where the user refers to them
  if (list.every((p) => p.ref != null)) {
    return `Context: the user marked ${list.length === 1 ? "a component" : `${list.length} components`} in the request. In the text they are written as markers [#n …] at the place they refer to ("change this one [#1 …] and that one [#2 …]"):\n` +
      list.map((p) => `#${p.ref}) ${describeForAgent(p)}`).join("\n") + `\n${LEVEL}`;
  }
  if (list.length === 1) return `Context: the user selected ${list[0].sub ? "one item of a list prop: " : ""}${describeForAgent(list[0])} ${LEVEL}`;
  return `Context: the user selected ${list.length} components for this request; the request may concern any or all of them:\n` +
    list.map((p, i) => `${i + 1}) ${describeForAgent(p)}`).join("\n") + `\n${LEVEL}`;
}
