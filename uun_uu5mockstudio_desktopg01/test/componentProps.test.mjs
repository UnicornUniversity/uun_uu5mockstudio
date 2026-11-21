import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strFromU8 } from "fflate";
import { mockupComponents, repoComponentProps, propsDiff, suggestSource, typeOfAttr } from "../src/main/componentProps.mjs";
import { screenComponents, withRepo, packageFiles } from "../src/main/handoffPackage.mjs";
import { saveLink, readLinks } from "../src/main/handoffLinks.mjs";

const MOCK = `<!doctype html><html><body><div id="root"></div><script type="text/babel">
const { createVisualComponent } = Uu5g05; const Uu5Elements = window.Uu5Elements;
function DemoStateSwitch({ variant, onChange }) { return <div>demo</div>; }
const CourseOverview = createVisualComponent({ uu5Tag: "CourseOverview", render(props) { const { course, objectives } = props; return <Uu5Elements.Block header={course.name}>{props.size}</Uu5Elements.Block>; } });
function Page() { const [v, setV] = React.useState("a"); return <div><DemoStateSwitch variant={v} onChange={(x) => setV(x)} /><CourseOverview course={{ name: "Algebra" }} objectives={["a"]} size="m" /></div>; }
ReactDOM.createRoot(document.getElementById("root")).render(<Page />);
</script></body></html>`;

test("the components of a mockup come with the props they get and destructure", () => {
  const c = mockupComponents(MOCK, "course");
  const by = Object.fromEntries(c.map((x) => [x.name, x]));
  assert.deepEqual(Object.keys(by).sort(), ["CourseOverview", "DemoStateSwitch", "Page"]);
  assert.deepEqual(by.CourseOverview.props, [{ name: "course", type: "object" }, { name: "objectives", type: "array" }, { name: "size", type: "string" }]);
  assert.deepEqual(by.DemoStateSwitch.props, [{ name: "variant" }, { name: "onChange", type: "func" }]);
  assert.equal(typeOfAttr({ name: "onSave", type: "code", code: "save" }), "func");
});

const REPO = `import { createVisualComponent, PropTypes } from "uu5g05";
const CourseOverview = createVisualComponent({ uu5Tag: "UuCourse.CourseOverview", propTypes: { course: PropTypes.object.isRequired, onEdit: PropTypes.func, size: PropTypes.oneOf(["s", "m"]) }, defaultProps: { size: "m" }, render(props) { return null; } });
export default CourseOverview;`;

test("an existing component of the repository: its declared props and what the redesign changes", () => {
  const cur = repoComponentProps(REPO);
  assert.deepEqual(cur, [{ name: "course", type: "object", required: true }, { name: "onEdit", type: "func" }, { name: "size", type: 'oneOf(["s", "m"])', default: '"m"' }]);
  const d = propsDiff(cur, [{ name: "course", type: "object", required: true }, { name: "objectives", type: "array" }, { name: "size", type: 'oneOf(["s", "m"])', default: '"l"' }]);
  assert.deepEqual(d.added.map((p) => p.name), ["objectives"]); assert.deepEqual(d.removed.map((p) => p.name), ["onEdit"]); assert.deepEqual(d.changed.map((x) => x.name), ["size"]);
  assert.deepEqual(repoComponentProps("const X = () => null;"), []);
  assert.deepEqual(suggestSource("CourseOverview", ["src/a/course-overview.js", "src/a/course-overview-list.js", "test/course-overview.test.js"]), ["src/a/course-overview.js", "src/a/course-overview-list.js"]);
});

test("without a plan the mockup's components are handed over: links say new, modify or mockup only, and a modify shows the change", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "links-")), repo = fs.mkdtempSync(path.join(os.tmpdir(), "links-repo-"));
  try {
    fs.mkdirSync(path.join(repo, "src/bricks"), { recursive: true }); fs.writeFileSync(path.join(repo, "src/bricks/course-overview.js"), REPO);
    saveLink(proj, "CourseOverview", { source: "src/bricks/course-overview.js", accept: "objectives are visible", props: "course*: object\nobjectives: array — the expected outcomes\nsize: oneOf([\"s\", \"m\"]) = \"m\"" });
    saveLink(proj, "DemoStateSwitch", {}); // nothing chosen: guessed
    assert.equal(readLinks(proj).CourseOverview.source, "src/bricks/course-overview.js");
    const comps = withRepo(screenComponents([{ file: "course.html", html: MOCK }], readLinks(proj)), repo);
    const by = Object.fromEntries(comps.map((c) => [c.name, c]));
    assert.equal(by.DemoStateSwitch.mockOnly, true); assert.equal(by.Page.mockOnly, true); assert.equal(by.CourseOverview.mockOnly, false);
    assert.deepEqual(by.CourseOverview.diff.added.map((p) => p.name), ["objectives"]); assert.deepEqual(by.CourseOverview.diff.removed.map((p) => p.name), ["onEdit"]);
    const { files } = packageFiles({ slug: "s", project: "P", date: "d", handoff: { project: "P", date: "d", screens: [] }, plan: null, components: comps, mockups: { files: [], entries: {} } });
    const md = strFromU8(files[".uu5mock/handoff/s/HANDOFF.md"]), build = strFromU8(files[".uu5mock/handoff/s/BUILD.md"]), json = JSON.parse(strFromU8(files[".uu5mock/handoff/s/handoff.json"]));
    assert.match(md, /Change the existing component:\*\* `src\/bricks\/course-overview\.js`/); assert.match(md, /\*\*Add\*\* `objectives`/); assert.match(md, /\*\*Remove\*\* `onEdit`/);
    assert.match(build, /`CourseOverview`: \*\*modify\*\* the existing `src\/bricks\/course-overview\.js`/);
    assert.equal(json.components[0].mode, "modify"); assert.ok(json.components[0].sourceHash);
    // a path outside the repository is never read
    assert.equal(withRepo([{ name: "X", source: "../../etc/passwd", props: [] }], repo)[0].sourceMissing, true);
  } finally { fs.rmSync(proj, { recursive: true, force: true }); fs.rmSync(repo, { recursive: true, force: true }); }
});

test("the file picker of the repository starts from the words of the name and puts code first, tests last", async () => {
  const { wordsOf, rankFiles } = await import("../src/renderer/repoFilePicker.js");
  assert.equal(wordsOf("CourseOverview"), "course overview"); assert.equal(wordsOf("UuCourse.HeaderV2"), "uu course header v2");
  assert.deepEqual(rankFiles(["src/a.test.js", "README.md", "src/b.js", "src/c.jsx"]), ["src/b.js", "src/c.jsx", "README.md", "src/a.test.js"]);
});
