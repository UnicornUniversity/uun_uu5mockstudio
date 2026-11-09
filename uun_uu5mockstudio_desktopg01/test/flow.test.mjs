import test from "node:test";
import assert from "node:assert/strict";
import { findFlowEdges } from "../src/main/flow.mjs";
import { arrowPath, sidesFor, linksOf } from "../src/renderer/flowLayer.js";
import { buildVariantsPrompt, variantNames, variantInfo, VARIANT_ASPECTS } from "../src/renderer/variants.js";

test("a screen points to another one when its source names that file as a string", () => {
  const edges = findFlowEdges({
    "list.html": `<a href="detail.html">Open</a> <Button onClick={() => { location.href = './form.html#top'; }} />`,
    "detail.html": `navigate("list.html") // and a second time "list.html"`,
    "form.html": `<p>detail.html is only mentioned in text, not as a string</p> <span>list</span>`,
  });
  assert.deepEqual(edges, [{ from: "list.html", to: "detail.html", nav: false }, { from: "list.html", to: "form.html", nav: false }, { from: "detail.html", to: "list.html", nav: false }]);
});

test("self links, other file types and similar names are not edges", () => {
  assert.deepEqual(findFlowEdges({ "a.html": `<a href="a.html">me</a> <img src="a.html.png"> "xa.html"`, "b.html": "" }), []);
  assert.deepEqual(findFlowEdges({}), []);
});

test("links of a menu are marked as nav, a link in the content is not", () => {
  const menu = `<nav><a href="a.html">A</a><a href="b.html">B</a></nav>`;
  const edges = findFlowEdges({ "a.html": menu + " ".repeat(1200) + `<button href="c.html">go</button>`, "b.html": menu, "c.html": `<div><a href="a.html">1</a> <a href="b.html">2</a> <a href="c.html">3</a></div>` });
  assert.deepEqual(edges.filter((e) => e.from === "a.html"), [{ from: "a.html", to: "b.html", nav: true }, { from: "a.html", to: "c.html", nav: false }]);
  assert.deepEqual(edges.filter((e) => e.from === "c.html").map((e) => e.nav), [true, true]); // three screen links close together are a menu
});

test("links one after another with some markup between them are a menu, even at the ends of the run", () => {
  const item = (f) => `<Button\n  label="x"\n  ${" ".repeat(430)}href={BASE + "${f}"} />\n`;
  const edges = findFlowEdges({ "a.html": item("b.html") + item("c.html") + item("d.html") + item("a.html"), "b.html": "", "c.html": "", "d.html": "" });
  assert.deepEqual(edges.map((e) => e.nav), [true, true, true]);
});

test("a link is nav only when all its occurrences are in a menu", () => {
  const edges = findFlowEdges({ "a.html": `<nav><a href="b.html">B</a></nav>` + " ".repeat(1200) + `<a href="b.html">again</a>`, "b.html": "" });
  assert.deepEqual(edges, [{ from: "a.html", to: "b.html", nav: false }]);
});

test("an arrow leaves the side that faces the target and ends at its facing side", () => {
  const a = { x: 0, y: 0, w: 1440, h: 900 }, right = { x: 1600, y: 0, w: 1440, h: 900 }, left = { x: -1800, y: 0, w: 1440, h: 900 }, below = { x: 0, y: 1100, w: 1440, h: 900 };
  assert.deepEqual(sidesFor(a, right), { from: "r", to: "l" });
  assert.deepEqual(sidesFor(a, left), { from: "l", to: "r" });
  assert.deepEqual(sidesFor(a, below), { from: "b", to: "t" });
  assert.deepEqual(sidesFor(below, a), { from: "t", to: "b" });
  assert.match(arrowPath(a, right).d, /^M1440,300 C/); assert.match(arrowPath(a, right).d, /1600,300$/);
  assert.equal(arrowPath(a, right).start.x, 1440);
  assert.match(arrowPath(a, below).d, /^M720,900 C/); assert.match(arrowPath(a, below).d, /720,1100$/);
  assert.notEqual(arrowPath(a, right, { from: 0.25 }).start.y, arrowPath(a, right, { from: 0.75 }).start.y); // arrows on one side get their own spots
});

test("a pair that links both ways is one link, menu links are left out unless asked", () => {
  const edges = [{ from: "a", to: "b", nav: false }, { from: "b", to: "a", nav: false }, { from: "a", to: "c", nav: true }, { from: "c", to: "a", nav: true }];
  assert.deepEqual(linksOf(edges, false), [{ from: "a", to: "b", both: true, nav: false }]);
  assert.deepEqual(linksOf(edges, true).map((l) => `${l.from}${l.to}${l.both}`), ["abtrue", "actrue"]);
  assert.deepEqual(linksOf(edges, false, "c").map((l) => `${l.from}${l.to}`), ["ab", "ac"]); // the menu links of the focused screen are drawn
  assert.deepEqual(linksOf([{ from: "b", to: "a", nav: false }], false), [{ from: "b", to: "a", both: false, nav: false }]);
});

test("the request for variants names the files, the aspect and leaves the original alone", () => {
  const p = buildVariantsPrompt({ file: "room-list.html", count: 3, aspect: "layout" });
  assert.match(p, /Make 3 variants of the screen @room-list/);
  assert.match(p, /room-list-a\.html, room-list-b\.html, room-list-c\.html/);
  assert.match(p, /differ from each other in the layout/);
  assert.match(p, /do not change room-list\.html/);
  assert.match(buildVariantsPrompt({ file: "x.html", aspect: "custom", custom: "one with tabs" }), /in one with tabs\./);
  assert.match(buildVariantsPrompt({ file: "x.html", aspect: "custom", custom: " " }), /the layout/); // an empty answer falls back
  assert.match(buildVariantsPrompt({ file: "x.html", count: 9 }), /Make 4 variants/);
  assert.match(buildVariantsPrompt({ file: "x.html", count: 0 }), /Make 3 variants/);
  assert.deepEqual(variantNames("x.html", 2), ["x-a.html", "x-b.html"]);
  assert.ok(Object.keys(VARIANT_ASPECTS).includes("style"));
});

test("a variant is recognised by its name and the original that exists beside it", () => {
  const files = ["room-list.html", "room-list-a.html", "room-list-b.html", "room-list-c.html", "room.html", "other-a.html"];
  assert.deepEqual(variantInfo("room-list-b.html", files), { base: "room-list.html", others: ["room-list-a.html", "room-list-c.html"] });
  assert.equal(variantInfo("other-a.html", files), null); // there is no other.html
  assert.equal(variantInfo("room-list.html", files), null);
  assert.equal(variantInfo("room-list-ab.html", files), null);
  assert.deepEqual(variantInfo("a.b-a.html", ["a.b.html", "a.b-a.html", "axb-a.html"]), { base: "a.b.html", others: [] }); // a dot in the name is not a pattern
});

import { groupVariants } from "../src/renderer/variantLayer.js";
test("variants of one screen form a group with the original first; a lone -a without an original is no group", () => {
  const g = groupVariants(["room-list-b.html", "room-list.html", "room-list-a.html", "other.html", "x-a.html"]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].members.map((m) => [m.file, m.label]), [["room-list.html", "Original"], ["room-list-a.html", "A"], ["room-list-b.html", "B"]]);
  assert.equal(typeof g[0].hue, "number");
});

import { arrangeGroup } from "../src/renderer/variantLayer.js";
test("arrangeGroup: the original stays, the variants go in a row below it, left-aligned with it", () => {
  const g = groupVariants(["r.html", "r-a.html", "r-b.html"])[0];
  const boxes = { "r.html": { x: 100, y: 50, w: 1440, h: 900 }, "r-a.html": { x: 9, y: 9, w: 1440, h: 900 }, "r-b.html": { x: 8, y: 8, w: 768, h: 1024 } };
  assert.deepEqual(arrangeGroup(g, boxes), [["r-a.html", 100, 1220], ["r-b.html", 1660, 1220]]);
  assert.deepEqual(arrangeGroup(g, { "r-a.html": boxes["r-a.html"] }), []);
});

import { flowLayout } from "../src/renderer/arrange.js";
test("flowLayout: a screen with variants is a block (original on top, variants in a row below), the other screens flow next to it", () => {
  const items = [{ file: "r.html", w: 1000, h: 800 }, { file: "r-a.html", w: 1000, h: 800 }, { file: "r-b.html", w: 500, h: 900 }, { file: "z.html", w: 400, h: 300 }];
  const pos = flowLayout(items, groupVariants(items.map((i) => i.file)), { gap: 100, rowGap: 200, rowExtra: 0, minRow: 4600 });
  assert.deepEqual(pos.get("r.html"), { x: 0, y: 0 });
  assert.deepEqual(pos.get("r-a.html"), { x: 0, y: 1000 });
  assert.deepEqual(pos.get("r-b.html"), { x: 1100, y: 1000 });
  assert.deepEqual(pos.get("z.html"), { x: 1700, y: 0 }); // after the block (1600 wide) and a gap
  // without groups everything is one row
  assert.deepEqual([...flowLayout(items, [], { gap: 100 }).values()].map((p) => p.y), [0, 0, 0, 0]);
});
