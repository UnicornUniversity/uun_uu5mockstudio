import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { asIsTree, asIsOutline, baselinePlan, screenBrief, screenNameOf, resolveImport } from "../src/main/componentTree.mjs";
import { parsePlan } from "../src/renderer/planDoc.js";
import { extractPlan, looksMockOnly } from "../src/renderer/planTree.js";
import { componentsToBuild } from "../src/main/handoffPackage.mjs";

const REPO = fileURLToPath(new URL("./fixtures/uu5repo", import.meta.url));
const FILE = "src/bricks/course/course-overview.js";
const find = (n, name) => (n.name === name ? n : (n.children ?? []).map((c) => find(c, name)).find(Boolean) ?? null);

test("the as-is tree of a component: what it renders, followed into its imports, and what it uses that is not visual", () => {
  const { tree, files } = asIsTree(REPO, FILE);
  assert.equal(tree.name, "CourseOverview"); assert.equal(tree.role, "visual"); assert.equal(tree.source, FILE);
  assert.deepEqual(tree.props.map((p) => p.name), ["courseId", "onEdit"]);
  assert.deepEqual(tree.children.slice(0, 3).map((c) => [c.name, c.role]), [["useCourse", "hook"], ["useDataList", "data"], ["CourseProvider", "provider"]]); // a createComponent named …Provider
  assert.equal(find(tree, "useCourse").source, "src/hooks/use-course.js");
  assert.match(find(tree, "useDataList").note, /handlers: load, create; calls: objectivesList, objectiveCreate/);
  assert.equal(find(tree, "CourseContext.Provider").role, "provider");
  const header = find(tree, "CourseHeader");
  assert.equal(header.source, "src/bricks/course/course-header.js"); assert.deepEqual(header.props.map((p) => p.name), ["course", "onEdit"]);
  assert.deepEqual(header.children.map((c) => c.name), ["Uu5Elements.Text", "Uu5Elements.Button"]); // the <div> is see-through
  const item = find(tree, "ObjectiveItem");
  assert.equal(item.relation, "1:N"); assert.match(item.render, /^not \(objectives\.state === "pending"\)$/);
  assert.equal(find(tree, "Uu5Elements.Modal").render, "open");
  assert.equal(find(tree, "useState"), null); // plain React hooks are left out
  assert.deepEqual(files.sort(), ["src/bricks/course/course-header.js", "src/bricks/course/course-overview.js", "src/bricks/course/course-provider.js", "src/hooks/use-course.js"]);
});

test("the depth is limited and a file without a component says so", () => {
  const { tree } = asIsTree(REPO, FILE, { depth: 0 });
  assert.equal(find(tree, "CourseHeader").children, undefined); // not followed into its file
  assert.throws(() => asIsTree(REPO, "src/calls.js"), /No component was found/);
  assert.throws(() => asIsTree(REPO, "src/missing.js"), /cannot be read/);
  assert.equal(resolveImport(REPO, FILE, "../../../../etc/passwd"), null);
  assert.equal(resolveImport(REPO, FILE, "./course-header"), "src/bricks/course/course-header.js");
});

test("the baseline plan keeps the real tree with roles and files, and hands nothing over to build", () => {
  const { tree, files } = asIsTree(REPO, FILE);
  const md = baselinePlan({ name: "CourseOverview", file: FILE, tree, files, date: "2026-11-21" });
  const p = parsePlan(md);
  assert.equal(p.meta.status, "approved"); assert.equal(p.meta.baseline, FILE);
  const t = extractPlan(p.body).tree;
  assert.equal(t.role, "visual"); assert.equal(find(t, "useDataList").role, "data"); assert.equal(find(t, "CourseHeader").source, "src/bricks/course/course-header.js");
  assert.deepEqual(componentsToBuild(t), []); // only existing and library nodes: nothing new yet
  assert.match(asIsOutline(tree), /CourseProvider \(provider\) — src\/bricks\/course\/course-provider\.js/);
});

test("the agent's task names the visual components to keep and the non-visual ones to fake", () => {
  const { tree, files } = asIsTree(REPO, FILE);
  const b = screenBrief({ name: "CourseOverview", file: FILE, files, tree, screen: screenNameOf("CourseOverview"), root: "/repo" });
  assert.match(b, /`course-overview\.html`/); assert.match(b, /`\/repo\/src\/bricks\/course\/course-header\.js`/);
  assert.match(b, /exactly like the real visual components \(CourseOverview, CourseHeader, ObjectiveItem\)/);
  assert.match(b, /non-visual parts \(useCourse, useDataList, CourseProvider, CourseContext\.Provider\)/);
  assert.match(b, /CourseOverviewMockData/);
  assert.equal(screenNameOf("UuCourse.CourseOverview"), "uu-course-course-overview");
  assert.equal(looksMockOnly({ name: "CourseOverviewMockData" }), true); // the fake data the task asks for is never handed over
});

test("a redesign planned against the baseline hands over what changes: modified, new (also non-visual) and removed parts", async () => {
  const { packageFiles } = await import("../src/main/handoffPackage.mjs");
  const { strFromU8 } = await import("fflate");
  const { normalizeTree } = await import("../src/renderer/planTree.js");
  const tree = normalizeTree({ name: "CourseOverview", kind: "existing", role: "visual", source: FILE, change: "modify", note: "objectives up front", props: [{ name: "courseId", type: "string", required: true }, { name: "objectives", type: "array" }], accept: ["objectives visible"], children: [
    { name: "useCourse", kind: "existing", role: "hook", source: "src/hooks/use-course.js", change: "keep" },
    { name: "CourseObjectivesProvider", kind: "new", role: "provider", change: "add", note: "loads the objectives (Calls.objectivesList)" },
    { name: "CourseHeader", kind: "existing", role: "visual", source: "src/bricks/course/course-header.js", change: "keep" },
    { name: "ObjectiveItem", kind: "existing", role: "visual", source: FILE, change: "remove" },
    { name: "CourseOverviewMockData", kind: "new", note: "mockup only" },
  ] });
  const c = componentsToBuild(tree);
  assert.deepEqual(c.map((x) => [x.name, x.role ?? null, Boolean(x.remove), x.mockOnly]), [["CourseOverview", "visual", false, false], ["CourseObjectivesProvider", "provider", false, false], ["ObjectiveItem", "visual", true, false], ["CourseOverviewMockData", null, false, true]]);
  const { files } = packageFiles({ slug: "s", project: "P", date: "d", handoff: { project: "P", date: "d", screens: [] }, plan: { slug: "p", title: "T", text: "", tree }, mockups: { files: [], entries: {} } });
  const md = strFromU8(files[".uu5mock/handoff/s/HANDOFF.md"]), build = strFromU8(files[".uu5mock/handoff/s/BUILD.md"]), json = JSON.parse(strFromU8(files[".uu5mock/handoff/s/handoff.json"]));
  assert.match(md, /### `CourseObjectivesProvider`[\s\S]*\*\*Role:\*\* provider/);
  assert.match(md, /## To remove[\s\S]*`ObjectiveItem`/);
  assert.doesNotMatch(md, /### `useCourse`/); // keep: context only
  assert.match(build, /`CourseObjectivesProvider` \(non-visual: provider\)/); assert.match(build, /Remove `ObjectiveItem`/); assert.match(build, /non-visual parts of the plan/);
  assert.deepEqual(json.components.map((x) => [x.name, x.mode]), [["CourseOverview", "modify"], ["CourseObjectivesProvider", "new"], ["ObjectiveItem", "remove"]]);
});

test("the agent of a redesign project plans against the baseline and keeps the mockup visual", async () => {
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
  const { readBaselines, baselinePrompt } = await import("../src/main/componentTree.mjs");
  const { agentInstructions } = await import("../src/main/claudeService.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-"));
  try {
    const { tree, files } = asIsTree(REPO, FILE);
    fs.mkdirSync(path.join(dir, "plans")); fs.writeFileSync(path.join(dir, "plans", "courseoverview-as-is.md"), baselinePlan({ name: "CourseOverview", file: FILE, tree, files, date: "2026-11-21" }));
    const b = await readBaselines(dir);
    assert.equal(b.length, 1); assert.equal(b[0].file, FILE);
    const p = baselinePrompt(b, { plan: true });
    assert.match(p, /plans\/courseoverview-as-is\.md/); assert.match(p, /"change": "keep"/); assert.match(p, /a new provider, hook or data loading is a node of the tree too/);
    assert.match(baselinePrompt(b), /never built in the mockup/);
    assert.equal(baselinePrompt([]), "");
    const { instructions } = await agentInstructions({ cwd: dir, urlBase: "http://x", repoDir: null }, { plan: true });
    assert.match(instructions, /REDESIGN OF AN EXISTING COMPONENT/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const SCREEN = `<!doctype html><html><body><div id="root"></div><script type="text/babel">
const Uu5Elements = window.Uu5Elements;
function DemoStateSwitch({ onChange }) { return <div>demo</div>; }
function CourseHeader({ course }) { return <Uu5Elements.Text>{course.name}</Uu5Elements.Text>; }
function CourseGoals({ goals }) { return <Uu5Elements.Grid>{goals.map((g) => <Uu5Elements.Box key={g}>{g}</Uu5Elements.Box>)}</Uu5Elements.Grid>; }
function CourseOverview({ course }) { return <Uu5Elements.Block><CourseHeader course={course} /><CourseGoals goals={course.goals} /></Uu5Elements.Block>; }
function CourseOverviewMockData() { return <CourseOverview course={{ name: "A", goals: ["x"] }} />; }
function Page() { return <Uu5Elements.Box><DemoStateSwitch onChange={() => {}} /><CourseOverviewMockData /></Uu5Elements.Box>; }
ReactDOM.createRoot(document.getElementById("root")).render(<Uu5Elements.AlertBus><Page /></Uu5Elements.AlertBus>);
</script></body></html>`;

test("a screen made from an existing component is compared with its baseline: its parts change, keep or go, the rest is new", async () => {
  const { redesignComponents } = await import("../src/main/handoffPackage.mjs");
  const { tree } = asIsTree(REPO, FILE);
  const by = (list) => Object.fromEntries(list.map((c) => [c.name, c]));
  const c = by(redesignComponents([{ file: "course-overview.html", html: SCREEN }], tree, {}));
  assert.equal(c.CourseOverview.source, FILE); assert.equal(c.CourseOverview.keep, undefined); assert.equal(c.CourseOverview.baseline, true); // in the screen: Modify
  assert.equal(c.CourseHeader.source, "src/bricks/course/course-header.js");
  assert.equal(c.CourseGoals.baseline, undefined); assert.equal(c.CourseGoals.mockOnly, false); // not in the baseline: new
  assert.equal(c.DemoStateSwitch.mockOnly, true); assert.equal(c.CourseOverviewMockData.mockOnly, true); assert.equal(c.Page.mockOnly, true);
  assert.equal(c.ObjectiveItem.keep, true); assert.equal(c.CourseProvider.keep, true); // the rest of the baseline: unchanged
  assert.equal(c.useCourse.keep, true); assert.equal(c.useCourse.role, "hook");
  const chosen = by(redesignComponents([{ file: "course-overview.html", html: SCREEN }], tree, { CourseHeader: { keep: true }, ObjectiveItem: { remove: true } }));
  assert.equal(chosen.CourseHeader.keep, true); assert.equal(chosen.ObjectiveItem.remove, true);
});

test("the component tree of a screen is the component itself: no page shell, demo switches or fake data", async () => {
  const { structureOf } = await import("../src/main/jsxSource.mjs");
  const { normalizeTree, componentView, countNodes } = await import("../src/renderer/planTree.js");
  const full = normalizeTree(structureOf(SCREEN, "course-overview"));
  const names = (n) => [n.name, ...(n.children ?? []).flatMap(names)];
  const v = componentView(full, { focus: ["CourseOverview"] });
  assert.equal(v.name, "CourseOverview");
  assert.deepEqual(names(v), ["CourseOverview", "Uu5Elements.Block", "CourseHeader", "Uu5Elements.Text", "CourseGoals", "Uu5Elements.Grid", "Uu5Elements.Box"]);
  const plain = componentView(full, {});
  assert.ok(!names(plain).some((n) => /DemoStateSwitch|MockData|^Page$|AlertBus/.test(n)));
  assert.equal(componentView(full, { helpers: true }), full);
  assert.ok(countNodes(v) < countNodes(full));
});

test("a new component modelled on an existing one: the reference plan, the agent's task and its rules", async () => {
  const { referencePlan, referenceBrief, referencePrompt, readReferences } = await import("../src/main/componentTree.mjs");
  const { pascal } = await import("../src/renderer/componentStartDialog.js");
  const { tree, files } = asIsTree(REPO, FILE);
  const md = referencePlan({ name: "CourseSummary", refName: "CourseOverview", file: FILE, tree, files, description: "a compact summary", date: "2026-11-22" });
  const p = parsePlan(md);
  assert.equal(p.meta.reference, FILE); assert.equal(p.meta.component, "CourseSummary"); assert.equal(p.meta.baseline, undefined);
  const b = referenceBrief({ name: "CourseSummary", refName: "CourseOverview", file: FILE, files, tree, screen: screenNameOf("CourseSummary") });
  assert.match(b, /NEW component CourseSummary/); assert.match(b, /`course-summary\.html`/); assert.match(b, /CourseSummaryMockData/);
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ref-"));
  try {
    fs.mkdirSync(path.join(dir, "plans")); fs.writeFileSync(path.join(dir, "plans", "ref.md"), md);
    const refs = await readReferences(dir);
    assert.equal(refs[0].component, "CourseSummary");
    assert.match(referencePrompt(refs, { plan: true }), /nodes of kind "new" with their "role"/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(pascal("course summary card"), "CourseSummaryCard"); assert.equal(pascal("CourseSummary"), "CourseSummary");
});

test("a component of uuOpenBusinessBrickKit: render props, an early return and the providers and loaders of libraries are followed", () => {
  const REPO = fileURLToPath(new URL("./fixtures/brickrepo", import.meta.url));
  const { tree, files } = asIsTree(REPO, "src/course/header.js");
  const path = (names) => names.reduce((n, name) => n?.children?.find((c) => c.name === name), { children: [tree] });
  assert.deepEqual(tree.children.map((c) => [c.name, c.role ?? null, c.render ?? null]), [["useSubApp", "hook", null], ["useBusinessBrick", "hook", null], ["Uu5Elements.HighlightedBox", null, "isMissing"], ["OpenBusinessBrickKit.Loader", "data", "not (isMissing)"]]);
  const view = path(["Header", "OpenBusinessBrickKit.Loader", "DataObjectStateResolver", "TagSetProvider", "Shape.Provider", "OpenBusinessBrick.OpenBusinessBrickLoader", "Shape.Provider", "ProgressProvider", "View"]);
  assert.ok(view, "View is reached through the render props");
  assert.equal(view.source, "src/course/header/view.js");
  assert.equal(path(["Header", "OpenBusinessBrickKit.Loader", "DataObjectStateResolver"]).role, "component");
  assert.equal(path(["Header", "OpenBusinessBrickKit.Loader", "DataObjectStateResolver", "TagSetProvider"]).role, "provider");
  assert.equal(path(["Header", "OpenBusinessBrickKit.Loader", "DataObjectStateResolver", "TagSetProvider", "Shape.Provider"]).kind, "library");
  assert.deepEqual(view.children.map((c) => [c.name, c.kind]), [["useShape", "library"], ["Uu5Elements.Block", "library"]]);
  assert.ok(files.includes("src/course/header/content.js"));
});

test("the real structure: the code's tree, the screen's visual content in it with the new parts, no simulated states", async () => {
  const { normalizeTree, componentView, realStructure } = await import("../src/renderer/planTree.js");
  const { structureOf } = await import("../src/main/jsxSource.mjs");
  const REPO = fileURLToPath(new URL("./fixtures/brickrepo", import.meta.url));
  const base = normalizeTree(asIsTree(REPO, "src/course/header.js").tree);
  const screen = `<script type="text/babel">
const Uu5Elements = window.Uu5Elements;
function DemoStateSwitch() { return <div />; }
function CourseGoals() { return <Uu5Elements.Grid />; }
function Content() { return <Uu5Elements.Box><CourseGoals /></Uu5Elements.Box>; }
function View() { return <Uu5Elements.Block><Content /></Uu5Elements.Block>; }
function Header({ state }) { if (state === "loading") return <Uu5Elements.Pending />; return <View />; }
function Page() { return <div><DemoStateSwitch /><Header state="ready" /></div>; }
ReactDOM.createRoot(document.getElementById("root")).render(<Page />);
</script>`;
  const scr = componentView(normalizeTree(structureOf(screen, "header")), { focus: ["Header"] });
  const real = realStructure(base, scr);
  const names = (n) => [n.name, ...(n.children ?? []).flatMap(names)];
  const all = names(real);
  assert.ok(all.includes("TagSetProvider") && all.includes("OpenBusinessBrickKit.Loader") && all.includes("useSubApp")); // the non-visual parts of the code
  assert.ok(!all.includes("DemoStateSwitch") && !real.children.some((c) => c.name === "Uu5Elements.Pending")); // what the mockup only simulates (the Pending of the code's SectionsModal stays)
  const find = (n, name) => (n.name === name ? n : (n.children ?? []).map((c) => find(c, name)).find(Boolean) ?? null);
  assert.equal(find(real, "CourseGoals").change, "add"); assert.equal(find(real, "CourseGoals").kind, "new");
  assert.equal(find(real, "Content").source, "src/course/header/content.js");
  assert.equal(find(real, "View").children[0].name, "useShape"); // its hooks stay from the code
  assert.equal(realStructure(null, scr), null);
});

test("a component made by a higher-order function is followed into what it wraps", () => {
  const REPO = fileURLToPath(new URL("./fixtures/brickrepo", import.meta.url));
  const { tree } = asIsTree(REPO, "src/course/header/sections-modal.js");
  const list = find(tree, "DraggableList");
  assert.equal(list.kind, "existing"); assert.equal(list.note, "Uu5DnD.withDroppableItemList(ScrollableBox, DraggableListItem)");
  assert.deepEqual(list.children.map((c) => c.name), ["Uu5Elements.ScrollableBox", "DraggableListItem"]);
  assert.equal(list.children[1].note, "Uu5DnD.withDraggable(ListItem)"); assert.equal(list.children[1].children[0].name, "Uu5Elements.ListItem");
  assert.equal(list.render, 'tabCode === "a"');
});

test("a part of the existing component is Modify only when its own content on the screen has something its code has not", async () => {
  const { redesignComponents, directContent } = await import("../src/main/handoffPackage.mjs");
  const { normalizeTree } = await import("../src/renderer/planTree.js");
  const REPO = fileURLToPath(new URL("./fixtures/brickrepo", import.meta.url));
  const base = normalizeTree(asIsTree(REPO, "src/course/header.js").tree);
  const screen = `<script type="text/babel">
import Uu5Elements from "uu5g05-elements";
function DemoStateSwitch() { return <div />; }
function CourseGoals() { return <Uu5Elements.Grid />; }
function Content() { return <Uu5Elements.Box><Uu5Elements.Grid><Uu5Elements.InfoItem /><CourseGoals /></Uu5Elements.Grid></Uu5Elements.Box>; }
function View() { return <Uu5Elements.Block><Content /><SectionsModal /><Uu5Elements.Dialog /></Uu5Elements.Block>; }
function SectionsModal() { return <Uu5Elements.Modal />; }
function Header({ state }) { if (state === "loading") return <Uu5Elements.Pending />; return <View />; }
function HeaderMockData() { return <Header state="ready" />; }
function Page() { return <div><DemoStateSwitch /><HeaderMockData /></div>; }
ReactDOM.createRoot(document.getElementById("root")).render(<Page />);
</script>`;
  const by = Object.fromEntries(redesignComponents([{ file: "header.html", html: screen }], base, {}).map((c) => [c.name, c]));
  assert.equal(by.Header.keep, true); // what the mockup simulates (Pending) and the wrappers of the code do not make it a change
  assert.equal(by.View.keep, true);
  assert.equal(by.Content.keep, undefined); assert.equal(by.Content.why, "adds CourseGoals");
  assert.equal(by.CourseGoals.baseline, undefined);
  assert.deepEqual([...directContent(base.children.find((c) => c.name === "OpenBusinessBrickKit.Loader"), { ownOnly: true })], ["View"]); // through the loaders and providers
});

test("the real structure keeps the code's own content: a library component the mockup draws with a stand-in is no change", async () => {
  const { normalizeTree, componentView, realStructure } = await import("../src/renderer/planTree.js");
  const { structureOf } = await import("../src/main/jsxSource.mjs");
  const REPO = fileURLToPath(new URL("./fixtures/brickrepo", import.meta.url));
  const base = normalizeTree(asIsTree(REPO, "src/course/header.js").tree);
  const screen = `<script type="text/babel">
import Uu5Elements from "uu5g05-elements";
function CourseGoals() { return <Uu5Elements.Grid />; }
function Content() { return <Uu5Elements.Tile><Uu5Elements.Text /><CourseGoals /></Uu5Elements.Tile>; }
function View() { return <Uu5Elements.Panel><Content /></Uu5Elements.Panel>; }
function Header() { return <View />; }
ReactDOM.createRoot(document.getElementById("root")).render(<Header />);
</script>`;
  const real = realStructure(base, componentView(normalizeTree(structureOf(screen, "header")), { focus: ["Header"] }));
  const names = (n) => [n.name, ...(n.children ?? []).flatMap(names)];
  const all = names(real);
  assert.ok(all.includes("Uu5Elements.Block") && all.includes("Uu5Elements.InfoItem"), "the code's content stays");
  assert.ok(!all.includes("Uu5Elements.Panel") && !all.includes("Uu5Elements.Tile"), "the mockup's stand-ins do not replace it");
  const content = find(real, "Content");
  assert.deepEqual(content.children.map((c) => [c.name, c.change ?? null]), [["Uu5Elements.Box", null], ["CourseGoals", "add"]]);
});

test("only the changes: what changes with all inside it, and the way from the root to it", async () => {
  const { changesOnly, normalizeTree } = await import("../src/renderer/planTree.js");
  const t = normalizeTree({ name: "Header", kind: "existing", children: [
    { name: "useSubApp", kind: "library", role: "hook" },
    { name: "Loader", kind: "library", role: "data", children: [{ name: "View", kind: "existing", children: [
      { name: "EditModal", kind: "existing" },
      { name: "Content", kind: "existing", children: [{ name: "ScrollableBox", kind: "library" }, { name: "CourseGoals", kind: "new", change: "add", children: [{ name: "Card", kind: "new" }] }] },
    ] }] },
  ] });
  const names = (n) => [n.name, ...(n.children ?? []).flatMap(names)];
  assert.deepEqual(names(changesOnly(t, { squash: false })), ["Header", "Loader", "View", "Content", "CourseGoals", "Card"]);
  const deep = normalizeTree({ name: "H", kind: "existing", children: [{ name: "L", kind: "library", role: "data", children: [{ name: "P", kind: "library", role: "provider", children: [{ name: "Q", kind: "existing", role: "provider", children: [{ name: "V", kind: "existing", children: [{ name: "N", kind: "new", change: "add" }] }] }] }] }] });
  const sq = changesOnly(deep);
  assert.deepEqual(names(sq), ["H", "3 wrappers", "V", "N"]); assert.equal(sq.children[0].note, "L › P › Q");
  assert.equal(changesOnly(normalizeTree({ name: "A", kind: "existing", children: [{ name: "B", kind: "existing" }] })), null);
});

test("library components keep their documented names, and the agent is told to use them for real – Plus4U included; only the app shell is a stand-in", async () => {
  const { libraryName, libraryRule } = await import("../src/main/componentTree.mjs");
  assert.equal(libraryName("StateBadge", { from: "uu_plus4u5g02-elements", imported: "StateBadge" }), "Plus4U5Elements.StateBadge");
  assert.equal(libraryName("Elements.Badge", { from: "uu5g05-elements", imported: "default" }), "Uu5Elements.Badge");
  assert.equal(libraryName("Uu5Elements.Block", { from: "uu5g05-elements", imported: "*" }), "Uu5Elements.Block");
  assert.equal(libraryName("Shape.Provider", { from: "uu_editablestructuredcontentg02-core", imported: "Shape" }), "Shape.Provider"); // not a library of the mockups: as written
  const tree = { name: "Header", kind: "existing", children: [{ name: "Plus4U5Elements.StateBadge", kind: "library" }, { name: "Uu5Elements.Box", kind: "library" }, { name: "OpenBusinessBrickKit.Loader", kind: "library", role: "data" }] };
  const rule = libraryRule(tree);
  assert.match(rule, /use exactly the ones the code uses \(Plus4U5Elements\.StateBadge, Uu5Elements\.Box\)/);
  assert.match(rule, /add "uu_plus4u5g02-elements": "1\.x" and "uu_plus4u5g02": "1\.x" to uu5DemoDependencies with `import Plus4U5Elements from "uu_plus4u5g02-elements";`/);
  assert.match(rule, /overrides the rule of the uu5-mockup skill/); assert.doesNotMatch(rule, /stand-in/);
  const shell = libraryRule({ name: "X", kind: "existing", children: [{ name: "Plus4U5App.RouteHeader", kind: "library" }, { name: "UuTForms.FormArtifactSelect", kind: "library" }] });
  assert.match(shell, /`const Plus4U5App = \{ RouteHeader: \(props\) => … \};` and `const UuTForms = \{ FormArtifactSelect: \(props\) => … \};`/);
  assert.doesNotMatch(rule, /OpenBusinessBrickKit/); // data loading is not drawn
  assert.equal(libraryRule({ name: "X", kind: "existing", children: [{ name: "Uu5Elements.Box", kind: "library" }] }).includes("stand-in"), false);
  const { screenBrief } = await import("../src/main/componentTree.mjs");
  assert.match(screenBrief({ name: "Header", file: "h.js", files: ["h.js"], tree, screen: "header" }), /Load their libraries for real/);
});

test("JSX kept in consts of the render, in props and in helper functions of the file is followed", async () => {
  const { asIsTree } = await import("../src/main/componentTree.mjs");
  const REPO = fileURLToPath(new URL("./fixtures/brickrepo", import.meta.url));
  const { tree } = asIsTree(REPO, "src/course/header/badge-panel.js");
  const box = tree.children.find((c) => c.name === "Uu5Elements.Box");
  assert.deepEqual(box.children.map((c) => [c.name, c.render ?? null]), [["Plus4U5Elements.StateBadge", "data.stateIcon"], ["Uu5Elements.Grid", null]]); // header={stateBadge}, then {children}
  const grid = box.children[1];
  assert.deepEqual(grid.children.map((c) => c.name), ["Plus4U5Elements.StateBadge", "Uu5Elements.InfoItem"]);
  const names = (n) => [n.name, ...(n.children ?? []).flatMap(names)];
  assert.ok(names(tree).includes("Plus4U5Elements.PersonItem")); // from buildItemList(…)
});

test("the exceptions of a screen against the code: stand-ins, equivalents, look-alikes, parts not drawn", async () => {
  const { standInsOf, libraryDeviations, deviationLines, libraryRule } = await import("../src/main/componentTree.mjs");
  const html = `<script type="text/babel">
import Uu5Elements from "uu5g05-elements";
// mockup stand-in of uu_plus4u5g02-elements
const Plus4U5Elements = {
  StateBadge: ({ icon, children }) => <Uu5Elements.Badge icon={icon}>{children}</Uu5Elements.Badge>,
  PersonItem(props) { return <Uu5Elements.Text>{props.name}</Uu5Elements.Text>; },
};
function Header() { return <Uu5Elements.Block><Plus4U5Elements.StateBadge icon="x" /><Uu5Elements.Tag /></Uu5Elements.Block>; }
</script>`;
  assert.deepEqual(standInsOf(html), ["Plus4U5Elements.StateBadge", "Plus4U5Elements.PersonItem"]);
  const code = { name: "Header", kind: "existing", children: [{ name: "Plus4U5Elements.ContentContainer", kind: "library", children: [{ name: "Plus4U5Elements.StateBadge", kind: "library" }, { name: "Uu5Elements.Modal", kind: "library" }, { name: "Uu5Elements.Link", kind: "library" }] }, { name: "Shape.Provider", kind: "library", role: "provider" }] };
  const screen = { name: "Header", kind: "existing", children: [{ name: "Uu5Elements.Block", kind: "library", children: [{ name: "Plus4U5Elements.StateBadge", kind: "library" }, { name: "Uu5Elements.Tag", kind: "library" }] }] };
  const d = libraryDeviations(code, screen, html);
  assert.deepEqual(d, { standIns: ["Plus4U5Elements.StateBadge"], drawnAs: [["Plus4U5Elements.ContentContainer", "Uu5Elements.Block"]], notInCode: ["Uu5Elements.Tag"], notOnScreen: ["Uu5Elements.Modal", "Uu5Elements.Link"] });
  const lines = deviationLines(d, { origin: "Header in the code" });
  assert.equal(lines.length, 4);
  assert.match(lines[1], /Plus4U5Elements\.ContentContainer as Uu5Elements\.Block/);
  assert.match(lines[2], /Not used by Header in the code: Uu5Elements\.Tag/);
  assert.equal(libraryDeviations(code, screen, html, { kind: "reference" }).notOnScreen.length, 0); // a new component need not draw all of its reference
  assert.deepEqual(deviationLines({ standIns: [], drawnAs: [], notInCode: [], notOnScreen: [] }), []);
  assert.match(libraryRule(code, { plan: true, who: "the reference" }), /in the uu5-tree use the ones the reference uses[\s\S]*Plus4U5Elements\.ContentContainer/);
});

test("the handoff package lists the exceptions of the mockups", async () => {
  const { packageFiles } = await import("../src/main/handoffPackage.mjs");
  const { strFromU8 } = await import("fflate");
  const files = packageFiles({ slug: "h", project: "P", date: "2026-11-21", components: [], handoff: { project: "P", screens: [], rules: [] }, exceptions: [{ file: "header.html", origin: "Header in the code", lines: ["Drawn with an equivalent: Plus4U5Elements.ContentContainer as Uu5Elements.Block."] }], mockups: { files: [], entries: {} }, docs: { files: [], entries: {} }, shots: {} }).files;
  const md = strFromU8(files[".uu5mock/handoff/h/HANDOFF.md"]);
  assert.match(md, /## Exceptions in the mockups[\s\S]*### header\.html\n\n- Drawn with an equivalent: Plus4U5Elements\.ContentContainer as Uu5Elements\.Block\./);
});
