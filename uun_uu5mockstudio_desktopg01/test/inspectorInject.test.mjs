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
  assert.match(one, /marked a component .*\[#n\]/); assert.match(one, /#1\) the uu5 component Uu5Elements.Box/);
  const two = agentContext([mk(1, "Box"), mk(3, "Button")]);
  assert.match(two, /marked 2 components/); assert.match(two, /#1\) .*Uu5Elements.Box[\s\S]*#3\) .*Uu5Elements.Button/);
  assert.match(agentContext([{ ...mk(0, "Box"), ref: undefined }]), /^Context: the user selected the uu5 component/, "without markers the old wording stays");
});

test("one copy of an element rendered by .map (Cmd / Ctrl + click) is named by its item, and the agent is told to change only that item", async () => {
  const { copyItem } = await import("../src/renderer/inspector.js");
  const loop = { list: "CONTACTS", count: 3, items: [
    { index: 0, label: 'name: "Jan Novák"', values: ["Jan Novák", "JN"] }, { index: 1, label: 'name: "Eva Svobodová"', values: ["Eva Svobodová"] }, { index: 2, label: 'name: "Studijní oddělení"', values: ["Studijní oddělení"] }] };
  const base = { file: "p.html", chain: [{ name: "Uu5Elements.Box" }, { name: "Uu5Elements.Grid" }], element: { name: "Uu5Elements.Box", snippet: "<Uu5Elements.Box key={contact.name}>", loop }, copies: 3 };
  const first = { ...base, ref: 1, inst: { index: 0, count: 3, key: "Jan Novák", nth: 0, path: [0] } };
  const third = { ...base, ref: 2, inst: { index: 2, count: 3, key: "Studijní oddělení", nth: 2, path: [2] } };
  assert.deepEqual(copyItem(first), { list: "CONTACTS", index: 0, label: 'name: "Jan Novák"', nth: 0, count: 3 });
  assert.match(describePick(first), /Uu5Elements.Box — only CONTACTS\[0\] \(name: "Jan Novák"\) \(inside Uu5Elements.Grid\) in p.html/);
  assert.match(describePick(third), /only CONTACTS\[2\] \(name: "Studijní oddělení"\)/);
  const ctx = agentContext([first, third]);
  assert.match(ctx, /#1\) .*ONLY ONE COPY.*`CONTACTS\.map\(…\)`.*`CONTACTS\[0\]` \(index 0, counting from 0; the item with name: "Jan Novák"\)/);
  assert.match(ctx, /#2\) .*`CONTACTS\[2\]` \(index 2.*Studijní oddělení/);
  assert.match(ctx, /the other copies must stay as they are/);
  // the key is not one of the values (key={i}): the place counts when the page renders every item
  assert.equal(copyItem({ ...base, inst: { index: 1, count: 3, key: "1", nth: 1 } }).index, 1);
  // a filtered list: neither the key nor the count tells the item, the copy is named by its place on the page
  const f = { ...base, element: { ...base.element, loop: { list: "ROWS.filter(Boolean)", count: null, items: null } }, inst: { index: 1, count: 2, key: null, nth: 1 } };
  assert.equal(copyItem(f).index, null);
  assert.match(describePick(f), /only copy 2 of 2 from ROWS\.filter\(Boolean\)\.map/);
  assert.match(agentContext(f), /copy 2 of 2 \(counting from 1, in the order on the page\)/);
  // the element itself (plain / Shift + click) with copies: every copy changes
  assert.match(describePick({ ...base }), /Uu5Elements.Box \(all 3 copies from CONTACTS.map\)/);
  assert.match(agentContext({ ...base }), /rendered 3 times \(once per item of `CONTACTS\.map\(…\)`\); the user marked the element itself/);
  assert.equal(copyItem(base), null);
});

test("Cmd / Ctrl + click picks one copy in the page script; on macOS Ctrl + click comes as a context menu", () => {
  assert.match(INJECT, /e\.metaKey \|\| e\.ctrlKey \? "copy" : e\.shiftKey \? "add" : "one"/);
  assert.match(INJECT, /addEventListener\("contextmenu", ctx, true\)/);
  assert.match(INJECT, /data-studio-inspect/);
});

test("updateSelection keeps two copies of one element apart (their keys differ by the copy)", () => {
  const pick = (key) => ({ file: "a.html", key, additive: true, selected: true });
  let r = updateSelection([], pick("4|@k:Jan Novák"));
  r = updateSelection(r.selection, pick("4|@k:Studijní oddělení"));
  assert.deepEqual(r.selection.map((x) => x.key), ["4|@k:Jan Novák", "4|@k:Studijní oddělení"]);
});
