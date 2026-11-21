import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strFromU8 } from "fflate";
import { componentsToBuild, packageFiles, gatherPackage, handoffSlug } from "../src/main/handoffPackage.mjs";
import { slashCommand, developerCommands, buildInstructions } from "../src/main/handoffCommand.mjs";
import { normalizeTree, propsFromText, propsToText, updateNode } from "../src/renderer/planTree.js";

const TREE = normalizeTree({
  name: "Screen: thesis", kind: "screen", children: [
    { name: "ThesisProvider", kind: "new", note: "loads the thesis", children: [
      { name: "ThesisHeader", kind: "new", target: "src/bricks/thesis/thesis-header.js", props: [{ name: "thesis", type: "object", required: true, desc: "the thesis" }, { name: "onEdit", type: "func" }], accept: ["shows the title", "objectives are visible"] },
      { name: "Uu5Elements.Block", kind: "library", children: [{ name: "ThesisHeader", kind: "new" }] },
    ] },
  ],
});

test("the components to build are the new nodes of the plan, each once, with every place it is used", () => {
  const c = componentsToBuild(TREE);
  assert.deepEqual(c.map((x) => x.name), ["ThesisProvider", "ThesisHeader"]);
  assert.deepEqual(c[1].used, ["Screen: thesis › ThesisProvider", "Screen: thesis › ThesisProvider › Uu5Elements.Block"]);
  assert.equal(c[1].target, "src/bricks/thesis/thesis-header.js");
  assert.equal(c[1].props.length, 2); assert.deepEqual(c[1].accept, ["shows the title", "objectives are visible"]);
  assert.deepEqual(componentsToBuild(null), []);
});

test("the package holds the spec, the task, the structured data with hashes, the mockups and the Claude Code command", () => {
  const html = new TextEncoder().encode("<html>thesis</html>");
  const { files, components, hashes } = packageFiles({
    slug: "thesis-header", project: "Theses", date: "2026-11-21", appVersion: "0.35.0", repo: "uu-theses",
    handoff: { project: "Theses", date: "2026-11-21", description: "", rules: "", repo: "uu-theses", screens: [] },
    plan: { slug: "p1", title: "Thesis header", text: "Objectives shown up front.", tree: TREE },
    mockups: { files: ["thesis.html"], entries: { "thesis.html": html, "assets/logo.png": new Uint8Array([1]) } },
    docs: { "PROJECT.md": new TextEncoder().encode("# P") }, shots: { "thesis.png": new Uint8Array([9]) },
  });
  const dir = ".uu5mock/handoff/thesis-header";
  for (const f of ["HANDOFF.md", "BUILD.md", "handoff.json", "mockups/thesis.html", "mockups/assets/logo.png", "mockups/index.html", "screens/thesis.png", "docs/PROJECT.md", "serve.mjs"]) assert.ok(files[`${dir}/${f}`], f);
  assert.ok(files[".claude/commands/build-handoff.md"]); assert.ok(files[`${dir}/PROMPT.md`]);
  const md = strFromU8(files[`${dir}/HANDOFF.md`]);
  assert.match(md, /## Components to build/); assert.match(md, /### `ThesisHeader`/); assert.match(md, /\| `thesis` \| object \| yes \|/); assert.match(md, /- \[ \] shows the title/);
  assert.match(md, /## Plan: Thesis header/); assert.match(md, /ThesisProvider \(loads the thesis\)/);
  const json = JSON.parse(strFromU8(files[`${dir}/handoff.json`]));
  assert.equal(json.format, "uu5mock-handoff/1"); assert.equal(json.components.length, 2);
  assert.equal(json.screens[0].hash, hashes["thesis.html"]); assert.equal(json.screens[0].picture, "screens/thesis.png");
  assert.match(strFromU8(files[`${dir}/BUILD.md`]), /`ThesisHeader`: \*\*create\*\* `src\/bricks\/thesis\/thesis-header\.js`/);
  assert.equal(components.length, 2);
});

test("the command and the instructions point to the package; the developer commands switch to the branch first", () => {
  assert.match(slashCommand(), /\.uu5mock\/handoff\/\$ARGUMENTS\//); assert.match(slashCommand(), /BUILD\.md/);
  assert.match(buildInstructions({ slug: "x", project: "P" }), /uu5-development/);
  assert.deepEqual(developerCommands({ branch: "feature/x", slug: "x" }), { claude: 'git switch feature/x && claude "/build-handoff x"', codex: 'git switch feature/x && codex "Read .uu5mock/handoff/x/BUILD.md and follow it exactly."' });
  assert.equal(handoffSlug("Hlavička předmětu – redesign"), "hlavicka-predmetu");
  assert.equal(handoffSlug("Plán jsem doplnil podle vašich odpovědí: karty budou vedle sebe"), "plan-jsem-doplnil-podle-vasich");
});

test("a project without an approved plan still gives a package of its screens", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-pkg-"));
  try {
    fs.copyFileSync(new URL("../src/main/templates/builtin/form/form.html", import.meta.url), path.join(dir, "form.html"));
    fs.mkdirSync(path.join(dir, "plans"));
    fs.writeFileSync(path.join(dir, "plans", "draft.md"), "---\ntitle: Draft\nstatus: draft\n---\n# Draft\n");
    const d = await gatherPackage(dir, { project: "Forms" });
    assert.equal(d.plan, null); assert.equal(d.slug, "forms");
    const { files } = packageFiles(d);
    assert.ok(files[".uu5mock/handoff/forms/mockups/form.html"]);
    fs.writeFileSync(path.join(dir, "plans", "ok.md"), `---\ntitle: Contact form\nstatus: approved\ncreated: 2026-11-20\n---\n# Contact form\n\nText.\n\n\`\`\`uu5-tree\n${JSON.stringify(TREE)}\n\`\`\`\n`);
    const d2 = await gatherPackage(dir, { project: "Forms" });
    assert.equal(d2.plan.title, "Contact form"); assert.equal(d2.slug, "thesis"); // named after the screen of its tree assert.equal(d2.plan.tree.children.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("props, file and acceptance criteria are kept by the plan's tree and edited as lines", () => {
  const props = propsFromText("thesis*: object — the thesis\nonEdit: func = undefined -- called on edit\n  \nnot valid line here\nlimit: number = 10");
  assert.deepEqual(props, [{ name: "thesis", type: "object", required: true, desc: "the thesis" }, { name: "onEdit", type: "func", default: "undefined", desc: "called on edit" }, { name: "limit", type: "number", default: "10" }]);
  assert.deepEqual(propsFromText(propsToText(props)), props);
  const t = updateNode(TREE, [0], { props: "a*: string", target: "../x.js", accept: "- one\n- two" });
  assert.deepEqual(t.children[0].props, [{ name: "a", type: "string", required: true }]);
  assert.equal(t.children[0].target, undefined); // outside the repository: dropped
  assert.deepEqual(t.children[0].accept, ["one", "two"]);
  assert.equal(normalizeTree({ name: "S", kind: "screen", children: [{ name: "C", kind: "new", target: "/abs/path.js" }] }).children[0].target, undefined);
});

test("the dialog's fields of a component go to every node of that name in the plan's tree", async () => {
  const { setComponentSpec } = await import("../src/renderer/planTree.js");
  const t = setComponentSpec(TREE, "ThesisHeader", { target: "src/x.js", props: "id*: string", accept: "loads\nshows" });
  const c = componentsToBuild(t).find((x) => x.name === "ThesisHeader");
  assert.equal(c.target, "src/x.js"); assert.deepEqual(c.props, [{ name: "id", type: "string", required: true }]); assert.deepEqual(c.accept, ["loads", "shows"]);
  assert.equal(t.children[0].children[1].children[0].target, "src/x.js"); // the second place of the same component
  assert.deepEqual(setComponentSpec(TREE, "Nope", { target: "a.js" }), TREE);
});

test("a helper of the mockup is not handed over: guessed from its name or note, or chosen in the dialog", async () => {
  const { planHandoffSlug } = await import("../src/main/handoffPackage.mjs");
  const tree = normalizeTree({ name: "Screen: course-detail", kind: "screen", children: [
    { name: "DemoStateSwitch", kind: "new", note: "Jen pro demo: přepíná varianty dat" },
    { name: "CourseOverview", kind: "new", props: [{ name: "course", type: "object" }] },
    { name: "LegendPanel", kind: "new", note: "simulated data", mockOnly: false },
    { name: "FakeLooking", kind: "new", mockOnly: true },
  ] });
  const c = componentsToBuild(tree);
  assert.deepEqual(c.map((x) => [x.name, x.mockOnly, x.guessed]), [["DemoStateSwitch", true, true], ["CourseOverview", false, false], ["LegendPanel", false, false], ["FakeLooking", true, false]]);
  const { files } = packageFiles({ slug: "s", project: "P", date: "d", handoff: { project: "P", date: "d", screens: [] }, plan: { slug: "p", title: "T", text: "", tree }, mockups: { files: [], entries: {} } });
  const md = strFromU8(files[".uu5mock/handoff/s/HANDOFF.md"]), build = strFromU8(files[".uu5mock/handoff/s/BUILD.md"]), json = JSON.parse(strFromU8(files[".uu5mock/handoff/s/handoff.json"]));
  assert.doesNotMatch(md.split("## Only in the mockup")[0], /### `DemoStateSwitch`/);
  assert.match(md, /## Only in the mockup \(do not build\)[\s\S]*`DemoStateSwitch`/);
  assert.match(build, /Do NOT build `DemoStateSwitch`, `FakeLooking`/);
  assert.deepEqual(json.components.map((x) => x.name), ["CourseOverview", "LegendPanel"]); assert.deepEqual(json.mockOnly, ["DemoStateSwitch", "FakeLooking"]);
  assert.equal(json.components[0].mockOnly, undefined);
  assert.equal(planHandoffSlug({ title: "Plán jsem doplnil podle vašich odpovědí", tree }, "P"), "course-detail"); // the screen names the branch
  assert.equal(planHandoffSlug(null, "My project"), "my-project");
});

test("a handoff of one screen holds only that screen and is named after it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-one-"));
  try {
    for (const n of ["form", "list"]) fs.copyFileSync(new URL(`../src/main/templates/builtin/${n}/${n}.html`, import.meta.url), path.join(dir, `${n}.html`));
    const d = await gatherPackage(dir, { project: "Two", only: ["list.html"] });
    assert.equal(d.slug, "list"); assert.deepEqual(d.mockups.files, ["list.html"]); assert.equal(d.mockups.entries["form.html"], undefined);
    assert.deepEqual(d.handoff.screens.map((s) => s.file), ["list.html"]);
    const { files } = packageFiles(d);
    assert.ok(files[".uu5mock/handoff/list/mockups/list.html"]); assert.equal(files[".uu5mock/handoff/list/mockups/form.html"], undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the task for the agent says in plain words what to change, create, remove and keep", async () => {
  const { handoffPrompt, workspaceCommands } = await import("../src/main/handoffCommand.mjs");
  const p = handoffPrompt({ slug: "header", title: "the screen header", asIs: "Header",
    components: [{ name: "Content", source: "src/course/header/content.js", why: "adds CourseGoals" }, { name: "CourseGoals", note: "the goals of the course", target: "src/course/header/course-goals.js" }, { name: "ObjectivesProvider", role: "provider", note: "loads the objectives" }],
    removed: [{ name: "OldBox", source: "src/old-box.js" }], unchanged: ["Header", "View"] });
  assert.match(p, /^Extend the component Header/);
  assert.match(p, /Change:\n- Content in `src\/course\/header\/content\.js`: it adds CourseGoals/);
  assert.match(p, /Create:\n- CourseGoals – the goals of the course → `src\/course\/header\/course-goals\.js`\n- ObjectivesProvider \(provider\) – loads the objectives/);
  assert.match(p, /Remove:\n- OldBox \(`src\/old-box\.js`\)/); assert.match(p, /Leave as it is: Header, View\./);
  assert.match(p, /\.uu5mock\/handoff\/header\/: read BUILD\.md first/);
  assert.doesNotMatch(p, /uu5mock-build/);
  const c = workspaceCommands({ path: "/r/repo-header", prompt: "it's done" });
  assert.equal(c.claude, "cd '/r/repo-header' && claude 'it'\\''s done'");
});
