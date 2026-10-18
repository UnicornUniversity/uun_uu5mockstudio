import test from "node:test";
import assert from "node:assert/strict";
import { INJECT, describePick, agentContext, updateSelection } from "../src/renderer/inspector.js";

test("the script injected into the mockup page is valid JavaScript (it lives in a template literal, so escapes are easy to break)", () => {
  assert.doesNotThrow(() => new Function(`return ${INJECT}`));
  assert.match(INJECT, /\(\?:Uu5\|Plus4U5\)\[A-Za-z0-9\]\*\\\.\[A-Z\]/); // regex backslashes survived
});

test("describePick and agentContext name the component, its parents and the source", () => {
  const p = { file: "a.html", text: "Go", chain: [{ name: "Uu5Elements.Button" }, { name: "Uu5Elements.Box" }], element: { name: "Uu5Elements.Button", snippet: '<Uu5Elements.Button colorScheme="blue">' } };
  assert.match(describePick(p), /Uu5Elements.Button “Go” \(inside Uu5Elements.Box\) in a.html/);
  const ctx = agentContext(p);
  assert.match(ctx, /uu5 component Uu5Elements.Button in a.html, nested in Uu5Elements.Box/);
  assert.match(ctx, /React\/JSX/); assert.match(ctx, /colorScheme="blue"/);
});

test("an item of a list prop is described as such", () => {
  const p = { file: "a.html", text: "Next", chain: [{ name: "Uu5Elements.ActionGroup" }], sub: { prop: "itemList", index: 2, count: 3, name: "Uu5Elements.Button" }, element: { name: "Uu5Elements.Button", snippet: '{ icon: "x" }' } };
  assert.match(describePick(p), /Uu5Elements.Button “Next” — item 3 of itemList of Uu5Elements.ActionGroup in a.html/);
  const ctx = agentContext(p);
  assert.match(ctx, /item 3 \(counting from 1\) of the `itemList` prop of Uu5Elements.ActionGroup/);
  assert.match(ctx, /renders as Uu5Elements.Button/); assert.match(ctx, /\{ icon: "x" \}/);
});

import { toLiteral } from "../src/renderer/propsPanel.js";
test("toLiteral writes data the way people write it by hand", () => {
  assert.equal(toLiteral({ flex: 2, justifyContent: "center" }), '{ flex: 2, justifyContent: "center" }');
  assert.equal(toLiteral([1, "a", null, true]), '[1, "a", null, true]');
  assert.equal(toLiteral({ "b-c": 1 }), '{ "b-c": 1 }');
  assert.equal(toLiteral({}), "{}"); assert.equal(toLiteral([]), "[]");
  const long = toLiteral({ items: [{ name: "a long name number one", n: 1 }, { name: "a long name number two", n: 2 }] });
  assert.equal(long, '{\n  items: [\n    { name: "a long name number one", n: 1 },\n    { name: "a long name number two", n: 2 },\n  ],\n}');
});

import { suggest, matches, fontOf } from "../src/renderer/iconPicker.js";
test("icon picker helpers: font family per set, search over name/keywords, suggestions from the action table", () => {
  assert.equal(fontOf("uugds-plus"), "uu_gds_svgg01-icons");
  assert.equal(fontOf("uugdsstencil-user-account-edit"), "uu_gds_svgg01-user");
  const icon = { name: "Plus circle", code: "uugds-plus-circle", keywords: ["add", "create"], category: "uiaction" };
  assert.ok(matches(icon, "add circle")); assert.ok(matches(icon, "UIACTION")); assert.ok(!matches(icon, "delete"));
  assert.deepEqual(suggest("Create new room", { create: "uugds-plus-circle", add: "uugds-plus-circle", delete: "uugds-delete" }), ["uugds-plus-circle"]);
  assert.deepEqual(suggest("", { create: "x" }), []);
});

test("several selected components are described together, each with its own source", () => {
  const a = { file: "a.html", text: "Go", chain: [{ name: "Uu5Elements.Button" }], element: { snippet: "<Uu5Elements.Button />" } };
  const b = { file: "a.html", text: "Next", chain: [{ name: "Uu5Elements.ActionGroup" }], sub: { prop: "itemList", index: 0 }, element: { name: "Uu5Elements.Button", snippet: '{ icon: "x" }' } };
  const ctx = agentContext([a, b]);
  assert.match(ctx, /selected 2 components/); assert.match(ctx, /\n1\) the uu5 component Uu5Elements.Button in a.html/); assert.match(ctx, /\n2\) item 1 \(counting from 1\) of the `itemList` prop of Uu5Elements.ActionGroup/);
  assert.match(ctx, /<Uu5Elements.Button \/>/); assert.match(ctx, /\{ icon: "x" \}/);
  assert.equal([...ctx.matchAll(/React\/JSX/g)].length, 1); // the how-to is stated once
  assert.equal(agentContext([a]), agentContext(a));
});

test("updateSelection: a plain click marks one, Shift/Cmd/Ctrl-click adds and removes, the number is limited", () => {
  const pick = (key, o = {}) => ({ file: "a.html", key, additive: false, selected: true, ...o });
  let r = updateSelection([], pick("1|"));
  assert.deepEqual(r.selection.map((x) => x.key), ["1|"]); assert.equal(r.active.key, "1|");
  r = updateSelection(r.selection, pick("2|", { additive: true })); r = updateSelection(r.selection, pick("3|", { additive: true }));
  assert.deepEqual(r.selection.map((x) => x.key), ["1|", "2|", "3|"]); assert.equal(r.active.key, "3|");
  r = updateSelection(r.selection, pick("2|", { additive: true, selected: false })); // marked before: the page says it was taken off
  assert.deepEqual(r.selection.map((x) => x.key), ["1|", "3|"]); assert.equal(r.active.key, "3|");
  r = updateSelection(r.selection, pick("1|", { additive: true, selected: false })); r = updateSelection(r.selection, pick("3|", { additive: true, selected: false }));
  assert.deepEqual(r.selection, []); assert.equal(r.active, null);
  r = updateSelection([pick("1|"), pick("2|", { file: "b.html" })], pick("9|", { file: "c.html" })); // a plain click on another screen
  assert.deepEqual(r.selection.map((x) => x.key), ["9|"]); assert.deepEqual(r.clearFiles.sort(), ["a.html", "b.html"]);
  const full = Array.from({ length: 8 }, (_, i) => pick(`${i}|`));
  r = updateSelection(full, pick("x|", { additive: true }), 8);
  assert.equal(r.selection.length, 8); assert.equal(r.refused.key, "x|");
  assert.equal(updateSelection(full, pick("3|", { additive: true })).selection.length, 8, "an already marked one is not added twice");
});

test("picks that are linked in the text are numbered by their markers", () => {
  const mk = (ref, name) => ({ ref, file: "a.html", text: name, chain: [{ name: `Uu5Elements.${name}` }], element: { name: `Uu5Elements.${name}`, snippet: `<${name} />` } });
  const one = agentContext([mk(1, "Box")]);
  assert.match(one, /marked a component .*\[#n …\]/); assert.match(one, /#1\) the uu5 component Uu5Elements.Box/);
  const two = agentContext([mk(1, "Box"), mk(3, "Button")]);
  assert.match(two, /marked 2 components/); assert.match(two, /#1\) .*Uu5Elements.Box[\s\S]*#3\) .*Uu5Elements.Button/);
  assert.match(agentContext([{ ...mk(0, "Box"), ref: undefined }]), /^Context: the user selected the uu5 component/, "without markers the old wording stays");
});
