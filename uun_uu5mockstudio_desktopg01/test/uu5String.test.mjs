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
  assert.deepEqual(tree.report.cssLost, []);
  assert.equal(tree.report.hover, 1);
  assert.match(notes.join(" "), /hover style/);
});

test("rules inside a matching @media win over the base rule (!important keeps its weight), a non-matching one is ignored", () => {
  const root = rootOf(el("div", { className: "links" }, "a"));
  const styleRules = [
    { selector: ".links", cssText: "display: none !important;" },
    { selector: ".links", cssText: "display: flex !important;", media: "(min-width: 1100px)" },
    { selector: ".links", cssText: "gap: 4px;", media: "(max-width: 600px)" },
  ];
  const wide = toUu5String(collectUu5Tree({ rootFiber: root, styleRules, mediaMatches: (t) => t.includes("min-width") })).text;
  assert.match(wide, /"display":"flex"/);
  assert.doesNotMatch(wide, /gap/);
  const narrow = toUu5String(collectUu5Tree({ rootFiber: root, styleRules, mediaMatches: () => false })).text;
  assert.match(narrow, /"display":"none"/);
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

test("icons newer than the Material Design Icons of documents are noted", () => {
  const Icon = named("Uu5Elements.Icon");
  const Button = named("Uu5Elements.Button");
  const root = rootOf(el("div", {}, el(Icon, { icon: "mdi-brain" }), el(Icon, { icon: "mdi-strategy" }), el(Button, { itemList: [{ icon: "mdi-rocket-launch-outline" }] })));
  const r = toUu5String(collectUu5Tree({ rootFiber: root, styleRules: [] }));
  assert.deepEqual(r.stats.icons, ["mdi-brain", "mdi-rocket-launch-outline", "mdi-strategy"]);
  const note = r.notes.find((n) => n.startsWith("Icons"));
  assert.match(note, /mdi-rocket-launch-outline, mdi-strategy/);
  assert.doesNotMatch(note, /mdi-brain/);
});

test("descendant rules and inherited colours are resolved against the real DOM, so text keeps its colour", () => {
  const rootDom = { computed: { color: "rgb(0, 0, 0)" }, matches: () => false };
  const heroDom = { computed: { color: "rgb(255, 255, 255)" }, parentElement: rootDom, matches: (s) => s === ".hero" };
  const h1Dom = { computed: { color: "rgb(255, 255, 255)", fontSize: "56px" }, parentElement: heroDom, matches: (s) => s === ".hero h1" };
  const pDom = { computed: { color: "rgb(200, 200, 255)" }, parentElement: heroDom, matches: (s) => s === ".hero p" };
  const root = rootOf(el("div", { className: "hero" }, el("h1", {}, "Title"), el("p", { className: "lead" }, "Text")));
  const hero = root.child, h1 = hero.child, p = h1.sibling;
  hero.stateNode = heroDom; h1.stateNode = h1Dom; p.stateNode = pDom;
  const tree = collectUu5Tree({
    rootFiber: root, computed: (d) => d.computed,
    styleRules: [{ selector: ".hero h1", cssText: "font-size: var(--title);" }, { selector: ".hero p", cssText: "color: rgba(255,255,255,.8);" }, { selector: ".hero h1:hover", cssText: "opacity: .5;" }],
  });
  const { text } = toUu5String(tree);
  assert.match(text, /<div style='<uu5json\/>\{"color":"rgb\(255, 255, 255\)"\}'>/); // inherited from nothing above: written once
  assert.match(text, /<h1 style='<uu5json\/>\{"fontSize":"56px"\}'>Title<\/h1>/); // var() replaced by the computed value, no colour repeated
  assert.match(text, /<p style='<uu5json\/>\{"color":"rgba\(255,255,255,.8\)"\}'>Text<\/p>/);
  assert.deepEqual(tree.report.cssLost.sort(), [".hero h1:hover", ".lead"]);
});

test("a component of the screen that is not rendered (an inactive tab) is called for its elements; one that needs hooks is reported", () => {
  const Item = named("Uu5Bricks.Tabs.Item");
  const Tab = function Tab(p) { return el("div", {}, el(Text, {}, p.title), el(Inner, {})); };
  const Inner = function Inner() { return [el("span", {}, "a"), el("span", {}, "b")]; };
  const Hooky = function Hooky() { throw new TypeError("Cannot read properties of null (reading 'useState')"); };
  const root = rootOf(el("div", {}, el(Item, { label: "T" }, el(Tab, { title: "Hello" })), el(Item, { label: "H" }, el(Hooky, {}))));
  root.child.child.child = null; root.child.child.sibling.child = null; // the library did not render the content of the tabs
  const tree = collectUu5Tree({ rootFiber: root, styleRules: [] });
  const { text } = toUu5String(tree);
  assert.match(text, /<Uu5Bricks\.Tabs\.Item label="T">\s*<div>\s*<Uu5Elements\.Text>Hello<\/Uu5Elements\.Text>\s*<span>a<\/span>\s*<span>b<\/span>\s*<\/div>\s*<\/Uu5Bricks\.Tabs\.Item>/);
  assert.deepEqual(tree.report.unresolved, { Hooky: 1 });
});

test("a gradient or dark background in the style of a div moves into Uu5Bricks.Background (radius kept); glass, light, text-clip and buttons stay", () => {
  const div = (st) => ({ host: true, name: "div", props: { style: { $json: st } }, children: [{ t: "text", v: "x" }] });
  const tree = { nodes: [
    div({ background: "radial-gradient(1200px 600px at 85% -10%, #7c3aed 0%, transparent 60%), #0b1026", borderRadius: 32, padding: 4 }),
    div({ background: "#0b1026" }),
    div({ background: "rgba(255, 255, 255, 0.07)" }),
    div({ background: "rgb(255, 255, 255)" }),
    div({ background: "linear-gradient(90deg, #a5b4fc, #fdba74) text" }),
    { t: "el", name: "Uu5Elements.Button", props: { style: { $json: { background: "#002882" } } }, children: [{ t: "text", v: "Go" }] },
  ], report: {} };
  const { text, stats, notes } = toUu5String(tree);
  assert.match(text, /<Uu5Bricks\.Background gradient="radial-gradient\([^"]*#0b1026" margin=0 borderRadius="none" style='<uu5json\/>\{"borderRadius":32,"overflow":"hidden"\}'>/);
  assert.match(text, /<Uu5Bricks\.Background color="#0b1026" margin=0 borderRadius="none">/);
  assert.match(text, /"background":"rgba\(255, 255, 255, 0\.07\)"/);
  assert.match(text, /"background":"rgb\(255, 255, 255\)"/);
  assert.match(text, /\) text"/);
  assert.match(text, /<Uu5Elements\.Button style='<uu5json\/>\{"background":"#002882"\}'>Go/);
  assert.doesNotMatch(text, /full"/);
  assert.equal(stats.backgrounds, 2);
  assert.match(notes.join(" "), /Uu5Bricks\.Background/);
});

test("var(--…) in styles (class rules, inline, gradients) is written as its value, never as a variable", () => {
  const vars = { "--brand-black": "#000000", "--brand-blue": "#0057b8", "--font": "Inter, sans-serif" };
  const render = new Map();
  const root = rootOf(el("div", { style: { background: "radial-gradient(circle at 80% 20%, var(--brand-blue) 0%, var(--brand-black) 55%)", fontFamily: "var(--font)", color: "var(--missing, #fff)" } }, "x"), render);
  const tree = collectUu5Tree({ rootFiber: root, styleRules: [], varLookup: (n) => vars[n] ?? "" });
  const { text } = toUu5String(tree);
  assert.doesNotMatch(text, /var\(/);
  assert.match(text, /radial-gradient\(circle at 80% 20%, #0057b8 0%, #000000 55%\)/);
  assert.match(text, /"fontFamily":"Inter, sans-serif"/);
  assert.match(text, /"color":"#fff"/);
});

test("a Card with a dark background becomes the Background (margin, radius) with its content padding in a div", () => {
  const card = { t: "el", name: "Uu5Bricks.Card", props: { card: "full", borderRadius: "expressive", margin: "0px", contentPadding: "32px", style: { $json: { background: "#000000", overflow: "hidden" } } }, children: [{ t: "text", v: "Hi" }] };
  const { text } = toUu5String({ nodes: [card], report: {} });
  assert.match(text, /<Uu5Bricks\.Background color="#000000" margin="0px" borderRadius="expressive">/);
  assert.match(text, /"padding":"32px","overflow":"hidden"/);
  assert.doesNotMatch(text, /Uu5Bricks\.Card/);
});
