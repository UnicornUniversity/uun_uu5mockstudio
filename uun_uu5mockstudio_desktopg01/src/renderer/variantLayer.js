/**
 * Variants on the canvas: the screens that are variants of one screen (`room-list`, `room-list-a`, `room-list-b`) share a colour,
 * sit on a tinted board with a header, and the header is where the user chooses: one chip per member (click = select it),
 * and "Use this variant" for the selected one. `groupVariants` is pure; the layer is an HTML layer inside the canvas world.
 */
export const VARIANT_HUES = [265, 28, 160, 330, 200, 48, 0, 100];

/** The groups of the screens: [{ base: "room-list.html", members: [{ file, label }] }], the original first, then a, b, c… Colours are stable by name. */
export function groupVariants(files) {
  const set = new Set(files), groups = new Map();
  for (const f of [...files].sort()) {
    const m = /^(.+)-([a-z])\.html$/.exec(f);
    if (!m || !set.has(`${m[1]}.html`)) continue;
    const base = `${m[1]}.html`;
    if (!groups.has(base)) groups.set(base, { base, members: [{ file: base, label: "Original" }] });
    groups.get(base).members.push({ file: f, label: m[2].toUpperCase() });
  }
  return [...groups.values()].sort((a, b) => (a.base < b.base ? -1 : 1)).map((g, i) => ({ ...g, hue: VARIANT_HUES[i % VARIANT_HUES.length] }));
}

/** The original on top and its variants in a row below it, left-aligned with the original: [[file, x, y], …] for the variants. `boxes`: file -> { x, y, w, h }. */
export function arrangeGroup(group, boxes, gap = 120, rowGap = 270) {
  const o = boxes[group.base]; if (!o) return [];
  let x = o.x; const y = o.y + o.h + rowGap, out = [];
  for (const m of group.members.slice(1)) { const b = boxes[m.file]; if (!b) continue; out.push([m.file, x, y]); x += b.w + gap; }
  return out;
}

export function createVariantLayer({ world, canvas, onKeep }) {
  const layer = Object.assign(document.createElement("div"), { className: "var-layer" });
  world.prepend(layer);
  const stop = (e) => e.stopPropagation(); // a click on the header is not a pan of the canvas

  // the controls of a frame do not shrink with the zoom, so at a small zoom they can reach past the narrow frame: the board has to include them
  const ctlRight = (f) => { const c = f.el.querySelector(".fctl"); return c ? (c.getBoundingClientRect().right - f.el.getBoundingClientRect().left) / canvas.camera().z : 0; };

  /** The original on top, the variants in a row below it (one undo step); used when new variants appear. */
  function arrange(base) {
    const g = groupVariants(canvas.files()).find((x) => x.base === base); if (!g) return;
    const boxes = {};
    for (const m of g.members) { const f = canvas.get(m.file); if (f) boxes[m.file] = { x: f.x, y: f.y, w: f.el.offsetWidth, h: f.el.offsetHeight }; }
    const moves = arrangeGroup(g, boxes);
    if (moves.length) canvas.moveFrames(moves);
  }

  function draw() {
    layer.replaceChildren();
    const groups = groupVariants(canvas.files()), inGroup = new Map(), sel = canvas.selected();
    for (const g of groups) for (const m of g.members) inGroup.set(m.file, { g, m });
    for (const f of canvas.all()) {
      const hit = inGroup.get(f.file), title = f.el.querySelector(".ftitle");
      f.el.classList.toggle("vgrp", Boolean(hit));
      if (hit) f.el.style.setProperty("--vc", `hsl(${hit.g.hue} 78% 62%)`); else f.el.style.removeProperty("--vc");
      let tag = title.querySelector(".fvl");
      if (!hit) { tag?.remove(); continue; }
      if (!tag) { tag = Object.assign(document.createElement("span"), { className: "fvl" }); title.prepend(tag); }
      tag.textContent = hit.m.label;
    }
    const z = canvas.camera().z, iz = 1 / z, pad = 40, head = 34 * iz;
    for (const g of groups) {
      const fr = g.members.map((m) => canvas.get(m.file)).filter(Boolean); if (fr.length < 2) continue;
      const x0 = Math.min(...fr.map((f) => f.x)), y0 = Math.min(...fr.map((f) => f.y));
      const x1 = Math.max(...fr.map((f) => f.x + Math.max(f.el.offsetWidth, ctlRight(f)))), y1 = Math.max(...fr.map((f) => f.y + f.el.offsetHeight));
      const board = Object.assign(document.createElement("div"), { className: "var-board" });
      board.style.cssText = `left:${x0 - pad}px;top:${y0 - head - pad}px;width:${x1 - x0 + 2 * pad}px;height:${y1 - y0 + head + 2 * pad}px;--vc:hsl(${g.hue} 78% 62%);--vi:${iz}`;
      const bar = Object.assign(document.createElement("div"), { className: "var-head" });
      const name = Object.assign(document.createElement("span"), { className: "var-name", textContent: `Variants of ${g.base.replace(/\.html$/, "")}` });
      bar.append(name);
      for (const m of g.members) {
        const on = m.file === sel;
        const b = Object.assign(document.createElement("button"), { type: "button", className: `var-chip${on ? " on" : ""}`, textContent: m.label, title: `Select ${m.file.replace(/\.html$/, "")}` });
        b.setAttribute("aria-pressed", String(on));
        b.onclick = () => canvas.select(m.file);
        bar.append(b);
      }
      const pick = sel && g.members.find((m) => m.file === sel);
      if (pick) {
        const orig = pick.file === g.base, bn = g.base.replace(/\.html$/, "");
        const use = Object.assign(document.createElement("button"), { type: "button", className: "var-use", textContent: orig ? "Keep Original" : `Use ${pick.label}`, title: orig ? `Keep ${bn} and move all its variants to the trash` : `Use ${pick.file.replace(/\.html$/, "")} as ${bn} (the original and the other variants go to the trash)` });
        use.onclick = () => onKeep?.(pick.file);
        bar.append(use);
      }
      bar.addEventListener("pointerdown", stop); bar.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
      board.append(bar); layer.append(board);
    }
  }
  return { draw, arrange };
}
