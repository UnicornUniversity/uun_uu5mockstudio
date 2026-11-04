import test from "node:test";
import assert from "node:assert/strict";
import { collectUu5Tree, collectCode } from "../src/renderer/uu5StringCollect.js";
import { toUu5String, quote, notesOf } from "../src/renderer/uu5String.js";

// ---------- a tiny fake of React's element and fiber trees ----------
const EL = Symbol.for("react.element");
const el = (type, props = {}, ...children) => ({ $$typeof: EL, type, props: children.length ? { ...props, children: children.length === 1 ? children[0] : children } : props });
const named = (displayName, defaultProps) => Object.assign(function C() {}, { displayName, defaultProps });
/** Builds the fiber of an element the way React would after rendering; `render` gives the rendered elements of a component of the screen. */
function fiberOf(e, render = new Map()) {
  if (typeof e === "string" || typeof e === "number") return { tag: 6, memoizedProps: String(e) };
  const host = typeof e.type === "string";
  const f = { tag: host ? 5 : 0, type: e.type, memoizedProps: e.props };
  const kids = host || /\./.test(e.type.displayName ?? "") ? [] : [].concat(render.get(e.type)?.(e.props) ?? []);
  if (host) { const c = e.props.children; if (c !== undefined && typeof c !== "string" && typeof c !== "number") kids.push(...[].concat(c)); }
  if (!host && /\./.test(e.type.displayName ?? "")) kids.push(...[].concat(e.props.children ?? []).filter((x) => x && typeof x === "object")); // a library component renders its children somewhere inside
  let prev = null;
  for (const k of kids.filter((x) => x !== null && x !== undefined && x !== false)) { const c = fiberOf(k, render); c.return = f; if (prev) prev.sibling = c; else f.child = c; prev = c; }
  return f;
}
const rootOf = (e, render) => { const r = { tag: 3, child: fiberOf(e, render) }; r.child.return = r; return r; };

const Text = named("Uu5Elements.withTooltip(Uu5Elements.Text)", { significance: "common", bold: false });
const Panel = named("Uu5Elements.Panel");
const Modal = named("Uu5Elements.Modal");
const Button = named("Uu5Elements.Button", { size: "m" });
const AlertBus = named("Uu5Elements.AlertBus");

test("a component of the screen is transparent, library components keep the props the author set", () => {
  const Card = function Card() {};
  const render = new Map([[Card, (p) => el("div", { className: "card", style: { padding: 24 } }, el(Text, { type: "h4", significance: "common", bold: false }, p.title))]]);
  const root = rootOf(el(AlertBus, {}, el(Card, { title: "Ahoj" })), render);
  const tree = collectUu5Tree({ rootFiber: root, styleRules: [{ selector: ".card", cssText: "background: rgb(255, 255, 255); border-radius: 24px;" }, { selector: ".card:hover", cssText: "transform: translateY(-4px);" }] });
  const { text, notes } = toUu5String(tree);
  assert.equal(text, `<uu5string/>\n<div style='<uu5json/>{"background":"rgb(255, 255, 255)","borderRadius":"24px","padding":24}'>\n  <Uu5Elements.Text type="h4">Ahoj</Uu5Elements.Text>\n</div>\n`);
  assert.deepEqual(tree.report.cssLost, [".card:hover"]);
  assert.match(notes.join(" "), /\.card:hover/);
});

test("functions are left out and reported, a closed modal is skipped, JSX in a prop becomes a nested uu5String", () => {
  const root = rootOf(el("div", {}, el(Button, { onClick: () => {}, colorScheme: "orange", size: "m" }, "Objednat"), el(Modal, { open: false, header: "X" }, "obsah"), el(Panel, { header: el(Text, { bold: true }, "Otázka") }, "Odpověď")));
  const tree = collectUu5Tree({ rootFiber: root, styleRules: [] });
  const { text, notes } = toUu5String(tree);
  assert.match(text, /<Uu5Elements\.Button colorScheme="orange">Objednat<\/Uu5Elements\.Button>/);
  assert.match(text, /<Uu5Elements\.Panel header="<uu5string\/><Uu5Elements\.Text bold=true>Otázka<\/Uu5Elements\.Text>">Odpověď<\/Uu5Elements\.Panel>/);
  assert.doesNotMatch(text, /Modal/);
  assert.deepEqual(tree.report.fn, { onClick: 1 });
  assert.deepEqual(tree.report.closed, { "Uu5Elements.Modal": 1 });
  assert.equal(notes.length, 2);
});

test("data props become uu5json, functions inside data are dropped with their path", () => {
  const Grid = named("Uu5Elements.Grid");
  const root = rootOf(el(Grid, { templateColumns: { xs: "1fr", l: "1fr 2fr" }, columnGap: 40, itemList: [{ children: "A", onClick() {} }] }, el("span", {}, "x")));
  const tree = collectUu5Tree({ rootFiber: root, styleRules: [] });
  const { text } = toUu5String(tree);
  assert.match(text, /templateColumns='<uu5json\/>\{"xs":"1fr","l":"1fr 2fr"\}' columnGap=40 itemList='<uu5json\/>\[\{"children":"A"\}\]'/);
  assert.deepEqual(tree.report.fn, { "itemList[].onClick": 1 });
});

test("only the chosen components (by ordinal), in the order of the file", () => {
  const a = el(Text, { "data-uu5-src": "4" }, "druhý"), b = el(Text, { "data-uu5-src": "2" }, "první");
  const root = rootOf(el("div", {}, a, b));
  const tree = collectUu5Tree({ rootFiber: root, styleRules: [], ordinals: [4, 2, 9] });
  assert.equal(toUu5String(tree).text, "<uu5string/>\n<Uu5Elements.Text>první</Uu5Elements.Text>\n<Uu5Elements.Text>druhý</Uu5Elements.Text>\n");
  assert.deepEqual(tree.missing, [9]);
});

test("an element rendered by .map gives every rendered copy", () => {
  const items = ["A", "B"].map((x) => el(Text, { "data-uu5-src": "5", key: x }, x));
  const tree = collectUu5Tree({ rootFiber: rootOf(el("div", {}, items)), styleRules: [], ordinals: [5] });
  assert.equal(toUu5String(tree).text, "<uu5string/>\n<Uu5Elements.Text>A</Uu5Elements.Text>\n<Uu5Elements.Text>B</Uu5Elements.Text>\n");
});

test("text with inline elements stays on one line; adjacent texts merge", () => {
  const Icon = named("Uu5Elements.Icon");
  const root = rootOf(el(Text, {}, el(Icon, { icon: "mdi-check" }), " ", "bez DPH"));
  assert.equal(toUu5String(collectUu5Tree({ rootFiber: root, styleRules: [] })).text, `<uu5string/>\n<Uu5Elements.Text><Uu5Elements.Icon icon="mdi-check"/>&nbsp;bez DPH</Uu5Elements.Text>\n`);
});

test("quoting picks the quotes the value does not contain", () => {
  assert.equal(quote("a"), `"a"`);
  assert.equal(quote(`say "hi"`), `'say "hi"'`);
  assert.equal(quote(`it's "x"`), `"it's \\"x\\""`);
});

test("notes stay empty for a clean screen, collectCode is a valid expression", () => {
  assert.deepEqual(notesOf({}), []);
  assert.doesNotThrow(() => new Function(`return ${collectCode([3, "5"])}`));
  assert.match(collectCode([3]), /\{"ordinals":\[3\]\}\)$/);
});

test("a space next to a tag is kept as &nbsp; (document parsers trim text at tags)", () => {
  const root = rootOf(el(Text, {}, "Zbývá ", el("span", { style: { color: "red" } }, "7 míst"), " za akční cenu"));
  assert.equal(toUu5String(collectUu5Tree({ rootFiber: root, styleRules: [] })).text, `<uu5string/>\n<Uu5Elements.Text>Zbývá&nbsp;<span style='<uu5json/>{"color":"red"}'>7 míst</span>&nbsp;za akční cenu</Uu5Elements.Text>\n`);
  const lead = rootOf(el(Text, {}, " ", "bez DPH"));
  assert.equal(toUu5String(collectUu5Tree({ rootFiber: lead, styleRules: [] })).text, "<uu5string/>\n<Uu5Elements.Text>&nbsp;bez DPH</Uu5Elements.Text>\n");
});
