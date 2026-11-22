import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asIsTree, asIsOutline } from "../src/main/componentTree.mjs";
import { treeDelta, deltaLines, deltaSize, planUpdate, updateBrief } from "../src/main/componentUpdate.mjs";

const find = (n, name) => (n.name === name ? n : (n.children ?? []).map((c) => find(c, name)).find(Boolean) ?? null);
const count = (n, name) => (n.name === name ? 1 : 0) + (n.children ?? []).reduce((s, c) => s + count(c, name), 0);

test("JSX passed through a split of props and spread into a component is read once, where it is spread", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uu5upd-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/header.js"), `import { createVisualComponent } from "uu5g05";
import { ArtifactLink } from "uu_tg01-elements";
export const Header = createVisualComponent({ render(props) { return <ArtifactLink href="#">{props.name}</ArtifactLink>; } });
export default Header;`);
  fs.writeFileSync(path.join(dir, "src/view.js"), `import { createVisualComponent } from "uu5g05";
import { ContentContainer } from "uu_plus4u5g02-elements";
import Header from "./header.js";
const View = createVisualComponent({ render(props) {
  const { containerProps, componentProps } = ContentContainer.splitProps(props, { title: <Header />, subtitle: "x" });
  const { significance, colorScheme } = containerProps;
  return <ContentContainer {...containerProps} areaView={{ containerProps: { significance, colorScheme } }}>{() => <div {...componentProps} />}</ContentContainer>;
} });
export default View;`);
  const { tree } = asIsTree(dir, "src/view.js");
  const cc = find(tree, "Plus4U5Elements.ContentContainer");
  assert.deepEqual(cc.children.map((c) => c.name), ["Header"]);
  assert.equal(count(tree, "Header"), 1); // not again for significance, colorScheme or the sibling spread of componentProps
  assert.equal(find(tree, "UuTElements.ArtifactLink").kind, "library");
  fs.rmSync(dir, { recursive: true, force: true });
});

const before = { name: "Card", kind: "existing", role: "visual", props: [{ name: "title", type: "string" }], children: [
  { name: "useCourse", kind: "existing", role: "hook" },
  { name: "Plus4U5Elements.ContentContainer", kind: "library", children: [{ name: "Uu5Elements.Text", kind: "library" }, { name: "Uu5Elements.Badge", kind: "library", render: "open" }] },
  { name: "Body", kind: "existing", role: "visual", source: "src/body.js" },
] };
const after = { name: "Card", kind: "existing", role: "visual", props: [{ name: "title", type: "string" }, { name: "code", type: "string" }], children: [
  { name: "useCourse", kind: "existing", role: "hook" },
  { name: "useDataList", kind: "library", role: "data" },
  { name: "Plus4U5Elements.ContentContainer", kind: "library", children: [{ name: "Header", kind: "existing", role: "visual", source: "src/header.js", children: [{ name: "UuTElements.ArtifactLink", kind: "library" }] }, { name: "Uu5Elements.Text", kind: "library", render: "!loading" }] },
  { name: "Body", kind: "existing", role: "visual", source: "src/body.js" },
] };

test("the difference of two readings of the code: added, removed and changed parts, the drawn ones first", () => {
  const d = treeDelta(before, after);
  assert.deepEqual(d.added.map((x) => x.path.join(" › ")), ["Card › useDataList", "Card › Plus4U5Elements.ContentContainer › Header"]);
  assert.deepEqual(d.removed.map((x) => x.node.name), ["Uu5Elements.Badge"]);
  assert.deepEqual(d.changed.map((x) => [x.node.name, x.what]), [["Card", ["new props: code"]], ["Uu5Elements.Text", ["shown when !loading"]]]);
  const lines = deltaLines(d);
  assert.match(lines[0], /^\+ Header added in Card › Plus4U5Elements.ContentContainer — src\/header.js$/); // visual first
  assert.match(lines[1], /UuTElements.ArtifactLink/); // with what it contains
  assert.ok(lines.some((l) => /^\+ useDataList \(data loading\) added in Card$/.test(l)));
  assert.ok(lines.includes("- Uu5Elements.Badge removed from Card › Plus4U5Elements.ContentContainer"));
  assert.equal(deltaSize(treeDelta(after, JSON.parse(JSON.stringify(after)))), 0);
});

test("the task keeps the user's changes: the difference, the parts the screen added, and both trees", () => {
  const screenTree = { name: "card", kind: "new", children: [{ name: "Card", kind: "existing", children: [
    { name: "Plus4U5Elements.ContentContainer", kind: "library", children: [{ name: "Uu5Elements.Text", kind: "library" }, { name: "Uu5Elements.Badge", kind: "library" }] },
    { name: "Body", kind: "existing", children: [{ name: "CourseNotes", kind: "new" }] },
  ] }] };
  const u = planUpdate({ before, after, screenTree, html: "" });
  assert.equal(u.upToDate, false);
  assert.deepEqual(u.additions, ["CourseNotes in Card › Body"]);
  const brief = updateBrief({ name: "Card", file: "src/card.js", screen: "card.html", before, after, delta: u.delta, libs: u.libs, additions: u.additions });
  assert.match(brief, /^UPDATE FROM CODE: the screen `card.html`/);
  assert.match(brief, /\+ Header added in Card › Plus4U5Elements.ContentContainer/);
  assert.match(brief, /THE USER'S CHANGES MUST STAY[\s\S]*CourseNotes in Card › Body/);
  assert.match(brief, /Conflicts/);
  assert.match(brief, /"uu_tg01-elements": "0\.x"/); // the library of the new part is loaded for real
  assert.ok(brief.includes(asIsOutline(before)) && brief.includes(asIsOutline(after)));
  // without the reading the screen was made from, the agent compares the screen with the code itself
  assert.match(updateBrief({ name: "Card", file: "src/card.js", screen: "card.html", before, after, delta: u.delta, known: false }), /It is not known exactly from which reading/);
  // nothing new in the code and nothing drawn differently: up to date
  assert.equal(planUpdate({ before: after, after, screenTree: null, html: "" }).upToDate, true);
});

test("a project with screens of several existing components: each screen has its own, by its link, its name or what it draws", async () => {
  const { screenBaselines, baselinesWithScreens } = await import("../src/main/componentUpdate.mjs");
  const { baselinePrompt } = await import("../src/main/componentTree.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uu5base-"));
  const page = (body) => `<!doctype html><html><body><div id="uu5"></div><script type="text/babel">\nfunction Page() { return ${body}; }\n</script></body></html>`;
  fs.writeFileSync(path.join(dir, "header.html"), page("<Header />"));
  fs.writeFileSync(path.join(dir, "study-programmes.html"), page("<StudyProgrammes />"));
  fs.writeFileSync(path.join(dir, "placement.html"), page("<div><StudyProgrammes /></div>")); // another name, draws the component
  fs.writeFileSync(path.join(dir, "linked.html"), page("<div />"));
  fs.writeFileSync(path.join(dir, "other.html"), page("<div />"));
  fs.mkdirSync(path.join(dir, ".studio")); fs.writeFileSync(path.join(dir, ".studio", "state.json"), JSON.stringify({ screenBaselines: { "linked.html": "header-as-is" } }));
  const header = { slug: "header-as-is", file: "src/course/header.js", tree: { name: "Header", kind: "existing" } };
  const sp = { slug: "studyprogrammes-as-is", file: "src/course/study-programmes.js", tree: { name: "StudyProgrammes", kind: "existing" } };
  const map = await screenBaselines(dir, [header, sp]);
  assert.equal(map.get("header.html"), header); assert.equal(map.get("study-programmes.html"), sp);
  assert.equal(map.get("placement.html"), sp); assert.equal(map.get("linked.html"), header);
  assert.equal(map.get("other.html"), null); // not made from either
  const both = await baselinesWithScreens(dir, [header, sp]);
  assert.deepEqual(both.map((b) => b.screens.sort()), [["header.html", "linked.html"], ["placement.html", "study-programmes.html"]]);
  const p = baselinePrompt(both);
  assert.match(p, /^EXISTING COMPONENTS: this project has screens of 2 existing components/);
  assert.match(p, /— StudyProgrammes \(`src\/course\/study-programmes.js`, plans\/studyprogrammes-as-is.md\) – its screens: `placement.html`, `study-programmes.html`/);
  assert.doesNotMatch(p, /REDESIGN OF AN EXISTING COMPONENT/);
  fs.rmSync(dir, { recursive: true, force: true });
});
