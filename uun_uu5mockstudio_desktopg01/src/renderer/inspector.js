const PICK = "__studio_pick__", MOVE = "__studio_move__", DELETE = "__studio_delete__", DUPLICATE = "__studio_duplicate__", TEXT = "__studio_text__", ITEM_MOVE = "__studio_itemmove__";

import { FIBER } from "./pageFiber.js";
import { DROP_CORE } from "./dropTarget.js";
export { FIBER };

// Runs inside the mockup page. Reports the clicked uu5 component through console.log (read by the <webview> console-message event).
// The server tags every uu5 component of the mockup with `data-uu5-src="<ordinal of its JSX element in the file>"` (see jsxSource.mjs);
// the React fiber tree is walked from the clicked DOM node to the nearest tagged component and its tagged ancestors.
// A press on a component followed by a movement of a few pixels drags it: the place it would land is shown (DROP_CORE) and, when it is let go,
// the move is reported through console.log as `MOVE` + JSON `{ ordinal, name, target, targetName, position }`.
export const INJECT = `(async () => {
  if (window.__studioInspect) return;
  window.__studioInspect = { off() { delete window.__studioInspect; } };
  ${FIBER}
  ${DROP_CORE}

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

  const chainOf = (f) => { const out = []; for (; f && out.length < 8; f = f.return) { const o = ordOf(f); if (o !== null && o !== out[out.length - 1]) out.push(o); } return out; };
  const sum = (v) => {
    if (v === null || ["string", "number", "boolean", "undefined"].includes(typeof v)) return v;
    if (typeof v === "function") return "ƒ()";
    if (v && v.$$typeof) return "<element>";
    try { const j = JSON.stringify(v); return j && j.length > 160 ? j.slice(0, 157) + "…" : j; } catch { return "{…}"; }
  };
  // A component rendered from an object in a list prop (e.g. one button of ActionGroup.itemList) has no JSX element of its own:
  // find the fiber under the tagged component whose props carry the same values as one of the list items.
  const plainObj = (v) => v && typeof v === "object" && !Array.isArray(v) && !v.$$typeof;
  const subOf = (T0, clicked) => {
    // the tag is passed down through wrapper components (Block -> BlockView -> Box ...): the props that hold the list live on the outermost fiber with the same ordinal
    let T = T0; const ord = ordOf(T0);
    for (let g = T0.return; g; g = g.return) { const o = ordOf(g); if (o === null) continue; if (o === ord) T = g; else break; }
    const path = []; for (let f = clicked; f && f !== T; f = f.return) path.unshift(f);
    // lists are props that hold an array of objects, and getXxxList() functions without parameters whose result is one (ContentContainer.getActionList)
    const lists = Object.entries(T.memoizedProps || {}).flatMap(([k, v]) => {
      if (k === "children") return [];
      if (Array.isArray(v)) return v.some(plainObj) ? [[k, v]] : [];
      if (typeof v === "function" && v.length === 0 && /^get[A-Z][A-Za-z0-9_]*List$/.test(k)) { try { const r = v(); return Array.isArray(r) && r.some(plainObj) ? [[k, r]] : []; } catch (e) { return []; } }
      return [];
    });
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
  const resolve = (el) => { const clicked = fiberOf(el); const T0 = clicked && compAt(el); if (!T0) return null; const T = outermost(T0); return { T, sub: subOf(T, clicked) }; };
  // An element written once in the file is rendered several times when it is inside \`LIST.map(…)\` (or in a component of the file that is used
  // more than once): its copies are the outermost fibers with its ordinal. The fibers reached from the DOM may belong to the tree React is
  // not showing (the alternate), so the copies are looked up in the committed tree and compared with both.
  const topOf = (f) => { while (f.return) f = f.return; return f; };
  const same = (a, b) => a === b || (a && a.alternate === b);
  const copiesOf = (T) => {
    const ord = ordOf(T), t = topOf(T), root = (t.stateNode && t.stateNode.current) || t, out = [], stack = [root];
    while (stack.length && out.length < 500) {
      const f = stack.pop();
      if (ordOf(f) === ord) { out.push(f); continue; }
      const kids = []; for (let c = f.child; c; c = c.sibling) kids.push(c);
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]); // the order of the page
    }
    return out;
  };
  // which copy T is: at each level where the copies part (the items of a \`.map\`), the place among the items that hold a copy, outermost first;
  // the innermost level is the item of the nearest \`.map\`, its React key (\`key={contact.name}\`) tells the item when it is one of its values
  const copyOf = (T) => {
    const cs = copiesOf(T), me = cs.find((c) => same(c, T) || same(T, c));
    if (cs.length < 2 || !me) return { copies: Math.max(1, cs.length), inst: null };
    const anc = cs.map((c) => { const s = new Set(); for (let g = c; g; g = g.return) s.add(g); return s; });
    const levels = [];
    for (let g = me; g && g.return; g = g.return) {
      const kids = []; for (let c = g.return.child; c; c = c.sibling) kids.push(c);
      const holders = kids.filter((k) => anc.some((s) => s.has(k)));
      if (holders.length > 1) levels.unshift({ index: holders.indexOf(g), count: holders.length, key: g.key == null ? null : String(g.key) });
    }
    if (!levels.length) levels.push({ index: cs.indexOf(me), count: cs.length, key: null });
    const inner = levels[levels.length - 1];
    return { copies: cs.length, inst: { index: inner.index, count: inner.count, key: inner.key, nth: cs.indexOf(me), path: levels.map((l) => l.index) }, all: cs };
  };
  const typeProps = (f, key) => { const T = f.type || {}; return T[key] || (T.type && T.type[key]) || (T.render && T.render[key]) || null; };

  const box = document.createElement("div");
  box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #4f8cff;background:transparent;box-shadow:0 0 0 1px rgba(255,255,255,.7),inset 0 0 0 1px rgba(255,255,255,.35);border-radius:3px;display:none";
  document.documentElement.appendChild(box);
  // The marked components keep an orange frame. A plain click marks just that one, Shift + click adds or removes a component of the file
  // (with all its copies when it is rendered by \`.map\`: they get a dashed frame, since a change of the element changes every copy),
  // Cmd / Ctrl + click adds or removes just the copy that was clicked (its own solid frame; the key ends with "@" and the place of the copy).
  // Entries: { fib, others: [fibers of the other copies], ord, sub, inst }
  const sel = new Map(), marks = [];
  const keyOf = (T, sub, inst) => ordOf(T) + "|" + (sub ? sub.prop + "[" + sub.index + "]" : "") + (inst ? "@" + (inst.key != null ? "k:" + inst.key : inst.path.join(".")) : "");
  const mark = (fib, ord, sub, inst, others) => ({ fib, ord, sub: sub ? { prop: sub.prop, index: sub.index } : null, inst: inst || null, others: others || [] });
  const paintSel = () => {
    const frames = []; for (const e of sel.values()) { frames.push([e.fib, false]); for (const o of e.others) frames.push([o, true]); }
    while (marks.length > frames.length) marks.pop().remove();
    while (marks.length < frames.length) {
      const m = document.createElement("div");
      m.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #e8590c;background:transparent;box-shadow:0 0 0 1px rgba(255,255,255,.7),inset 0 0 0 1px rgba(255,255,255,.35);border-radius:3px;display:none";
      document.documentElement.appendChild(m); marks.push(m);
    }
    frames.forEach(([fib, dashed], i) => {
      const r = rectOf(fib), m = marks[i];
      if (!r) { m.style.display = "none"; return; }
      Object.assign(m.style, { display: "block", borderStyle: dashed ? "dashed" : "solid", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    });
  };
  const selTimer = setInterval(paintSel, 400); // the page re-renders and scrolls: keep the frames on their components
  const move = (e) => {
    if (mv || ed) return;
    const hit = resolve(e.target), r = hit && rectOf(hit.sub ? hit.sub.fiber : hit.T);
    if (!r) { box.style.display = "none"; return; }
    Object.assign(box.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  };
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  let levels = [], lastSub = null; // the components around the last pick, nearest first (the panel can pick one of them without a click)
  // dragging a component to another place of the screen
  let pend = null, mv = null, afterDrag = false;
  const tip = document.createElement("div");
  tip.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;display:none;padding:3px 8px;border-radius:6px;background:#1d2433;color:#fff;font:600 11px system-ui,sans-serif;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.35)";
  document.documentElement.appendChild(tip);
  const endDrag = () => { pend = null; mv = null; dropClear(); tip.style.display = "none"; box.style.display = "none"; };
  const pdown = (e) => {
    pend = null; if (ed) return;
    if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    const hit = resolve(e.target); if (!hit) return;
    pend = { x: e.clientX, y: e.clientY, ord: ordOf(hit.T), name: publicName(hit.sub ? hit.sub.fiber : hit.T), sub: hit.sub ? { prop: hit.sub.prop, index: hit.sub.index } : null }; // an item of a list prop is dragged within its list
  };
  // the place of an item within its own list under the pointer: before / after another item of the same list (to = its index once the dragged one is taken out)
  const itemAt = (x, y) => {
    const el = document.elementFromPoint(x, y), h = el && resolve(el);
    if (!h || !h.sub || ordOf(h.T) !== mv.ord || h.sub.prop !== mv.sub.prop) return null;
    const r = rectOf(h.sub.fiber); if (!r) return null;
    const axis = axisOf(h.sub.fiber), zone = zoneOf(r, { x, y }, axis, false), j = h.sub.index, from = mv.sub.index;
    return { zone, axis, r, index: j, to: j === from ? from : (zone === "before" ? j : j + 1) - (from < j ? 1 : 0) }; // onto itself: nowhere
  };
  const pmove = (e) => {
    if (!pend) return;
    if (!mv) {
      if (e.buttons !== 1) return void (pend = null);
      if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) < 6) return;
      mv = { ...pend, hit: null }; box.style.display = "none";
    }
    e.preventDefault();
    const nm = (n) => (n ? n.replace(/^(Uu5|Plus4U5)\\w*\\./, "") : "component");
    if (mv.sub) { // an item: only another place of its own list counts
      mv.item = itemAt(e.clientX, e.clientY);
      if (mv.item && mv.item.to !== mv.sub.index) paint(mv.item.r, mv.item.zone, mv.item.axis, true); else dropClear();
      tip.textContent = mv.item && mv.item.to !== mv.sub.index ? "Item " + (mv.sub.index + 1) + " → place " + (mv.item.to + 1) : "Move item " + (mv.sub.index + 1) + " within " + mv.sub.prop;
    } else {
      mv.hit = dropAt(e.clientX, e.clientY, { exclude: mv.ord });
      const h = mv.hit;
      tip.textContent = !h ? "Move " + nm(mv.name) : !h.ok ? "Not here" : nm(mv.name) + " → " + h.zone + " " + nm(h.name);
    }
    Object.assign(tip.style, { display: "block", left: Math.min(innerWidth - 220, e.clientX + 14) + "px", top: e.clientY + 14 + "px" });
    if (e.clientY < 40) scrollBy(0, -18); else if (e.clientY > innerHeight - 40) scrollBy(0, 18);
  };
  const pup = () => {
    const m = mv; endDrag(); if (!m) return;
    afterDrag = true; setTimeout(() => { afterDrag = false; }, 0); // the click that follows the release is not a pick
    if (m.sub) { const t = m.item; if (t && t.to !== m.sub.index) console.log("${ITEM_MOVE}" + JSON.stringify({ ordinal: m.ord, prop: m.sub.prop, from: m.sub.index, to: t.to })); return; }
    const h = m.hit;
    if (h && h.ok) console.log("${MOVE}" + JSON.stringify({ ordinal: m.ord, name: m.name, target: h.ordinal, targetName: h.name, position: h.zone }));
  };
  // mode: "one" (a plain click), "add" (Shift: the component), "copy" (Cmd / Ctrl: only the copy that was clicked); \`additive\` of old callers = "add"
  const doPick = (hit, mode) => {
    if (mode === true) mode = "add"; else if (!mode) mode = "one";
    const f = hit.T, sub = hit.sub, shown = sub ? sub.fiber : f, additive = mode !== "one";
    levels = []; lastSub = sub;
    for (let g = f, last = null; g && levels.length < 8; g = g.return) { const o = ordOf(g); if (o !== null && o !== last) { levels.push(outermost(g)); last = o; } }
    const cp = copyOf(f), inst = mode === "copy" ? cp.inst : null;
    // the other copies of the element (framed dashed when the whole component is marked); for an item of a list prop, the same item in each copy
    const others = inst || !cp.all ? [] : cp.all.filter((c) => !same(c, f) && !same(f, c)).map((c) => {
      if (!sub) return c;
      for (const el of hostNodes(c)) for (const x of [el, ...el.querySelectorAll("*")]) { const h = resolve(x); if (h && h.sub && same(h.T, c) && h.sub.prop === sub.prop && h.sub.index === sub.index) return h.sub.fiber; }
      return null;
    }).filter(Boolean);
    const key = keyOf(f, sub, inst), entry = mark(shown, ordOf(f), sub, inst, others);
    if (additive) { if (sel.has(key)) sel.delete(key); else sel.set(key, entry); } else { sel.clear(); sel.set(key, entry); }
    paintSel();
    const r = rectOf(shown) || { width: 0, height: 0 }, props = {};
    for (const [k, v] of Object.entries(shown.memoizedProps || {})) if (k !== SRC && k !== "children") props[k] = sum(v);
    const ownerRuntime = {};
    if (sub) for (const [k, v] of Object.entries(f.memoizedProps || {})) if (k !== SRC && k !== "children") ownerRuntime[k] = sum(v);
    console.log("${PICK}" + JSON.stringify({
      key, additive, selected: sel.has(key), copies: cp.copies, inst: inst ? { index: inst.index, count: inst.count, key: inst.key, nth: inst.nth, path: inst.path } : null,
      chain: chainOf(f), runtime: props, ownerRuntime, propNames: Object.keys(typeProps(shown, "propTypes") || {}), ownerPropNames: Object.keys(typeProps(f, "propTypes") || {}),
      sub: sub ? { prop: sub.prop, index: sub.index, count: sub.count, name: sub.name } : null,
      assets: { gdsBase: (() => { const e = performance.getEntriesByType("resource").find((x) => /uu_gds_svgg01-icons\\.min\\.css/.test(x.name)); return e ? e.name.slice(0, e.name.lastIndexOf("/") + 1) : null; })() },
      palettes, text: (hostNodes(shown)[0]?.innerText || "").trim().slice(0, 100), w: Math.round(r.width), h: Math.round(r.height),
    }));
  };
  const click = (e) => {
    if (ed && ed.el.contains(e.target)) return void e.stopPropagation(); // a click in the text being edited is not a pick, and not a click of the page
    stop(e);
    if (afterDrag) return;
    if (MAC && e.ctrlKey && !e.metaKey) return; // on macOS Ctrl + click is a right click: it is picked in \`ctx\` below
    const hit = resolve(e.target); if (hit) doPick(hit, e.metaKey || e.ctrlKey ? "copy" : e.shiftKey ? "add" : "one");
  };
  const MAC = /Mac/.test(navigator.platform || navigator.userAgent);
  // macOS sends Ctrl + click as a context menu (button 0, ctrlKey); the preload of the webview leaves it to the page while the inspector is on
  const ctx = (e) => { if (!(e.ctrlKey && e.button === 0)) return; stop(e); if (afterDrag) return; const hit = resolve(e.target); if (hit) doPick(hit, "copy"); };
  const swallow = (e) => { if (ed && ed.el.contains(e.target)) return; stop(e); }; // the text being edited gets its own mouse
  const events = ["mousedown", "mouseup", "submit", "pointerdown", "pointerup"];
  // editing the text of a component in place: a double click on a text makes it editable (plain text), Enter or leaving the field hands the change over,
  // Escape drops it. The file is changed by what the text said before (jsx:editText), not by where it is on the page.
  let ed = null;
  const norm = (t) => String(t).split(/\\s+/).join(" ").trim();
  const endEdit = () => {
    if (!ed) return null;
    const x = ed; ed = null;
    x.el.removeEventListener("blur", x.blur); x.el.contentEditable = x.ce; x.el.style.outline = x.outline; x.el.style.outlineOffset = x.offset;
    getSelection().removeAllRanges();
    return x;
  };
  const commitEdit = () => {
    const x = endEdit(); if (!x) return;
    const value = norm(x.el.textContent);
    if (!value || value === x.old) { x.el.textContent = x.text; return; }
    console.log("${TEXT}" + JSON.stringify({ ordinal: x.ord, old: x.old, value }));
  };
  const cancelEdit = () => { const x = endEdit(); if (x) x.el.textContent = x.text; };
  const dbl = (e) => {
    stop(e);
    if (e.button !== 0 || ed) return;
    const hit = resolve(e.target); if (!hit || hit.sub) return;
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    let node = r && r.startContainer;
    if (node && node.nodeType === 3) { // the caret goes to the nearest text: only a double click on the text itself counts
      const rg = document.createRange(); rg.selectNodeContents(node); const b = rg.getBoundingClientRect();
      if (e.clientX < b.left - 4 || e.clientX > b.right + 4 || e.clientY < b.top - 4 || e.clientY > b.bottom + 4) node = null;
    }
    if ((!node || node.nodeType !== 3) && e.target.children && !e.target.children.length && e.target.firstChild && e.target.firstChild.nodeType === 3) node = e.target.firstChild; // beside the text, in the same box
    if (!node || node.nodeType !== 3 || !norm(node.data)) return;
    const el = node.parentElement;
    if (!el || el.children.length) { tip.textContent = "This text is part of a bigger one: edit it in the panel"; Object.assign(tip.style, { display: "block", left: Math.min(innerWidth - 300, e.clientX + 14) + "px", top: e.clientY + 14 + "px" }); setTimeout(() => { tip.style.display = "none"; }, 1800); return; }
    const text = el.textContent;
    ed = { el, text, old: norm(text), ord: ordOf(hit.T), ce: el.contentEditable, outline: el.style.outline, offset: el.style.outlineOffset, blur: () => commitEdit() };
    el.contentEditable = "plaintext-only"; el.style.outline = "2px solid #4f8cff"; el.style.outlineOffset = "2px";
    el.addEventListener("blur", ed.blur); box.style.display = "none"; el.focus();
    const range = document.createRange(); range.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(range);
  };
  const edkeys = (e) => {
    if (!ed) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); commitEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cancelEdit(); }
  };
  // Delete / Backspace takes the marked components (and items of lists) out of the file, Cmd / Ctrl + D copies them
  const marked = () => [...sel.values()].map((e) => ({ ordinal: e.ord, name: publicName(e.sub ? e.fib : outermost(e.fib)), sub: e.sub, ...(e.inst ? { inst: e.inst } : {}) }));
  const keys = (e) => {
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const dup = (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d";
    if (e.key !== "Delete" && e.key !== "Backspace" && !dup) return;
    const items = marked(); if (!items.length) return;
    e.preventDefault(); e.stopPropagation();
    if (items.some((x) => x.inst)) { // the file has one element for all copies: removing or copying it would change every copy
      tip.textContent = "A single copy from .map is changed through its item of the list: ask in the chat";
      Object.assign(tip.style, { display: "block", left: "12px", top: "12px" }); setTimeout(() => { tip.style.display = "none"; }, 2200); return;
    }
    if (dup) return void console.log("${DUPLICATE}" + JSON.stringify({ items }));
    sel.clear(); paintSel();
    console.log("${DELETE}" + JSON.stringify({ items }));
  };
  const esc = (e) => { if (e.key === "Escape") { if (mv) return void endDrag(); console.log("__studio_esc__"); } }; // Escape during a drag only cancels the drag; // the app listens for Escape, which the page swallows
  addEventListener("keydown", edkeys, true); addEventListener("keydown", esc, true); addEventListener("keydown", keys, true); // edkeys first: Enter and Escape of a text being edited stop there
  addEventListener("dblclick", dbl, true);
  addEventListener("mousemove", move, true); addEventListener("click", click, true); addEventListener("contextmenu", ctx, true);
  document.documentElement.setAttribute("data-studio-inspect", ""); // the preload of the webview leaves Ctrl + click (macOS: a context menu) to the inspector
  addEventListener("pointerdown", pdown, true); addEventListener("pointermove", pmove, true); addEventListener("pointerup", pup, true); // before the swallowing ones below
  addEventListener("scroll", paintSel, true); addEventListener("resize", paintSel);
  for (const t of events) addEventListener(t, swallow, true);
  document.documentElement.style.cursor = "crosshair";
  // buttons, links and inputs set a cursor of their own (the hand): while picking, everything shows the crosshair
  const cursorCss = document.createElement("style"); cursorCss.id = "__studio_inspect_cursor"; cursorCss.textContent = "*, *::before, *::after { cursor: crosshair !important; }";
  document.documentElement.appendChild(cursorCss);
  window.__studioInspect = {
    drop(key) { sel.delete(key); paintSel(); }, clear() { sel.clear(); paintSel(); },
    /* Marks the component with this ordinal as if it was clicked (after it was added, moved or copied). */
    pickItem(ord, prop, index, additive) {
      for (const el of document.querySelectorAll("body *")) {
        const f = compAt(el); if (!f || ordOf(f) !== ord) continue;
        const h = resolve(el); if (h && h.sub && h.sub.prop === prop && h.sub.index === index) { doPick(h, Boolean(additive)); return true; }
      }
      return false;
    },
    pickOrdinal(ord, additive) {
      for (const el of document.querySelectorAll("body *")) { const f = compAt(el); if (f && ordOf(f) === ord) { doPick({ T: outermost(f), sub: null }, Boolean(additive)); return true; } }
      return false;
    },
    /* The frame goes to the component i levels above the last pick (or to the picked item of a list). */
    markLevel(i, item) { const fib = item && lastSub ? lastSub.fiber : levels[i]; if (!fib) return; const T = levels[i] ?? levels[0], sub = item ? lastSub : null; sel.clear(); sel.set(keyOf(T, sub), mark(fib, ordOf(T), sub)); paintSel(); },
    off() {
      removeEventListener("keydown", edkeys, true); removeEventListener("dblclick", dbl, true); cancelEdit(); removeEventListener("keydown", esc, true); removeEventListener("keydown", keys, true); removeEventListener("mousemove", move, true); removeEventListener("click", click, true); removeEventListener("contextmenu", ctx, true); document.documentElement.removeAttribute("data-studio-inspect");
      removeEventListener("scroll", paintSel, true); removeEventListener("resize", paintSel); clearInterval(selTimer);
      for (const t of events) removeEventListener(t, swallow, true);
      removeEventListener("pointerdown", pdown, true); removeEventListener("pointermove", pmove, true); removeEventListener("pointerup", pup, true);
      box.remove(); tip.remove(); dropMark.remove(); for (const m of marks) m.remove(); cursorCss.remove(); document.documentElement.style.cursor = ""; delete window.__studioInspect;
    },
  };
})()`;
const OFF = `window.__studioInspect && window.__studioInspect.off()`;

export function createInspector({ onPick, onEscape, onMove, onDelete, onDuplicate, onText, onItemMove }) {
  let on = false;
  const run = (view, code) => { try { return view.executeJavaScript(code).catch(() => {}); } catch { /* webview not ready */ } };
  return {
    get on() { return on; },
    set(v, views) { on = v; for (const view of views) run(view, v ? INJECT : OFF); },
    injectIfOn: (view) => on && run(view, INJECT),
    /** Marks the component with this ordinal in the page of `view` (the page must have the inspector in it). */
    pickItem: (view, ordinal, prop, index, additive) => run(view, `window.__studioInspect && window.__studioInspect.pickItem(${Number(ordinal)}, ${JSON.stringify(String(prop))}, ${Number(index)}, ${additive ? "true" : "false"})`),
    pickOrdinal: (view, ordinal, additive) => run(view, `window.__studioInspect && window.__studioInspect.pickOrdinal(${Number(ordinal)}, ${additive ? "true" : "false"})`),
    /** Takes the frame of one marked component off the page of `view` / takes all frames off the pages of `views`. */
    drop: (view, key) => run(view, `window.__studioInspect && window.__studioInspect.drop(${JSON.stringify(key)})`),
    markLevel: (view, i, item) => run(view, `window.__studioInspect && window.__studioInspect.markLevel(${Number(i)}, ${item ? "true" : "false"})`),
    clearIn: (views) => { for (const view of views) run(view, "window.__studioInspect && window.__studioInspect.clear()"); },
    /** Call from each webview's console-message event. Returns true when the message was an inspector pick. */
    handleConsole(file, message) {
      if (message === "__studio_esc__") { onEscape?.(); return true; }
      if (message.startsWith(ITEM_MOVE)) { try { onItemMove?.({ file, ...JSON.parse(message.slice(ITEM_MOVE.length)) }); } catch {} return true; }
      if (message.startsWith(TEXT)) { try { onText?.({ file, ...JSON.parse(message.slice(TEXT.length)) }); } catch {} return true; }
      if (message.startsWith(DUPLICATE)) { try { onDuplicate?.({ file, ...JSON.parse(message.slice(DUPLICATE.length)) }); } catch {} return true; }
      if (message.startsWith(DELETE)) { try { onDelete?.({ file, ...JSON.parse(message.slice(DELETE.length)) }); } catch {} return true; }
      if (message.startsWith(MOVE)) { try { onMove?.({ file, ...JSON.parse(message.slice(MOVE.length)) }); } catch {} return true; }
      if (!message.startsWith(PICK)) return false;
      try { onPick({ file, ...JSON.parse(message.slice(PICK.length)) }); } catch {}
      return true;
    },
  };
}

export const MAX_MARKED = 8;
/**
 * The components marked in the inspector. A plain click marks just that one; Shift + click (a component) and Cmd / Ctrl + click (one copy
 * of a component rendered by `.map`, its key ends with `@…`) add one or (when the page
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

/**
 * Which item of the list a copy picked with Cmd / Ctrl + click is rendered for: `{ list, index, label, nth, count }`. `index` is the index
 * in the array of the file (from 0), found by the React key of the copy (`key={contact.name}` is one of the item's values) or by its place
 * when the page renders as many copies as the array has items; null when neither tells it (`list.filter(…).map(…)`). `nth` is the place of
 * the copy among the copies on the page (from 0). Null for a pick that is not one copy.
 */
export function copyItem(p) {
  if (!p?.inst) return null;
  const loop = p.element?.loop ?? null, items = loop?.items ?? null;
  let index = null;
  if (items) {
    const key = p.inst.key;
    const byKey = key == null ? [] : items.filter((it) => (it.values ?? []).includes(key));
    if (byKey.length === 1) index = byKey[0].index;
    else if (p.inst.count === items.length) index = p.inst.index;
  }
  return { list: loop?.list ?? null, index, label: index != null ? items[index].label ?? null : null, nth: p.inst.index, count: p.inst.count };
}
/** `CONTACTS[0] (name: "Jan Novák")` / `copy 2 of 3 from CONTACTS.map` */
function copyText(c) {
  if (c.index != null) return `${c.list}[${c.index}]${c.label ? ` (${c.label})` : ""}`;
  return `copy ${c.nth + 1} of ${c.count}${c.list ? ` from ${c.list}.map` : ""}`;
}

/** Compact one-line description used in the chat chip and the sent message. */
export function describePick(p) {
  const what = p.text ? ` “${p.text}”` : "";
  const chain = (p.chain ?? []).map((c) => c.name).filter(Boolean);
  const c = copyItem(p), copy = c ? ` — only ${copyText(c)}` : p.copies > 1 ? ` (all ${p.copies} copies${p.element?.loop ? ` from ${p.element.loop.list}.map` : ""})` : "";
  if (p.sub) return `${p.element?.name || "item"}${what} — item ${p.sub.index + 1} of ${p.sub.prop} of ${chain[0] ?? "component"}${copy} in ${p.file}`.replace(/\s+/g, " ");
  const nested = chain.length > 1 ? ` (inside ${chain.slice(1, 3).join(" › ")})` : "";
  return `${chain[0] ?? "component"}${what}${copy}${nested} in ${p.file}`.replace(/\s+/g, " ");
}

const LEVEL = `The file is a React/JSX program (a <script type="text/babel"> block) that is interpreted and rendered into HTML by the uu5 loader. ` +
  `Work at the component level: change props, children or the place in the JSX tree, using the uu5/uuGDS component API — do not think in terms of the resulting DOM, CSS selectors or HTML.`;
const fence = (code) => (code ? `\n\`\`\`jsx\n${code}\n\`\`\`` : "");

/** What the agent is told about the copies of an element rendered by `.map`: only one copy was picked, or the element with all its copies. */
function copiesForAgent(p) {
  const c = copyItem(p), loop = p.element?.loop;
  if (c) {
    const which = c.index != null
      ? `the copy rendered for the item \`${c.list}[${c.index}]\` (index ${c.index}, counting from 0${c.label ? `; the item with ${c.label}` : ""})`
      : `copy ${c.nth + 1} of ${c.count} (counting from 1, in the order on the page)${c.list ? ` of \`${c.list}.map(…)\`` : ""}`;
    return ` ONLY ONE COPY: in the file this is a single JSX element ${c.list ? `inside \`${c.list}.map(…)\`` : "that is rendered several times"}, and the user means only ${which}. ` +
      `Change only what is rendered for that item (through the data of that item, or a condition on it); the other copies must stay as they are.`;
  }
  if (p.copies > 1) return ` It is rendered ${p.copies} times${loop ? ` (once per item of \`${loop.list}.map(…)\`)` : ""}; the user marked the element itself, so the change applies to every copy.`;
  return "";
}

/** One selected component (or list item) as a sentence plus its source. */
function describeForAgent(p) {
  const chain = (p.chain ?? []).map((c) => c.name).filter(Boolean);
  if (p.sub) {
    return `item ${p.sub.index + 1} (counting from 1) of the \`${p.sub.prop}\` prop of ${chain[0] ?? "(unknown)"} in ${p.file}` +
      `${p.element?.name && p.element.name !== "item" ? `, which that component renders as ${p.element.name}` : ""}${p.text ? `, rendered text: "${p.text}"` : ""}.${copiesForAgent(p)} ` +
      `The item as written in the file (an object inside the \`${p.sub.prop}\` array):${fence(p.element?.snippet)}`;
  }
  return `the uu5 component ${chain[0] ?? "(unknown)"} in ${p.file}` +
    `${chain.length > 1 ? `, nested in ${chain.slice(1).join(" › ")} (nearest parent first)` : ""}${p.text ? `, rendered text: "${p.text}"` : ""}.${copiesForAgent(p)} ` +
    `Its opening tag in the file:${fence(p.element?.snippet)}`;
}

/** What the agent is told: the selected component(s) at React level, with the exact source from the file. Takes one pick or a list. */
export function agentContext(picks) {
  const list = Array.isArray(picks) ? picks : [picks];
  // the picks are linked in the text of the request as [#1], [#2] where the user refers to them
  if (list.every((p) => p.ref != null)) {
    return `Context: the user marked ${list.length === 1 ? "a component" : `${list.length} components`} in the request. In the text they are written as markers [#n] at the place they refer to ("change this one [#1] and that one [#2]"):\n` +
      list.map((p) => `#${p.ref}) ${describeForAgent(p)}`).join("\n") + `\n${LEVEL}`;
  }
  if (list.length === 1) return `Context: the user selected ${list[0].sub ? "one item of a list prop: " : ""}${describeForAgent(list[0])} ${LEVEL}`;
  return `Context: the user selected ${list.length} components for this request; the request may concern any or all of them:\n` +
    list.map((p, i) => `${i + 1}) ${describeForAgent(p)}`).join("\n") + `\n${LEVEL}`;
}
