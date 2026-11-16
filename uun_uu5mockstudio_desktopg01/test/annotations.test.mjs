import test from "node:test";
import assert from "node:assert/strict";
import { INJECT } from "../src/renderer/inspector.js";
import { annotationKey, annotationsContext, describeAnnotation, historyOf, captureRect, popoverSpot, mapWhere, MAP_WHOLE } from "../src/renderer/annotations.js";

const button = (o = {}) => ({ kind: "screen", file: "a.html", text: "Save", chain: [{ name: "Uu5Elements.Button", ordinal: 4 }, { name: "Uu5Elements.Box", ordinal: 2 }], element: { name: "Uu5Elements.Button", snippet: "<Uu5Elements.Button>" }, ...o });
const page = (o = {}) => ({ kind: "sitemap", scope: "project", id: "n7", title: "Exams", type: "page", file: "exams.html", where: "Portal > Study > Exams", ...o });

test("a pick in the page reports where the component is and the Annotate mode adds without taking off", () => {
  assert.doesNotThrow(() => new Function(`return ${INJECT}`));
  assert.match(INJECT, /rect: \{ x: Math\.round\(r\.left/); assert.match(INJECT, /view: \{ w: innerWidth, h: innerHeight \}/);
  assert.match(INJECT, /if \(pin\) \{ if \(!sel\.has\(key\)\) sel\.set\(key, entry\); \}/);
  assert.match(INJECT, /setAnnotate\(v\)/); assert.match(INJECT, /label\(key, n\)/); assert.match(INJECT, /pin\(ord, prop, index, n\)/);
});

test("annotations have one key per component, item, copy or page", () => {
  assert.equal(annotationKey(button()), "a.html#4,2||");
  assert.equal(annotationKey(button({ sub: { prop: "itemList", index: 1 } })), "a.html#4,2|itemList[1]|");
  assert.equal(annotationKey(page()), "map:project#n7");
  assert.equal(annotationKey(page({ scope: "plan-a" })), "map:plan-a#n7");
  assert.notEqual(annotationKey(page()), annotationKey(page({ id: "n8" })));
});

test("without notes the context is the one of the chat pick; with notes each place carries the note of the user and its screenshot", () => {
  assert.equal(annotationsContext([]), null);
  assert.match(annotationsContext([button({ ref: 1 })]), /written as markers \[#n\]/);
  const ctx = annotationsContext([button({ ref: 1, note: "make it red", shotPath: ".studio/attachments/x.png" }), button({ ref: 2, text: "Cancel", chain: [{ name: "Uu5Elements.Link", ordinal: 9 }] })]);
  assert.match(ctx, /annotated 2 places/);
  assert.match(ctx, /#1\) the uu5 component Uu5Elements.Button in a.html[\s\S]*The user's note on it: "make it red"/);
  assert.match(ctx, /A screenshot of it as it looks now: \.studio\/attachments\/x\.png/);
  assert.match(ctx, /Those without a note are written in the text of the request as markers \[#n\]/);
  assert.match(ctx, /#2\) the uu5 component Uu5Elements.Link/);
  assert.match(ctx, /React\/JSX/);
});

test("a page of a sitemap is named by its place in the map", () => {
  const ctx = annotationsContext([page({ ref: 3, note: "merge with Theses" })]);
  assert.match(ctx, /#3\) the page "Exams" \(type page, screen exams\.html\) at Portal > Study > Exams in the sitemap of the project \(sitemap\.json\)\./);
  assert.match(ctx, /The user's note on it: "merge with Theses"/);
  assert.doesNotMatch(ctx, /React\/JSX/);
  assert.equal(mapWhere("plan-a"), "the sitemap proposed in plans/plan-a.md");
  assert.equal(describeAnnotation(page()), "Exams (Portal > Study > Exams) in the sitemap");
  assert.equal(describeAnnotation(page({ scope: "plan-a" })), "Exams (Portal > Study > Exams) in the map of plan-a");
  assert.equal(describeAnnotation(page({ id: MAP_WHOLE })), "the whole sitemap"); // a note on the map as a whole
  assert.equal(describeAnnotation(page({ id: MAP_WHOLE, scope: "plan-a" })), "the whole map of plan-a");
  assert.notEqual(annotationKey(page({ id: MAP_WHOLE })), annotationKey(page()));
});

test("the chat keeps the annotations without their pictures", () => {
  const h = historyOf([button({ ref: 1, note: "red", shot: { mime: "image/png", data: "AAAA" }, thumb: "data:image/png;base64,BB" }), page({ ref: 2, note: "x" })]);
  assert.deepEqual(h.map((a) => [a.ref, a.kind, a.note, Boolean(a.thumb), "shot" in a]), [[1, "screen", "red", true, false], [2, "sitemap", "x", false, false]]);
  assert.match(h[0].label, /Uu5Elements.Button “Save”/);
});

test("the screenshot of a component has a margin and stays inside the page", () => {
  assert.deepEqual(captureRect({ x: 20, y: 30, w: 100, h: 40 }, { w: 800, h: 600 }), { x: 12, y: 22, width: 116, height: 56 });
  assert.deepEqual(captureRect({ x: 2, y: 590, w: 900, h: 40 }, { w: 800, h: 600 }), { x: 0, y: 582, width: 800, height: 18 });
  assert.equal(captureRect({ x: 900, y: 10, w: 50, h: 50 }, { w: 800, h: 600 }), null); // out of sight
  assert.equal(captureRect(null, { w: 800, h: 600 }), null);
});

test("the popover stands below the place, above it when there is no room, always inside the window", () => {
  const win = { w: 1000, h: 700 }, size = { w: 300, h: 120 };
  assert.deepEqual(popoverSpot({ left: 100, top: 100, bottom: 140 }, size, win), { left: 100, top: 148 });
  assert.deepEqual(popoverSpot({ left: 100, top: 600, bottom: 640 }, size, win), { left: 100, top: 472 });
  assert.deepEqual(popoverSpot({ left: 900, top: 100, bottom: 140 }, size, win), { left: 692, top: 148 });
  assert.equal(popoverSpot({ left: 10, top: 50, bottom: 690 }, size, win).top, 572); // no room above or below: it stays inside
});

test("one place can carry several notes: each is an annotation of its own with its own number", () => {
  const a = button({ ref: 1, note: "make it red" }), b = button({ ref: 2, note: "and bigger" });
  assert.equal(annotationKey(a), annotationKey(b)); // the same component
  const ctx = annotationsContext([a, b]);
  assert.match(ctx, /#1\) the uu5 component Uu5Elements.Button[\s\S]*"make it red"[\s\S]*#2\) the uu5 component Uu5Elements.Button[\s\S]*"and bigger"/);
  assert.match(INJECT, /label\(key, n\) \{ const e = sel\.get\(key\); if \(e\) \{ e\.n = n \? String\(n\) : ""/); // "1,2" on the frame
});
