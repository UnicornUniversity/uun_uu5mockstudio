import test from "node:test";
import assert from "node:assert/strict";
import { zoneOf, DROP_INJECT } from "../src/renderer/dropTarget.js";
import { INJECT, FIBER } from "../src/renderer/inspector.js";
import { createCatalogDrag } from "../src/renderer/catalogDrag.js";

test("the script injected into the page for dropping is valid JavaScript and shares the fiber helpers with the inspector", () => {
  assert.doesNotThrow(() => new Function(`return ${DROP_INJECT}`));
  assert.ok(DROP_INJECT.includes(FIBER) && INJECT.includes(FIBER));
  assert.match(DROP_INJECT, /\(\?:Uu5\|Plus4U5\)\[A-Za-z0-9\]\*\\\.\[A-Z\]/); // regex backslashes survived the template literal
  assert.match(DROP_INJECT, /const zoneOf = (function|\()/); // the pure function is embedded as it is tested
});

test("zoneOf: edge bands before / after for a container, the rest inside; halves for a component without children", () => {
  const r = { left: 100, top: 200, width: 300, height: 120 };
  assert.equal(zoneOf(r, { x: 150, y: 205 }, "column", true), "before");
  assert.equal(zoneOf(r, { x: 150, y: 260 }, "column", true), "inside");
  assert.equal(zoneOf(r, { x: 150, y: 315 }, "column", true), "after");
  assert.equal(zoneOf(r, { x: 105, y: 260 }, "row", true), "before");
  assert.equal(zoneOf(r, { x: 395, y: 260 }, "row", true), "after");
  assert.equal(zoneOf(r, { x: 250, y: 260 }, "row", true), "inside");
  assert.equal(zoneOf(r, { x: 150, y: 230 }, "column", false), "before");
  assert.equal(zoneOf(r, { x: 150, y: 300 }, "column", false), "after");
  assert.equal(zoneOf(r, { x: 120, y: 260 }, "row", false), "before");
  // a small container keeps a usable inside: the band is at most a quarter of its size
  const small = { left: 0, top: 0, width: 100, height: 40 };
  assert.equal(zoneOf(small, { x: 50, y: 20 }, "column", true), "inside");
  assert.equal(zoneOf(small, { x: 50, y: 4 }, "column", true), "before");
});

test("the catalogue drag is created without a DOM (the module only touches the DOM when a drag starts)", () => {
  const d = createCatalogDrag({ canvas: { all: () => [] }, onDrop() {} });
  assert.equal(d.dragging, false); assert.equal(typeof d.start, "function");
});

import { createInspector } from "../src/renderer/inspector.js";
test("a move reported by the page reaches onMove with the file; picks and moves are told apart", () => {
  const moves = [], picks = [];
  const ins = createInspector({ onPick: (p) => picks.push(p), onEscape() {}, onMove: (m) => moves.push(m) });
  assert.equal(ins.handleConsole("a.html", '__studio_move__{"ordinal":3,"name":"Uu5Elements.Text","target":1,"targetName":null,"position":"before"}'), true);
  assert.deepEqual(moves, [{ file: "a.html", ordinal: 3, name: "Uu5Elements.Text", target: 1, targetName: null, position: "before" }]);
  assert.equal(ins.handleConsole("a.html", "__studio_move__{broken"), true); // a damaged message is swallowed, not thrown
  assert.equal(ins.handleConsole("a.html", "hello"), false);
  assert.equal(picks.length, 0); assert.equal(moves.length, 1);
});

test("a delete reported by the page reaches onDelete with the file and the marked components", () => {
  const dels = [], ins = createInspector({ onPick() {}, onEscape() {}, onDelete: (d) => dels.push(d) });
  assert.equal(ins.handleConsole("a.html", '__studio_delete__{"items":[{"ordinal":2,"name":"Uu5Elements.Text"},{"ordinal":5,"name":null}]}'), true);
  assert.deepEqual(dels, [{ file: "a.html", items: [{ ordinal: 2, name: "Uu5Elements.Text" }, { ordinal: 5, name: null }] }]);
  assert.equal(ins.handleConsole("a.html", "__studio_delete__{bad"), true);
});

test("a duplicate reported by the page reaches onDuplicate; pickOrdinal is a call into the page", async () => {
  const got = [], ins = createInspector({ onPick() {}, onEscape() {}, onDuplicate: (d) => got.push(d) }), ran = [];
  assert.equal(ins.handleConsole("a.html", '__studio_duplicate__{"items":[{"ordinal":4,"name":null}]}'), true);
  assert.deepEqual(got, [{ file: "a.html", items: [{ ordinal: 4, name: null }] }]);
  await ins.pickOrdinal({ executeJavaScript: (c) => { ran.push(c); return Promise.resolve(); } }, 7, true);
  assert.match(ran[0], /__studioInspect\.pickOrdinal\(7, true\)/);
});

test("a text change reported by the page reaches onText", () => {
  const got = [], ins = createInspector({ onPick() {}, onEscape() {}, onText: (d) => got.push(d) });
  assert.equal(ins.handleConsole("a.html", '__studio_text__{"ordinal":3,"old":"Hello","value":"Hi"}'), true);
  assert.deepEqual(got, [{ file: "a.html", ordinal: 3, old: "Hello", value: "Hi" }]);
  assert.equal(ins.handleConsole("a.html", "__studio_text__{bad"), true);
});

test("an item moved by dragging in the page reaches onItemMove; pickItem is a call into the page", async () => {
  const got = [], ran = [], ins = createInspector({ onPick() {}, onEscape() {}, onItemMove: (d) => got.push(d) });
  assert.equal(ins.handleConsole("a.html", '__studio_itemmove__{"ordinal":4,"prop":"itemList","from":0,"to":2}'), true);
  assert.deepEqual(got, [{ file: "a.html", ordinal: 4, prop: "itemList", from: 0, to: 2 }]);
  await ins.pickItem({ executeJavaScript: (c) => { ran.push(c); return Promise.resolve(); } }, 4, "itemList", 2, true);
  assert.match(ran[0], /__studioInspect\.pickItem\(4, "itemList", 2, true\)/);
});
