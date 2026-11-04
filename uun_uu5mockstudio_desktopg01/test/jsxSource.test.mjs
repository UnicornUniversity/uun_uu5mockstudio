import test from "node:test";
import assert from "node:assert/strict";
import { parseElements, tagHtml, describeElement, elementNames, setProp, removeProp, SRC_ATTR } from "../src/main/jsxSource.mjs";

const page = (body) => `<!doctype html><html><head><script>var uu5DemoDependencies = {};</script></head><body><div id="uu5"></div>
<script type="text/babel">
  import { Utils, useState } from "uu5g05";
  import Uu5Elements from "uu5g05-elements";
  import Other from "left-pad";
  function Row({ label }) { return <Uu5Elements.Text significance="subdued">{label}</Uu5Elements.Text>; }
  function Page() {
    const [n, setN] = useState(1);
    return (
      <div className="x">
        ${body}
      </div>
    );
  }
  Utils.Dom.render(<Page />, document.getElementById("uu5"));
</script></body></html>`;

const BODY = `<Uu5Elements.Block header="Title" colorScheme="blue">
          <Uu5Elements.Button
            colorScheme="green"
            significance="highlighted"
            disabled
            onClick={() => setN(n + 1)}
            size={4}
            width={n > 1 ? 10 : 20}
          >Go</Uu5Elements.Button>
          <Other.Thing a="1" />
          <Row label="x" />
        </Uu5Elements.Block>`;

test("parseElements numbers every JSX element and flags uu5 components only", () => {
  const els = parseElements(page(BODY));
  const names = els.map((e) => [e.name, e.uu5]);
  assert.deepEqual(names, [
    ["Uu5Elements.Text", true], ["div", false], ["Uu5Elements.Block", true], ["Uu5Elements.Button", true], ["Other.Thing", false], ["Row", false], ["Page", false],
  ]);
  assert.deepEqual(els.map((e) => e.ordinal), [0, 1, 2, 3, 4, 5, 6]);
});

test("attributes are read with their kind and value", () => {
  const d = describeElement(page(BODY), 3);
  assert.equal(d.name, "Uu5Elements.Button");
  const by = Object.fromEntries(d.attrs.map((a) => [a.name, a]));
  assert.deepEqual([by.colorScheme.type, by.colorScheme.value], ["string", "green"]);
  assert.deepEqual([by.disabled.type, by.disabled.value, by.disabled.bare], ["boolean", true, true]);
  assert.deepEqual([by.size.type, by.size.value], ["number", 4]);
  assert.equal(by.onClick.type, "code"); assert.equal(by.onClick.value, "() => setN(n + 1)");
  assert.equal(by.width.type, "code");
});

test("tagHtml adds the ordinal prop to uu5 components and plain HTML elements, not to other components, and keeps the rest of the page", () => {
  const src = page(BODY), tagged = tagHtml(src);
  assert.equal([...tagged.matchAll(new RegExp(SRC_ATTR, "g"))].length, 4);
  assert.match(tagged, new RegExp(`<Uu5Elements.Block ${SRC_ATTR}="2" header`));
  assert.match(tagged, new RegExp(`<Uu5Elements.Button ${SRC_ATTR}="3"\\n`));
  assert.match(tagged, new RegExp(`<div ${SRC_ATTR}="1" className="x"`));
  assert.ok(!/<(Other\.Thing|Row|Page)[^>]*data-uu5-src/.test(tagged));
  assert.equal(tagged.replace(new RegExp(` ${SRC_ATTR}="\\d+"`, "g"), ""), src);
});

test("tagHtml leaves pages without babel scripts or with syntax errors untouched", () => {
  assert.equal(tagHtml("<p>hi</p>"), "<p>hi</p>");
  const broken = `<script type="text/babel">const a = <Uu5Elements.X ;</script>`;
  assert.equal(tagHtml(broken), broken);
});

test("setProp replaces a string, number, boolean and code prop in place", () => {
  const src = page(BODY);
  let out = setProp(src, 3, "colorScheme", { type: "string", value: "red" });
  assert.match(out, /colorScheme="red"/); assert.ok(!/colorScheme="green"/.test(out));
  out = setProp(out, 3, "size", { type: "number", value: 8 }); assert.match(out, /size=\{8\}/);
  out = setProp(out, 3, "disabled", { type: "boolean", value: false }); assert.match(out, /disabled=\{false\}/);
  out = setProp(out, 3, "onClick", { type: "code", value: "() => alert(1)" }); assert.match(out, /onClick=\{\(\) => alert\(1\)\}/);
  // untouched parts stay byte for byte
  assert.ok(out.includes('<Uu5Elements.Block header="Title" colorScheme="blue">'));
  assert.equal(describeElement(out, 3).attrs.find((a) => a.name === "colorScheme").value, "red");
});

test("setProp adds a missing prop right after the component name", () => {
  const out = setProp(page(BODY), 2, "borderRadius", { type: "string", value: "elementary" });
  assert.match(out, /<Uu5Elements.Block borderRadius="elementary" header="Title"/);
});

test("setProp adds a prop on its own line when the tag is written one attribute per line", () => {
  const out = setProp(page(BODY), 3, "borderRadius", { type: "string", value: "full" });
  assert.match(out, /<Uu5Elements.Button\n {12}borderRadius="full"\n {12}colorScheme="green"/);
});

test("setProp quotes strings that cannot sit in a plain attribute", () => {
  const out = setProp(page(BODY), 2, "header", { type: "string", value: 'Say "hi" & {go}' });
  assert.match(out, /header=\{"Say \\"hi\\" & \{go\}"\}/);
  assert.equal(describeElement(out, 2).attrs.find((a) => a.name === "header").value, 'Say "hi" & {go}');
});

test("setProp rejects invalid expressions and bad names without touching the file", () => {
  const src = page(BODY);
  assert.throws(() => setProp(src, 3, "onClick", { type: "code", value: "() =>" }), /Invalid expression/);
  assert.throws(() => setProp(src, 3, "bad name", { type: "string", value: "x" }), /Invalid prop name/);
  assert.throws(() => setProp(src, 99, "a", { type: "string", value: "x" }), /no longer exists/);
  assert.throws(() => setProp(src, 3, "size", { type: "number", value: "abc" }), /Not a number/);
});

test("removeProp removes the attribute and its leading whitespace", () => {
  const out = removeProp(page(BODY), 3, "significance");
  assert.ok(!out.includes("significance=\"highlighted\""));
  assert.match(out, /colorScheme="green"\n\s+disabled/);
  assert.equal(removeProp(out, 3, "significance"), out); // already gone
});

test("elementNames resolves ordinals to component names", () => {
  assert.deepEqual(elementNames(page(BODY), [2, 3, 42]), [{ ordinal: 2, name: "Uu5Elements.Block" }, { ordinal: 3, name: "Uu5Elements.Button" }, { ordinal: 42, name: null }]);
});

const GROUP = `<Uu5Elements.ActionGroup
          itemList={[
            { icon: "uugds-edit", children: "Edit", onClick: () => setN(1), colorScheme: "blue" },
            {
              children: "Delete",
              significance: "distinct",
              onClick,
            },
            cond && { children: "Maybe" },
          ]}
          data={{ a: 1, "b-c": [1, 2, { d: "x" }], e: null }}
          other={makeItems()}
        />`;
import { describeItem, setItemProp, removeItemProp } from "../src/main/jsxSource.mjs";

test("attributes holding plain data expose a JSON view; computed ones do not", () => {
  const d = describeElement(page(GROUP), 2);
  const by = Object.fromEntries(d.attrs.map((a) => [a.name, a]));
  assert.deepEqual(JSON.parse(by.data.json), { a: 1, "b-c": [1, 2, { d: "x" }], e: null });
  assert.equal(by.itemList.json, undefined); // contains functions
  assert.equal(by.other.json, undefined);
});

test("multi-line values are re-indented like their line", () => {
  const out = setProp(page(GROUP), 2, "data", { type: "code", value: JSON.stringify({ a: 2, b: [1] }, null, 2) });
  assert.match(out, /data=\{\{\n {12}"a": 2,\n {12}"b": \[\n {14}1\n {12}\]\n {10}\}\}/);
});

test("describeItem reads the properties of an object item inside a list prop", () => {
  const d = describeItem(page(GROUP), 2, "itemList", 0);
  assert.deepEqual(d.attrs.map((a) => [a.name, a.type, a.value]), [["icon", "string", "uugds-edit"], ["children", "string", "Edit"], ["onClick", "code", "() => setN(1)"], ["colorScheme", "string", "blue"]]);
  assert.deepEqual(describeItem(page(GROUP), 2, "itemList", 1).attrs.map((a) => a.name), ["children", "significance", "onClick"]);
  assert.equal(describeItem(page(GROUP), 2, "itemList", 1).attrs.find((a) => a.name === "onClick").code, "onClick"); // shorthand
});

test("items that cannot be edited in place report why", () => {
  assert.throws(() => describeItem(page(GROUP), 2, "other", 0), /built dynamically/);
  assert.throws(() => describeItem(page(GROUP), 2, "itemList", 2), /not an object/);
  assert.throws(() => describeItem(page(GROUP), 2, "itemList", 0, 5), /3 items but 5 are rendered/);
});

test("setItemProp replaces and adds properties of one item only", () => {
  let out = setItemProp(page(GROUP), 2, "itemList", 0, "colorScheme", { type: "string", value: "red" });
  assert.match(out, /colorScheme: "red" \}/);
  out = setItemProp(out, 2, "itemList", 0, "size", { type: "string", value: "l" });
  assert.match(out, /\{ size: "l", icon: "uugds-edit"/);
  out = setItemProp(out, 2, "itemList", 1, "disabled", { type: "boolean", value: true });
  assert.match(out, /\{\n {14}disabled: true,\n {14}children: "Delete"/);
  assert.equal(describeItem(out, 2, "itemList", 0).attrs.find((a) => a.name === "size").value, "l");
  assert.ok(out.includes('{ children: "Maybe" }'));
  assert.throws(() => setItemProp(out, 2, "itemList", 0, "onClick", { type: "code", value: "() =>" }), /Invalid expression/);
});

test("removeItemProp removes a property with its comma", () => {
  let out = removeItemProp(page(GROUP), 2, "itemList", 1, "significance");
  assert.ok(!out.includes("distinct"));
  assert.match(out, /children: "Delete",\n {14}onClick,/);
  out = removeItemProp(out, 2, "itemList", 0, "icon");
  assert.match(out, /\{ children: "Edit", onClick/);
});

const REFPAGE = `<script type="text/babel">
  import Uu5Elements from "uu5g05-elements";
  const ROUTE_ACTION = [
    { icon: "uugds-edit", children: "Edit", onClick: () => go("edit") },
    { icon: "uugds-delete", children: "Delete" },
  ];
  const STYLE = { flex: 1, textAlign: "left" };
  export const COUNT = 3;
  function Page() {
    const local = [{ a: 1 }];
    return (
      <div>
        <Uu5Elements.ActionGroup itemList={ROUTE_ACTION} />
        <Uu5Elements.Box style={STYLE} other={local} count={COUNT} />
      </div>
    );
  }
</script>`;

test("a prop that refers to a top-level constant carries the constant's value", () => {
  const els = parseElements(REFPAGE), ag = describeElement(REFPAGE, els.findIndex((e) => e.name === "Uu5Elements.ActionGroup"));
  const itemList = ag.attrs.find((a) => a.name === "itemList");
  assert.equal(itemList.ref.name, "ROUTE_ACTION"); assert.match(itemList.ref.code, /^\[\s*\{ icon: "uugds-edit"/); assert.equal(itemList.ref.json, undefined);
  const box = describeElement(REFPAGE, els.findIndex((e) => e.name === "Uu5Elements.Box")), by = Object.fromEntries(box.attrs.map((a) => [a.name, a]));
  assert.deepEqual(JSON.parse(by.style.ref.json), { flex: 1, textAlign: "left" });
  assert.equal(by.count.ref.code, "3"); // exported constants resolve too
  assert.equal(by.other.ref, undefined); // `local` is not a top-level constant
});

test("setProp with type ref replaces the constant's initializer, not the attribute", () => {
  const o = parseElements(REFPAGE).findIndex((e) => e.name === "Uu5Elements.Box");
  const out = setProp(REFPAGE, o, "style", { type: "ref", value: '{ flex: 2, textAlign: "center" }' });
  assert.match(out, /const STYLE = \{ flex: 2, textAlign: "center" \};/);
  assert.match(out, /style=\{STYLE\}/);
  assert.throws(() => setProp(REFPAGE, o, "other", { type: "ref", value: "1" }), /does not refer to a constant/);
  assert.throws(() => setProp(REFPAGE, o, "style", { type: "ref", value: "{ flex:" }), /Invalid expression/);
});

test("items of a list held in a constant are addressed and edited in the constant", () => {
  const o = parseElements(REFPAGE).findIndex((e) => e.name === "Uu5Elements.ActionGroup");
  assert.deepEqual(describeItem(REFPAGE, o, "itemList", 1).attrs.map((a) => a.name), ["icon", "children"]);
  const out = setItemProp(REFPAGE, o, "itemList", 1, "children", { type: "string", value: "Remove" });
  assert.match(out, /\{ icon: "uugds-delete", children: "Remove" \}/);
  assert.match(out, /itemList=\{ROUTE_ACTION\}/);
});

import { setBranch, setItemBranch } from "../src/main/jsxSource.mjs";
const COND = `<script type="text/babel">
  import Uu5Elements from "uu5g05-elements";
  function Page({ open, level }) {
    return (
      <div>
        <Uu5Elements.Button icon={open ? "uugds-chevron-up" : 'uugds-chevron-down'} colorScheme={level > 2 ? "red" : level > 1 ? "orange" : "green"} size={open ? 2 : size} />
        <Uu5Elements.ActionGroup itemList={[{ icon: open ? "uugds-a" : "uugds-b", children: "x" }]} />
      </div>
    );
  }
</script>`;

test("a conditional value is described as rows: condition -> value", () => {
  const b = describeElement(COND, 1).attrs.find((a) => a.name === "icon").branches;
  assert.deepEqual(b, [{ label: "open", type: "string", value: "uugds-chevron-up", editable: true }, { label: "not (open)", type: "string", value: "uugds-chevron-down", editable: true }]);
  const cs = describeElement(COND, 1).attrs.find((a) => a.name === "colorScheme").branches;
  assert.deepEqual(cs.map((r) => [r.label, r.value]), [["level > 2", "red"], ["not (level > 2) and level > 1", "orange"], ["not (level > 2) and not (level > 1)", "green"]]);
  const size = describeElement(COND, 1).attrs.find((a) => a.name === "size").branches;
  assert.deepEqual(size.map((r) => [r.editable, r.type, r.value]), [[true, "number", 2], [false, "code", "size"]]);
  assert.equal(describeElement(COND, 1).attrs.find((a) => a.name === "icon").branches.length, 2);
});

test("setBranch replaces one literal in the expression and keeps its quote style", () => {
  let out = setBranch(COND, 1, "icon", 0, { type: "string", value: "uugds-plus" });
  assert.match(out, /icon=\{open \? "uugds-plus" : 'uugds-chevron-down'\}/);
  out = setBranch(out, 1, "icon", 1, { type: "string", value: "uugds-minus" });
  assert.match(out, /: 'uugds-minus'\}/);
  out = setBranch(out, 1, "colorScheme", 2, { type: "string", value: "blue" });
  assert.match(out, /level > 1 \? "orange" : "blue"/);
  assert.throws(() => setBranch(COND, 1, "size", 1, { type: "number", value: 1 }), /computed in code/);
  assert.throws(() => setBranch(COND, 1, "icon", 5, { type: "string", value: "x" }), /no longer exists/);
});

test("setItemBranch edits a conditional property of a list item", () => {
  const out = setItemBranch(COND, 2, "itemList", 0, "icon", 1, { type: "string", value: "uugds-c" });
  assert.match(out, /icon: open \? "uugds-a" : "uugds-c"/);
});

import { describeElement as describeEl, setProp as setP } from "../src/main/jsxSource.mjs";

const VAR_PAGE = `<script type="text/babel">
import { createComponent, useLsi } from "uu5g05";
import Uu5Elements from "uu5g05-elements";
const TITLE = "Fixed title";
const T = { head: { text: "Plain object" } };
const Page = createComponent({
  render() {
    const ph = useLsi({
      cs: { progressTitle: "Průběh práce", other: "x" },
      en: { progressTitle: "Thesis progress", other: "y" },
    });
    return (
      <div>
        <Uu5Elements.Block header={ph.progressTitle} />
        <Uu5Elements.Block header={TITLE} />
        <Uu5Elements.Block header={T.head.text} />
        <Uu5Elements.Block header={unknown.value} />
      </div>
    );
  },
});
</script>`;
const attrOf = (html, ordinal, name) => describeEl(html, ordinal).attrs.find((a) => a.name === name);
const blocks = (html) => { const out = []; for (let i = 0; describeEl(html, i); i++) if (describeEl(html, i).name === "Uu5Elements.Block") out.push(i); return out; };

test("a prop that refers to a variable knows where the literal behind it is written", () => {
  const [lsi, constant, obj, unknown] = blocks(VAR_PAGE);
  const a = attrOf(VAR_PAGE, lsi, "header").valueRef;
  assert.equal(a.path, "ph.progressTitle"); assert.equal(a.via, "useLsi");
  assert.deepEqual(a.targets.map((t) => [t.lang, t.value]), [["cs", "Průběh práce"], ["en", "Thesis progress"]]);
  assert.deepEqual(attrOf(VAR_PAGE, constant, "header").valueRef.targets.map((t) => t.value), ["Fixed title"]);
  assert.deepEqual(attrOf(VAR_PAGE, obj, "header").valueRef.targets.map((t) => t.value), ["Plain object"]);
  assert.equal(attrOf(VAR_PAGE, unknown, "header").valueRef, undefined);
});

test("editing such a prop changes the variable, in the language that is shown", () => {
  const [lsi, constant, obj] = blocks(VAR_PAGE);
  const cs = setP(VAR_PAGE, lsi, "header", { type: "valueRef", value: { to: "Nový průběh", from: "Průběh práce" } });
  assert.match(cs, /progressTitle: "Nový průběh"/); assert.match(cs, /progressTitle: "Thesis progress"/); assert.match(cs, /header=\{ph\.progressTitle\}/, "the prop still refers to the variable");
  assert.match(setP(VAR_PAGE, lsi, "header", { type: "valueRef", value: { to: "New", from: "Thesis progress" } }), /progressTitle: "Průběh práce"[\s\S]*progressTitle: "New"/);
  assert.throws(() => setP(VAR_PAGE, lsi, "header", { type: "valueRef", value: { to: "x", from: "something else" } }), /written in 2 places/);
  assert.match(setP(VAR_PAGE, constant, "header", { type: "valueRef", value: { to: "Other", from: "Fixed title" } }), /const TITLE = "Other";/);
  assert.match(setP(VAR_PAGE, obj, "header", { type: "valueRef", value: { to: "Changed", from: "Plain object" } }), /head: \{ text: "Changed" \}/);
  assert.throws(() => setP(VAR_PAGE, blocks(VAR_PAGE)[3], "header", { type: "valueRef", value: { to: "x", from: "y" } }), /does not take its value from a literal/);
});

import { describeList, addItem, removeItem, moveItem, duplicateItem } from "../src/main/jsxSource.mjs";

const wrap = (list) => `<script type="text/babel">
import Uu5Elements from "uu5g05-elements";
function Page() {
  return (
    <Uu5Elements.Block
      header="H"
      actionList={${list}}
    />
  );
}
</script>`;
const MULTI = wrap(`[
        { icon: "uugds-plus", children: "Add", onClick: () => add() },
        // a comment between items
        { icon: "uugds-delete", children: "Delete", collapsed: true },
        { children: "Third" },
      ]`);
const INLINE = wrap(`[{ children: "A" }, { children: "B" }]`);
const block = (html) => { for (let i = 0; describeEl(html, i); i++) if (describeEl(html, i).name === "Uu5Elements.Block") return i; };
const texts = (html) => describeList(html, block(html), "actionList").items.map((i) => i.attrs.find((a) => a.name === "children")?.value ?? i.text);

test("describeList shows the items with their properties; a list built in code is refused", () => {
  const l = describeList(MULTI, block(MULTI), "actionList");
  assert.equal(l.items.length, 3);
  assert.deepEqual(l.items[1].attrs.map((a) => a.name), ["icon", "children", "collapsed"]);
  assert.equal(l.items[0].attrs.find((a) => a.name === "onClick").type, "code");
  assert.throws(() => describeList(wrap("makeList(cond)"), block(wrap("makeList(cond)")), "actionList"), /built dynamically/);
  assert.equal(describeList(wrap("cond ? [] : [{ children: 'x' }]"), block(wrap("cond ? [] : [{ children: 'x' }]")), "actionList").items.length, 1, "a condition between arrays is the array that has items");
});

test("removeItem keeps commas, comments and layout", () => {
  const o = block(MULTI), out = removeItem(MULTI, o, "actionList", 1);
  assert.deepEqual(texts(out), ["Add", "Third"]); assert.match(out, /a comment between items/); assert.doesNotMatch(out, /uugds-delete/);
  assert.deepEqual(texts(removeItem(MULTI, o, "actionList", 2)), ["Add", "Delete"]);
  assert.match(removeItem(MULTI, o, "actionList", 2), /collapsed: true \},\n\s*\]/, "the trailing comma of the list stays");
  assert.deepEqual(texts(removeItem(INLINE, block(INLINE), "actionList", 1)), ["A"]);
  assert.match(removeItem(INLINE, block(INLINE), "actionList", 1), /actionList=\{\[\{ children: "A" \}\]\}/);
  const one = removeItem(wrap(`[{ children: "A" }]`), block(wrap("[]")), "actionList", 0);
  assert.match(one, /actionList=\{\[\]\}/);
});

test("addItem and duplicateItem insert in the style of the list", () => {
  const o = block(MULTI);
  const added = addItem(MULTI, o, "actionList", [{ name: "icon", type: "string", value: "uugds-plus" }, { name: "children", type: "string", value: "New" }]);
  assert.deepEqual(texts(added), ["Add", "Delete", "Third", "New"]);
  assert.match(added, /\{ children: "Third" \},\n\s{8}\{ icon: "uugds-plus", children: "New" \},\n\s{6}\]/);
  assert.deepEqual(texts(addItem(MULTI, o, "actionList", [{ name: "children", type: "string", value: "First" }], 0)), ["First", "Add", "Delete", "Third"]);
  assert.deepEqual(texts(addItem(INLINE, block(INLINE), "actionList", [{ name: "children", type: "string", value: "C" }])), ["A", "B", "C"]);
  assert.match(addItem(INLINE, block(INLINE), "actionList", [{ name: "children", type: "string", value: "C" }]), /\{ children: "B" \}, \{ children: "C" \}\]/);
  const empty = addItem(wrap("[]"), block(wrap("[]")), "actionList", [{ name: "children", type: "string", value: "Only" }]);
  assert.deepEqual(texts(empty), ["Only"]);
  const dup = duplicateItem(MULTI, o, "actionList", 0);
  assert.deepEqual(texts(dup), ["Add", "Add", "Delete", "Third"]); assert.equal((dup.match(/onClick: \(\) => add\(\)/g) ?? []).length, 2);
});

test("moveItem reorders the items and leaves everything between them", () => {
  const o = block(MULTI);
  assert.deepEqual(texts(moveItem(MULTI, o, "actionList", 0, 2)), ["Delete", "Third", "Add"]);
  assert.deepEqual(texts(moveItem(MULTI, o, "actionList", 2, 0)), ["Third", "Add", "Delete"]);
  assert.match(moveItem(MULTI, o, "actionList", 0, 1), /a comment between items/);
  assert.equal(moveItem(MULTI, o, "actionList", 1, 1), MULTI);
  assert.throws(() => moveItem(MULTI, o, "actionList", 0, 5), /cannot be moved/);
});

import { setText } from "../src/main/jsxSource.mjs";

const TXT_PAGE = `<script type="text/babel">
import { createComponent, useLsi } from "uu5g05";
import Uu5Elements from "uu5g05-elements";
const L = (cs, en) => ({ cs, en });
const t = (cs, en) => <T lsi={L(cs, en)} />;
const TITLE = { cs: "Název", en: "Title" };
const LABELS = { save: L("Uložit", "Save") };
function Page() {
  return (
    <div>
      <Uu5Elements.Block header={TITLE} />
      <Uu5Elements.Block header={LABELS.save} />
      <Uu5Elements.Block header={t("Historie", "History")} />
      <Uu5Elements.Block header={<T lsi={{ cs: "Ahoj", en: "Hi" }} />} />
      <Uu5Elements.Block header={dynamic} />
      <Uu5Elements.Block actionList={[{ children: t("Ano", "Yes"), tooltip: TITLE }, { children: "Plain" }]} />
    </div>
  );
}
</script>`;
const blks = (html) => { const o = []; for (let i = 0; describeEl(html, i); i++) if (describeEl(html, i).name === "Uu5Elements.Block") o.push(i); return o; };
const langs = (r) => r && Object.fromEntries(r.langs.map((l) => [l.lang, l.value]));

test("a prop or an item property that is an LSI or points to one shows the text of every language", () => {
  const [a, b, c, d, dyn, lst] = blks(TXT_PAGE), res = (o, n) => attrOf(TXT_PAGE, o, n).resolved;
  assert.deepEqual(langs(res(a, "header")), { cs: "Název", en: "Title" }); assert.equal(res(a, "header").via, "TITLE"); assert.equal(res(a, "header").kind, "lsi");
  assert.deepEqual(langs(res(b, "header")), { cs: "Uložit", en: "Save" }); assert.equal(res(b, "header").via, "LABELS.save");
  assert.deepEqual(langs(res(c, "header")), { cs: "Historie", en: "History" }); assert.equal(res(c, "header").via, "t(…)");
  assert.deepEqual(langs(res(d, "header")), { cs: "Ahoj", en: "Hi" });
  assert.equal(res(dyn, "header"), undefined, "a computed value stays code");
  const items = describeList(TXT_PAGE, lst, "actionList").items;
  assert.deepEqual(langs(items[0].attrs.find((x) => x.name === "children").resolved), { cs: "Ano", en: "Yes" });
  assert.deepEqual(langs(items[0].attrs.find((x) => x.name === "tooltip").resolved), { cs: "Název", en: "Title" });
  assert.equal(items[1].attrs.find((x) => x.name === "children").resolved, undefined, "a plain string is a plain string");
});

test("setText changes one language where it is written", () => {
  const [a, b, c, d, , lst] = blks(TXT_PAGE);
  assert.match(setText(TXT_PAGE, a, { attr: "header" }, 1, "Heading"), /const TITLE = \{ cs: "Název", en: "Heading" \}/);
  assert.match(setText(TXT_PAGE, b, { attr: "header" }, 0, "Ulož"), /LABELS = \{ save: L\("Ulož", "Save"\) \}/);
  assert.match(setText(TXT_PAGE, c, { attr: "header" }, 1, "Past"), /header=\{t\("Historie", "Past"\)\}/);
  assert.match(setText(TXT_PAGE, d, { attr: "header" }, 0, "Čau"), /cs: "Čau", en: "Hi"/);
  assert.match(setText(TXT_PAGE, lst, { item: { prop: "actionList", index: 0 }, name: "children" }, 0, "Určitě"), /children: t\("Určitě", "Yes"\)/);
  assert.throws(() => setText(TXT_PAGE, blks(TXT_PAGE)[4], { attr: "header" }, 0, "x"), /not written out as a literal/);
});

import { replaceItem } from "../src/main/jsxSource.mjs";

test("replaceItem swaps the whole item for code, and refuses invalid code", () => {
  const o = block(MULTI);
  const out = replaceItem(MULTI, o, "actionList", 2, `{ component: <Badge colorScheme="final">{t("Hotovo", "Done")}</Badge> }`);
  assert.match(out, /\{ component: <Badge colorScheme="final">/); assert.deepEqual(texts(out).slice(0, 2), ["Add", "Delete"]); assert.match(out, /a comment between items/);
  assert.throws(() => replaceItem(MULTI, o, "actionList", 0, "{ children: "), /Invalid code/);
  assert.throws(() => replaceItem(MULTI, o, "actionList", 0, "  "), /is empty/);
  assert.throws(() => replaceItem(MULTI, o, "actionList", 9, "{}"), /no longer exists/);
});

import { structureOf, structureOutline, parseElements as parseEls } from "../src/main/jsxSource.mjs";
test("structure of a screen: sequence, iteration, conditions, local components, ordinals", () => {
  const html = `<script type="text/babel">
import { Utils } from 'uu5g05'; import { Block, Button, Text } from 'uu5g05-elements'; import { Grid } from 'uu5tilesg02-elements';
const Tile = ({ item }) => <Block header={item.name}><Text>{item.text}</Text><Button disabled={!item.canEdit} onClick={() => {}} /></Block>;
function List({ data, loading }) {
  if (loading) return <Text>Loading</Text>;
  return <div><Grid>{data.map((it) => <Tile item={it} />)}</Grid>{data.length === 0 && <Text>Empty</Text>}{open ? <Button /> : <Text />}</div>;
}
const App = () => <><List data={[]} /></>;
Utils.Dom.render(<App />, document.getElementById('root'));
</script>`;
  const t = structureOf(html, "demo"), els = parseEls(html);
  assert.equal(t.name, "Screen: demo"); assert.equal(t.children[0].name, "App");
  const list = t.children[0].children[0];
  assert.equal(list.name, "List");
  assert.deepEqual(list.children.map((c) => c.name), ["Text", "Grid", "Text", "Button", "Text"]);
  assert.equal(list.children[0].render, "loading", "a return under if is a condition");
  assert.equal(list.children[1].render, "!(loading)", "the return after it holds when the if does not");
  const tile = list.children[1].children[0];
  assert.equal(tile.name, "Tile"); assert.equal(tile.relation, "1:N"); assert.equal(tile.data, "item of data");
  const block = tile.children[0];
  assert.equal(block.name, "Block"); assert.equal(block.kind, "library");
  const button = block.children[1];
  assert.equal(button.disabled, "!item.canEdit");
  assert.equal(els[button.ordinal].name, "Button", "the ordinal is the one of parseElements");
  assert.match(list.children[3].render, /open/); assert.match(list.children[4].render, /!\(open\)/);
  assert.match(structureOutline(t), /Tile ×N[\s\S]*Button \[D: !item\.canEdit\]/);
  assert.equal(structureOf("<p>no script</p>"), null);
});

test("an item that comes from a conditional spread of the list can be edited", () => {
  const html = `<script type="text/babel">
import { ActionGroup } from "uu5g05-elements";
const readOnly = false;
const X = () => <ActionGroup itemList={[
  { icon: "uugds-check", children: "Konzultace" },
  ...(readOnly ? [] : [{ icon: "uugds-plus-circle", children: "Přidat úkol", primary: true }]),
]} />;
</script>`;
  const ord = parseElements(html).find((e) => e.name === "ActionGroup").ordinal;
  const first = describeItem(html, ord, "itemList", 0, 2), second = describeItem(html, ord, "itemList", 1, 2);
  assert.equal(first.attrs.find((a) => a.name === "icon").value, "uugds-check");
  assert.equal(second.attrs.find((a) => a.name === "children").value, "Přidat úkol");
  const out = setItemProp(html, ord, "itemList", 1, "children", { type: "string", value: "Nový úkol" }, 2);
  assert.match(out, /children: "Nový úkol"/); assert.match(out, /children: "Konzultace"/);
  assert.throws(() => describeItem(html, ord, "itemList", 0, 1), /has 2 items but 1 are rendered/, "when the spread is empty the file cannot tell which item is which");
});

import { moveElements, insertElement, removeElements, duplicateElements, editText, changeItems } from "../src/main/jsxSource.mjs";
test("moving JSX elements in the file: before, after, inside, and what is refused", () => {
  const page = (body) => `<script type="text/babel">
import { Block, Text, Button, Box } from "uu5g05-elements";
const Other = () => <Text>other</Text>;
function Page({ list, ok }) {
  return (
    <Box>
${body}
    </Box>
  );
}
</script>`;
  const html = page(`      <Text>A</Text>
      <Text>B</Text>
      <Block header="H">
        <Button>X</Button>
      </Block>
      <Text>C</Text>`);
  const els = parseElements(html);
  const texts = els.filter((e) => e.name === "Text" && e.start > html.indexOf("function Page"));
  const [tA, tB, tC] = texts.map((e) => e.ordinal), block = els.find((e) => e.name === "Block").ordinal, button = els.find((e) => e.name === "Button").ordinal;

  // before / after among siblings
  let r = moveElements(html, [{ ordinal: tC, target: tA, position: "before" }]);
  assert.equal(r.failed.length, 0); assert.match(r.html, /<Box>\n      <Text>C<\/Text>\n      <Text>A<\/Text>/);
  assert.ok(!r.html.includes("data-mv"), "the temporary attributes are gone");
  r = moveElements(html, [{ ordinal: tA, target: tB, position: "after" }]);
  assert.match(r.html, /<Text>B<\/Text>\n      <Text>A<\/Text>\n      <Block/);
  // inside a block (a multi-line one), and into a component that is in the same function
  r = moveElements(html, [{ ordinal: tC, target: block, position: "inside" }]);
  assert.match(r.html, /<Button>X<\/Button>\n        <Text>C<\/Text>\n      <\/Block>/); assert.equal(r.failed.length, 0);
  // a move into the block, then out of it again: the ordinals still find the elements
  r = moveElements(html, [{ ordinal: tC, target: block, position: "inside" }, { ordinal: tC, target: tA, position: "before" }]);
  assert.equal(r.failed.length, 0); assert.match(r.html, /<Box>\n      <Text>C<\/Text>\n      <Text>A<\/Text>/);
  // refused: into itself, a component of the file, another function
  r = moveElements(html, [{ ordinal: block, target: button, position: "before" }]);
  assert.equal(r.applied.length, 0); assert.match(r.failed[0].reason, /into itself/);
  assert.equal(r.html, html, "nothing changed when nothing was done");
  const other = els.find((e) => e.name === "Text" && e.start < html.indexOf("function Page")).ordinal;
  r = moveElements(html, [{ ordinal: tA, target: other, position: "before" }]);
  assert.match(r.failed[0].reason, /another function/);
  // refused: an element in a condition
  const cond = page(`      <Text>A</Text>\n      {ok && <Text>B</Text>}\n      <Text>C</Text>`), ce = parseElements(cond).filter((e) => e.name === "Text" && e.start > cond.indexOf("function Page"));
  r = moveElements(cond, [{ ordinal: ce[1].ordinal, target: ce[0].ordinal, position: "before" }]);
  assert.match(r.failed[0].reason, /plain child/);
  // the rest of the moves is done although one failed
  r = moveElements(cond, [{ ordinal: ce[1].ordinal, target: ce[0].ordinal, position: "before" }, { ordinal: ce[2].ordinal, target: ce[0].ordinal, position: "before" }]);
  assert.deepEqual([r.applied, r.failed.map((f) => f.index)], [[1], [0]]);
  // a self-closing target gets the element inside
  const sc = page(`      <Block />\n      <Text>A</Text>`), se = parseElements(sc);
  r = moveElements(sc, [{ ordinal: se.find((e) => e.name === "Text" && e.start > sc.indexOf("function Page")).ordinal, target: se.find((e) => e.name === "Block").ordinal, position: "inside" }]);
  assert.match(r.html, /<Block>\n        <Text>A<\/Text>\n      <\/Block>/);
});

test("inserting a new JSX element: before, after, inside, the new ordinal, and what is refused", () => {
  const page = (body) => `<script type="text/babel">
import { Block, Text, Button, Box } from "uu5g05-elements";
const Other = () => <Text>other</Text>;
function Page({ list, ok }) {
  return (
    <Box>
${body}
    </Box>
  );
}
</script>`;
  const html = page(`      <Text>A</Text>
      <Block header="H">
        <Button>X</Button>
      </Block>
      <Text>C</Text>`);
  const els = parseElements(html), at = (h, o) => h.slice(parseElements(h)[o].start);
  const inPage = (e) => e.start > html.indexOf("function Page");
  const tA = els.find((e) => e.name === "Text" && inPage(e)).ordinal, block = els.find((e) => e.name === "Block").ordinal;
  const snippet = `<Button colorScheme="blue">New</Button>`;

  let r = insertElement(html, { target: tA, position: "before", snippet });
  assert.ok(!r.error, r.error); assert.match(r.html, /<Box>\n      <Button colorScheme="blue">New<\/Button>\n      <Text>A<\/Text>/);
  assert.ok(!r.html.includes("data-mv"), "the temporary attributes are gone");
  assert.ok(at(r.html, r.ordinal).startsWith(snippet), "the ordinal finds the new element");
  r = insertElement(html, { target: tA, position: "after", snippet });
  assert.match(r.html, /<Text>A<\/Text>\n      <Button colorScheme="blue">New<\/Button>\n      <Block/); assert.ok(at(r.html, r.ordinal).startsWith(snippet), "the ordinal finds the new element");
  r = insertElement(html, { target: block, position: "inside", snippet });
  assert.match(r.html, /<Button>X<\/Button>\n        <Button colorScheme="blue">New<\/Button>\n      <\/Block>/); assert.ok(at(r.html, r.ordinal).startsWith(snippet), "the ordinal finds the new element");
  // a multi-line snippet is indented with the place
  r = insertElement(html, { target: block, position: "before", snippet: `<Block>\n  <Text>N</Text>\n</Block>` });
  assert.match(r.html, /\n      <Block>\n        <Text>N<\/Text>\n      <\/Block>\n      <Block header="H">/);
  // a self-closing target gets it inside
  const sc = page(`      <Block />\n      <Text>A</Text>`), se = parseElements(sc);
  r = insertElement(sc, { target: se.find((e) => e.name === "Block").ordinal, position: "inside", snippet: "<Text>N</Text>" });
  assert.match(r.html, /<Block>\n        <Text>N<\/Text>\n      <\/Block>/); assert.ok(at(r.html, r.ordinal).startsWith("<Text>N</Text>"), "the ordinal finds the new element");
  // refused: inside a component of the file, next to an element in a condition, bad snippets, unknown target
  const other = els.find((e) => e.name === "Text" && !inPage(e)).ordinal, otherRoot = els.find((e) => e.name === "Box").ordinal;
  r = insertElement(page(`      <Other />`), { target: parseElements(page(`      <Other />`)).find((e) => e.name === "Other").ordinal, position: "inside", snippet });
  assert.match(r.error, /component of this file/);
  const cond = page(`      <Text>A</Text>\n      {ok && <Text>B</Text>}`), ce = parseElements(cond).filter((e) => e.name === "Text" && e.start > cond.indexOf("function Page"));
  assert.match(insertElement(cond, { target: ce[1].ordinal, position: "before", snippet }).error, /plain child/);
  assert.match(insertElement(html, { target: tA, position: "before", snippet: "<Text>" }).error, /not valid JSX/);
  assert.match(insertElement(html, { target: tA, position: "before", snippet: "text only" }).error, /not valid JSX|one JSX element/);
  assert.match(insertElement(html, { target: tA, position: "before", snippet: "<A /><B />" }).error, /not valid JSX|one JSX element/);
  assert.match(insertElement(html, { target: 999, position: "before", snippet }).error, /not a JSX element/);
  assert.match(insertElement(html, { target: tA, position: "sideways", snippet }).error, /not set/);
  void other; void otherRoot;
  // the file is not changed by a refused insert, and a component that the file does not import is reported
  assert.equal(insertElement(html, { target: tA, position: "before", snippet: "<Uu5Elements.Tabs />" }).missingImport, "Uu5Elements");
  assert.equal(insertElement(html, { target: tA, position: "before", snippet }).missingImport, undefined);
});

test("removing JSX elements: a line of its own goes whole, a nested one goes with its parent, what is in a condition or a list stays", () => {
  const page = (body) => `<script type="text/babel">
import { Block, Text, Button, Box } from "uu5g05-elements";
function Page({ list, ok }) {
  return (
    <Box>
${body}
    </Box>
  );
}
</script>`;
  const html = page(`      <Text>A</Text>
      <Block header="H">
        <Button>X</Button>
      </Block>
      <Text>C</Text>`);
  const els = parseElements(html), id = (n, i = 0) => els.filter((e) => e.name === n)[i].ordinal;
  let r = removeElements(html, [id("Text", 0)]);
  assert.deepEqual(r.applied, [id("Text", 0)]); assert.equal(r.failed.length, 0); assert.ok(!r.html.includes("data-mv"));
  assert.match(r.html, /<Box>\n      <Block header="H">/); assert.ok(!r.html.includes("<Text>A</Text>"));
  r = removeElements(html, [id("Block")]);
  assert.ok(!r.html.includes("<Button") && !r.html.includes("<Block")); assert.match(r.html, /<Box>\n      <Text>A<\/Text>\n      <Text>C<\/Text>\n    <\/Box>/);
  // an element and the one inside it: both are reported as removed, the file is valid
  r = removeElements(html, [id("Button"), id("Block")]);
  assert.deepEqual(r.applied.sort(), [id("Block"), id("Button")].sort()); assert.equal(r.failed.length, 0);
  r = removeElements(html, [id("Block"), id("Button")]);
  assert.equal(r.failed.length, 0); assert.ok(!r.html.includes("<Button"));
  // the last child leaves an empty parent
  const one = page("      <Text>A</Text>");
  r = removeElements(one, [parseElements(one).find((e) => e.name === "Text").ordinal]);
  assert.match(r.html, /<Box>\n    <\/Box>/);
  // refused: in a condition, the root of a component, an ordinal that is not an element; the others are still done
  const cond = page(`      <Text>A</Text>\n      {ok && <Text>B</Text>}`), ce = parseElements(cond), texts = ce.filter((e) => e.name === "Text");
  r = removeElements(cond, [texts[1].ordinal, texts[0].ordinal]);
  assert.deepEqual([r.applied, r.failed.map((f) => f.ordinal)], [[texts[0].ordinal], [texts[1].ordinal]]); assert.match(r.failed[0].reason, /plain child/);
  assert.match(removeElements(cond, [ce.find((e) => e.name === "Box").ordinal]).failed[0].reason, /plain child/);
  assert.match(removeElements(cond, [999]).failed[0].reason, /not a JSX element/);
  assert.equal(removeElements(cond, [texts[1].ordinal]).html, cond, "nothing changed when nothing was removed");
});

test("duplicating JSX elements: the copy follows its original, the ordinals of the copies are right, what is not a plain child is refused", () => {
  const page = (body) => `<script type="text/babel">
import { Block, Text, Button, Box } from "uu5g05-elements";
function Page({ list, ok }) {
  return (
    <Box>
${body}
    </Box>
  );
}
</script>`;
  const html = page(`      <Text>A</Text>
      <Block header="H">
        <Button>X</Button>
      </Block>
      <Text>C</Text>`);
  const els = parseElements(html), id = (n, i = 0) => els.filter((e) => e.name === n)[i].ordinal;
  let r = duplicateElements(html, [id("Block")]);
  assert.equal(r.failed.length, 0); assert.match(r.html, /<\/Block>\n      <Block header="H">\n        <Button>X<\/Button>\n      <\/Block>\n      <Text>C/);
  assert.equal(parseElements(r.html)[r.copies[0]].name, "Block"); assert.equal(r.copies.length, 1);
  assert.equal(parseElements(r.html)[r.copies[0] + 1].name, "Button", "the copy has its content, the ordinal is the copy's own");
  assert.ok(r.copies[0] > id("Block") + 1, "the copy is after the original and what is in it");
  // two at once: both copies are found at the end
  r = duplicateElements(html, [id("Text", 0), id("Block")]);
  assert.equal(r.failed.length, 0); assert.equal(r.copies.length, 2);
  const out = parseElements(r.html);
  assert.deepEqual(r.copies.map((o) => out[o].name).sort(), ["Block", "Text"]);
  assert.equal(out.filter((e) => e.name === "Text").length, 3); assert.equal(out.filter((e) => e.name === "Block").length, 2);
  for (const o of r.copies) assert.ok(r.html.slice(out[o].start).startsWith(out[o].name === "Text" ? "<Text>A" : "<Block header"), "a copy is where its ordinal says");
  // refused: in a condition, not an element; the rest is done
  const cond = page(`      <Text>A</Text>\n      {ok && <Text>B</Text>}`), texts = parseElements(cond).filter((e) => e.name === "Text");
  r = duplicateElements(cond, [texts[1].ordinal, texts[0].ordinal]);
  assert.equal(r.copies.length, 1); assert.match(r.failed[0].reason, /plain child/);
  assert.match(duplicateElements(cond, [999]).failed[0].reason, /not a JSX element/);
  assert.equal(duplicateElements(cond, [texts[1].ordinal]).html, cond);
});

test("moveElements says where the moved elements are in the new file", () => {
  const html = `<script type="text/babel">
import { Text, Box } from "uu5g05-elements";
const P = () => (
  <Box>
    <Text>A</Text>
    <Text>B</Text>
    <Text>C</Text>
  </Box>
);
</script>`;
  const els = parseElements(html), [a, , c] = els.filter((e) => e.name === "Text").map((e) => e.ordinal);
  const r = moveElements(html, [{ ordinal: c, target: a, position: "before" }]);
  assert.equal(r.moved.length, 1); assert.ok(r.html.slice(parseElements(r.html)[r.moved[0]].start).startsWith("<Text>C"));
  assert.deepEqual(moveElements(html, [{ ordinal: c, target: c, position: "before" }]).moved, []);
});

test("editText finds the text by what it says: a text child, a text written elsewhere, a prop", () => {
  const html = `<script type="text/babel">
import { Text, Block, Button, Box } from "uu5g05-elements";
const t = (cs, en) => (en);
const TITLE = { cs: "Nadpis", en: "Heading" };
function Page() {
  return (
    <Box>
      <Text>Hello
        world</Text>
      <Text>{TITLE.en}</Text>
      <Text>{t("Ano", "Yes")}</Text>
      <Block header="Block title" colorScheme="blue" />
      <Button label={{ cs: "Uložit", en: "Save" }}>Go</Button>
      <Text>Plain & simple</Text>
    </Box>
  );
}
</script>`;
  const els = parseElements(html), by = (n, i = 0) => els.filter((e) => e.name === n)[i].ordinal;
  // a text child, written over several lines: whitespace is not compared, the way the text is laid out is kept
  let out = editText(html, by("Text", 0), "Hello world", "Good morning");
  assert.match(out, /<Text>Good morning<\/Text>/); assert.ok(!out.includes("Hello"));
  // characters that mean something in JSX are written as a string expression
  out = editText(html, by("Text", 3), "Plain & simple", "A < B");
  assert.match(out, /<Text>\{"A < B"\}<\/Text>/);
  // a text written elsewhere: it is changed there (a constant, an argument of a language function)
  out = editText(html, by("Text", 1), "Heading", "New heading");
  assert.match(out, /en: "New heading"/); assert.match(out, /cs: "Nadpis"/);
  out = editText(html, by("Text", 2), "Yes", "Sure");
  assert.match(out, /t\("Ano", "Sure"\)/);
  // a prop of the component, a string or one language of an LSI
  out = editText(html, by("Block"), "Block title", "Other");
  assert.match(out, /header="Other"/); assert.match(out, /colorScheme="blue"/);
  out = editText(html, by("Button"), "Save", "Store");
  assert.match(out, /en: "Store"/); assert.match(out, />Go<\/Button>/);
  out = editText(html, by("Button"), "Go", "Run");
  assert.match(out, />Run<\/Button>/); assert.match(out, /en: "Save"/);
  // refused: a text the element does not have, an empty text, no text
  assert.throws(() => editText(html, by("Text", 0), "Something else", "x"), /not written out as a plain text/);
  assert.throws(() => editText(html, by("Text", 0), "Hello world", "  "), /cannot be empty/);
  assert.throws(() => editText(html, by("Text", 0), "", "x"), /no text/);
  assert.throws(() => editText(html, 999, "a", "b"), /no longer exists/);
});

test("changeItems: several items of a list at once, the layout and commas are kept", () => {
  const html = `<script type="text/babel">
import Uu5Elements from "uu5g05-elements";
const P = () => (
  <Uu5Elements.ActionGroup itemList={[
    { children: "A" },
    { children: "B", icon: "x" },
    { children: "C" },
  ]} />
);
</script>`;
  const g = parseElements(html).find((e) => e.name === "Uu5Elements.ActionGroup").ordinal, texts = (h) => [...h.matchAll(/children: "(\w)"/g)].map((m) => m[1]).join("");
  let r = changeItems(html, g, "itemList", "remove", { indexes: [0, 2] });
  assert.equal(r.removed, 2); assert.equal(texts(r.html), "B"); assert.ok(!r.html.includes(",,"));
  r = changeItems(html, g, "itemList", "duplicate", { indexes: [0, 1] });
  assert.deepEqual(r.copies, [1, 3]); assert.equal(texts(r.html), "AABBC");
  assert.match(r.html, /\{ children: "B", icon: "x" \},\n    \{ children: "B", icon: "x" \},/);
  r = changeItems(html, g, "itemList", "add", { props: [{ name: "children", type: "string", value: "N" }], at: 1 });
  assert.equal(r.added, 1); assert.equal(texts(r.html), "ANBC");
  r = changeItems(html, g, "itemList", "add", { props: [{ name: "children", type: "string", value: "N" }] });
  assert.equal(r.added, 3); assert.equal(texts(r.html), "ABCN");
  assert.equal(changeItems(html, g, "itemList", "add", { props: [], at: 99 }).added, 3, "a place after the end is the end");
  assert.throws(() => changeItems(html, g, "itemList", "remove", { indexes: [] }), /No item/);
  assert.throws(() => changeItems(html, g, "itemList", "remove", { indexes: [7] }), /no longer exists/);
  assert.throws(() => changeItems(html, g, "itemList", "sort", { indexes: [0] }), /Unknown/);
  assert.throws(() => changeItems(html, g, "nothing", "remove", { indexes: [0] }), /built dynamically/);
});

test("structure of one component: the part of the tree under an element", () => {
  const html = `<script type="text/babel">
import { Box, Block, Text, Button } from "uu5g05-elements";
const X = () => <Box><Block><Text>a</Text><Button /></Block><Text>b</Text></Box>;
</script>`;
  const els = parseElements(html), block = els.find((e) => e.name === "Block").ordinal;
  const part = structureOf(html, "x", { ordinal: block });
  assert.equal(part.name, "Block"); assert.deepEqual(part.children.map((c) => c.name), ["Text", "Button"]);
  assert.equal(structureOf(html, "x", { ordinal: 999 }), null);
});

test("list props written as a condition between arrays, or as a function that returns the list", () => {
  const html = `<script type="text/babel">
import { Block } from "uu5g05-elements";
import { ContentContainer } from "uu_plus4u5g02-elements";
const P = ({ can }) => {
  function getActionList() {
    return [
      { icon: "uugds-plus-circle", children: "Přidat záznam", onClick: () => {} },
      { icon: "uugds-reload", children: "Obnovit", collapsed: true },
    ];
  }
  return (
    <div>
      <Block actionList={can ? [{ icon: "uugds-plus-circle", children: "Přidat" }] : []} />
      <ContentContainer getActionList={getActionList} />
      <ContentContainer getActionList={() => [{ children: "A" }, { children: "B" }]} />
    </div>
  );
};
</script>`;
  const els = parseElements(html), block = els.find((e) => e.name === "Block"), ccs = els.filter((e) => e.name === "ContentContainer");
  const bi = describeItem(html, block.ordinal, "actionList", 0, 1);
  assert.equal(bi.attrs.find((a) => a.name === "children").value, "Přidat");
  const fi = describeItem(html, ccs[0].ordinal, "getActionList", 1, 2);
  assert.equal(fi.attrs.find((a) => a.name === "children").value, "Obnovit");
  const out = setItemProp(html, ccs[0].ordinal, "getActionList", 1, "children", { type: "string", value: "Znovu" }, 2);
  assert.match(out, /children: "Znovu", collapsed: true/); assert.match(out, /children: "Přidat záznam"/);
  const ai = describeItem(html, ccs[1].ordinal, "getActionList", 1, 2);
  assert.equal(ai.attrs.find((a) => a.name === "children").value, "B");
  const list = describeList(html, ccs[0].ordinal, "getActionList");
  assert.equal(list.items.length, 2);
});

const aliased = (decl, jsx) => `<!doctype html><html><body><div id="uu5"></div>
<script type="text/babel">
  import { Utils } from "uu5g05";
  import Uu5Elements from "uu5g05-elements";
  ${decl}
  function Page() { return ${jsx}; }
  Utils.Dom.render(<Page/>, document.getElementById("uu5"));
</script></body></html>`;

test("a library bound to a constant of the file (const E = Uu5Elements) is still tagged, under its real name", () => {
  const html = aliased("const E = Uu5Elements;", `<E.Block header="h"><E.Text>x</E.Text></E.Block>`);
  const els = parseElements(html).filter((e) => e.uu5);
  assert.deepEqual(els.map((e) => e.name), ["Uu5Elements.Block", "Uu5Elements.Text"]);
  assert.equal((tagHtml(html).match(new RegExp(SRC_ATTR, "g")) ?? []).length, 2);
});

test("destructured components, nested aliases and member paths are followed; unrelated constants are not", () => {
  const d = aliased("const { Block, Text: T } = Uu5Elements; const E = Uu5Elements; const G = E.Grid; const x = Other;", `<Block><T>x</T><G><span/></G></Block>`);
  assert.deepEqual(parseElements(d).filter((e) => e.uu5).map((e) => e.name), ["Uu5Elements.Block", "Uu5Elements.Text", "Uu5Elements.Grid"]);
  const n = aliased("const Fake = Other;", `<Fake/>`);
  assert.deepEqual(parseElements(n).filter((e) => e.uu5), []);
});

test("a prop taken from the item of a .map callback shows the values of the list and is edited in the item it comes from", () => {
  const html = aliased(`const MODULES = [{ title: "A", icon: "mdi-brain" }, { title: "B", icon: "mdi-strategy" }];`,
    `<div>{MODULES.map((m) => <div key={m.title}><Uu5Elements.Icon icon={m.icon} /></div>)}</div>`);
  const icon = parseElements(html).find((e) => e.name === "Uu5Elements.Icon");
  const d = describeElement(html, icon.ordinal), attr = d.attrs.find((a) => a.name === "icon");
  assert.deepEqual(attr.mapRef, { list: "MODULES", path: "icon", items: [{ index: 0, type: "string", value: "mdi-brain" }, { index: 1, type: "string", value: "mdi-strategy" }] });
  const out = setProp(html, icon.ordinal, "icon", { type: "mapItem", value: { from: "mdi-strategy", to: "mdi-chess-knight" } });
  assert.match(out, /\{ title: "B", icon: "mdi-chess-knight" \}/);
  assert.match(out, /icon=\{m\.icon\}/);
  assert.throws(() => setProp(html, icon.ordinal, "icon", { type: "mapItem", value: { from: "mdi-x", to: "mdi-y" } }), /No item of MODULES/);
});
