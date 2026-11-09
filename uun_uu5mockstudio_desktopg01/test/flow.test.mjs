import test from "node:test";
import assert from "node:assert/strict";
import { findFlowEdges } from "../src/main/flow.mjs";
import { arrowPath } from "../src/renderer/flowLayer.js";
import { buildVariantsPrompt, variantNames, variantInfo, VARIANT_ASPECTS } from "../src/renderer/variants.js";

test("a screen points to another one when its source names that file as a string", () => {
  const edges = findFlowEdges({
    "list.html": `<a href="detail.html">Open</a> <Button onClick={() => { location.href = './form.html#top'; }} />`,
    "detail.html": `navigate("list.html") // and a second time "list.html"`,
    "form.html": `<p>detail.html is only mentioned in text, not as a string</p> <span>list</span>`,
  });
  assert.deepEqual(edges, [{ from: "list.html", to: "detail.html" }, { from: "list.html", to: "form.html" }, { from: "detail.html", to: "list.html" }]);
});

test("self links, other file types and similar names are not edges", () => {
  assert.deepEqual(findFlowEdges({ "a.html": `<a href="a.html">me</a> <img src="a.html.png"> "xa.html"`, "b.html": "" }), []);
  assert.deepEqual(findFlowEdges({}), []);
});

test("an arrow leaves the side that faces the target and ends at its facing side", () => {
  const a = { x: 0, y: 0, w: 1440, h: 900 }, right = { x: 1600, y: 0, w: 1440, h: 900 }, left = { x: -1800, y: 0, w: 1440, h: 900 };
  assert.match(arrowPath(a, right).d, /^M1440,260 C/); assert.match(arrowPath(a, right).d, /1600,260$/);
  assert.match(arrowPath(a, left).d, /^M0,260 C/); assert.match(arrowPath(a, left).d, /-360,260$/);
  assert.equal(arrowPath(a, right).start.x, 1440);
  assert.match(arrowPath(a, right, 20).d, /^M1440,280 C/); // two arrows between the same screens are kept apart
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
