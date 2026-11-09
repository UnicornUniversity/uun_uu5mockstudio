/**
 * Auto arrange of the canvas ("View → Arrange screens"): the screens flow left to right and wrap into rows; a screen with variants is one block,
 * the original on top and its variants in a row below it. Pure: `items` are [{ file, w, h }] in reading order, `groups` come from `groupVariants`.
 * -> Map of file -> { x, y }.
 */
export function flowLayout(items, groups = [], { gap = 120, rowGap = 270, rowExtra = 150, minRow = 4600 } = {}) {
  const byFile = new Map(items.map((i) => [i.file, i])), byBase = new Map(groups.map((g) => [g.base, g]));
  const child = new Set(groups.flatMap((g) => g.members.slice(1).map((m) => m.file).filter((f) => byFile.has(f) && byFile.has(g.base))));
  const blocks = [];
  for (const it of items) {
    if (child.has(it.file)) continue;
    const kids = (byBase.get(it.file)?.members.slice(1) ?? []).map((m) => byFile.get(m.file)).filter(Boolean);
    const kidsW = kids.reduce((s, k) => s + k.w, 0) + gap * Math.max(0, kids.length - 1);
    blocks.push({ it, kids, w: Math.max(it.w, kidsW), h: kids.length ? it.h + rowGap + Math.max(...kids.map((k) => k.h)) : it.h });
  }
  const out = new Map(), maxRow = Math.max(minRow, ...blocks.map((b) => b.w));
  let x = 0, y = 0, rowH = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.w > maxRow) { x = 0; y += rowH + gap + rowExtra; rowH = 0; } // rowExtra: room for the next row's title bar, which grows when zoomed out
    out.set(b.it.file, { x, y });
    let kx = x; for (const k of b.kids) { out.set(k.file, { x: kx, y: y + b.it.h + rowGap }); kx += k.w + gap; }
    x += b.w + gap; rowH = Math.max(rowH, b.h);
  }
  return out;
}
