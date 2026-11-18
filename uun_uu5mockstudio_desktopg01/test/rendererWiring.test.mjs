import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The renderer is not unit-tested, so a deleted `const x = ...` only shows as "x is not defined" at run time. This guards the objects
// that many handlers depend on.
test("renderer.js declares the objects its handlers use", async () => {
  const src = await readFile(new URL("../src/renderer/renderer.js", import.meta.url), "utf8");
  for (const name of ["canvas", "memory", "propsPanel", "iconPicker", "inspector", "dock"]) assert.match(src, new RegExp(`^(const|let) ${name}\\b`, "m"), `${name} is not declared`);
  assert.match(src, /^let repo\b/m);
  for (const fn of ["showRepo", "linkRepoFlow", "pickBranch"]) assert.match(src, new RegExp(`(function ${fn}\\b|const ${fn}\\b)`), `${fn} is missing`);
});

test("a page of the sitemap can be only linked in the message, like a component of a screen", async () => {
  const src = await readFile(new URL("../src/renderer/renderer.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("async function annotatePages("), src.indexOf("function adoptMapComments("));
  assert.match(body, /annotatePopover\.open\(\{ anchor, title, others: list\(\), link: linkable\(\) \}\)/);
  assert.match(body, /r\.link\) \{[^}]*addChip\(\{ kind: "sitemap", scope, \.\.\.pg \}, \{ quiet: true \}\)/);
  assert.match(src, /c\.kind === "sitemap" \? planCards\.revealPage\?\.\(c\.scope, c\.id\) : showChip\(c\)/);
});

test("a link in the sitemap is annotated as its original, and its numbers show at every place", async () => {
  const src = await readFile(new URL("../src/renderer/sitemapView.js", import.meta.url), "utf8");
  assert.match(src, /const pinOf = \(n\) => pins\.get\(n\.ref \?\? n\.id\)/);
  assert.match(src, /resolveNode\(sm, n\), op = n\?\.ref \? pathOfId\(sm, n\.ref\)/);
  assert.match(src, /item\("Also show under…"/); assert.match(src, /linking = ev\.altKey/);
});

test("Go to the original unfolds the branches above the page and scrolls to it", async () => {
  const view = await readFile(new URL("../src/renderer/sitemapView.js", import.meta.url), "utf8"), cards = await readFile(new URL("../src/renderer/planCards.js", import.meta.url), "utf8");
  assert.equal((view.match(/goToOriginal\((n|node)\.ref\)/g) ?? []).length, 2); assert.match(view, /onclick: \(\) => goToOriginal\(getNode\(sm, p\)\.id\)/); assert.match(view, /onclick: \(\) => goToOriginal\(getNode\(sm, p\)\.id\)/);
  assert.match(cards, /onReveal: \(id\) => \{ const p = pathOfId\(sitemap, id\); if \(!p\) return; c\.sel = p; c\.sels = \[p\]; revealPage\(scope, id\); \}/);
});

test("showing a page of the map scrolls only the map, never the boxes above it (the canvas must not show through)", async () => {
  for (const f of ["sitemapView.js", "planCards.js"]) assert.doesNotMatch(await readFile(new URL(`../src/renderer/${f}`, import.meta.url), "utf8"), /scrollIntoView/, f);
  const { centerInMap } = await import("../src/renderer/sitemapView.js");
  const box = { scrollLeft: 100, scrollTop: 50, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }) };
  const node = { closest: (s) => (s === ".sm-scroll" ? box : null), getBoundingClientRect: () => ({ left: 700, top: 900, width: 200, height: 40 }) };
  centerInMap(node);
  assert.deepEqual([box.scrollLeft, box.scrollTop], [100 + 800 - 200, 50 + 920 - 150]);
  assert.doesNotThrow(() => centerInMap(null));
});
