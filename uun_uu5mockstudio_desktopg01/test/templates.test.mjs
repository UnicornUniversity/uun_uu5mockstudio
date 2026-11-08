import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import { parseTemplate, loadSource, loadPlugins, mergeSources, readTemplate, applyTemplate, templatePrompt, slugify, guessLevel, buildInstructions, saveTemplate, removeTemplate, readMine, mineDir } from "../src/main/templates.mjs";
import { tmp } from "./helpers.mjs";

async function make(root, id, manifest = {}, files = { "start.html": "<h1>x</h1>" }, md = "# Instructions") {
  const d = path.join(root, id); await mkdir(d, { recursive: true });
  await writeFile(path.join(d, "template.json"), JSON.stringify({ id, title: id, level: "component", ...manifest }));
  for (const [n, c] of Object.entries(files)) await writeFile(path.join(d, n), c);
  if (md) await writeFile(path.join(d, "TEMPLATE.md"), md);
  return d;
}

test("a template folder is read and checked", async () => {
  const root = await tmp("tpl");
  assert.equal((await parseTemplate(await make(root, "ok", { kind: "form", prompt: "Make a form" }), "mine")).template.kind, "form");
  assert.match((await parseTemplate(await make(root, "no-level", { level: "screen" }))).error, /level/);
  assert.match((await parseTemplate(await make(root, "Bad_Id", { id: "Bad_Id" }))).error, /kebab-case/);
  assert.match((await parseTemplate(await make(root, "evil", { files: ["../x.html"] }))).error, /unsafe/);
  assert.match((await parseTemplate(await make(root, "empty", {}, {}))).error, /no starter/);
  const big = await make(root, "big", {}, { "start.html": "x".repeat(600 * 1024) });
  assert.match((await parseTemplate(big)).error, /bigger/);
  const link = await make(root, "link", { files: ["start.html"] }, {}); await symlink("/etc/hosts", path.join(link, "start.html"));
  assert.match((await parseTemplate(link)).error, /plain file/);
});

test("sources are merged: a later source wins by id, sorted by level and order", async () => {
  const a = await tmp("tpl-a"), b = await tmp("tpl-b");
  await make(a, "form", { title: "Built-in form", order: 10 }); await make(a, "app-x", { level: "app", title: "App" });
  await make(b, "form", { title: "Team form", order: 10 });
  const merged = mergeSources([(await loadSource(a, "builtin")).templates, (await loadSource(b, "team")).templates]);
  assert.deepEqual(merged.map((t) => [t.id, t.title, t.source]), [["app-x", "App", "builtin"], ["form", "Team form", "team"]]);
});

test("plugins: their templates folder and the skeletons of uu5-mockup", async () => {
  const root = await tmp("tpl-plug"), inst = path.join(root, "p");
  await make(path.join(inst, "templates"), "own", { title: "Own" });
  const legacy = path.join(root, "m", "skills", "create-mockup", "assets", "templates"); await mkdir(legacy, { recursive: true });
  await writeFile(path.join(legacy, "form.html"), "<title>UuMockupKit Form Template</title><h1>f</h1>");
  const reg = path.join(root, "installed.json");
  await writeFile(reg, JSON.stringify({ plugins: { "other@mp": [{ installPath: inst }], "uu5-mockup@mp": [{ installPath: path.join(root, "m") }] } }));
  const r = await loadPlugins({ pluginsFile: reg });
  assert.deepEqual(r.templates.map((t) => [t.id, t.source, t.title]).sort(), [["own", "plugin:other", "Own"], ["uu5-mockup-form", "plugin:uu5-mockup", "Form"]]);
  const better = await tmp("tpl-better"); await make(better, "form", { kind: "form", title: "Better form" });
  assert.deepEqual(mergeSources([(await loadSource(better, "builtin")).templates, r.templates]).map((t) => t.id), ["form", "own"], "the bare skeleton is hidden where a template of the same kind exists");
  assert.deepEqual(mergeSources([r.templates]).map((t) => t.id), ["own", "uu5-mockup-form"]);
});

test("applying a template keeps the starter files as a reference for the agent, not as screens of the project", async () => {
  const root = await tmp("tpl-apply"), project = await tmp("tpl-proj");
  await writeFile(path.join(project, "start.html"), "mine");
  const t = (await parseTemplate(await make(root, "two", { level: "app" }, { "start.html": "<a/>", "other.html": "<b/>" }), "mine")).template;
  const r = await applyTemplate(await readTemplate(t), project);
  assert.deepEqual(r, { starter: ["other.html", "start.html"] });
  assert.equal(await readFile(path.join(project, "start.html"), "utf8"), "mine"); // nothing in the project folder is touched
  await assert.rejects(readFile(path.join(project, "other.html"), "utf8")); // and no sample screen appears on the canvas
  assert.equal(await readFile(path.join(project, ".studio", "template", "files", "other.html"), "utf8"), "<b/>");
  const meta = JSON.parse(await readFile(path.join(project, ".studio", "template", "template.json"), "utf8"));
  assert.equal(meta.id, "two"); assert.deepEqual(meta.files, ["other.html", "start.html"]);
  assert.match(await readFile(path.join(project, ".studio", "template", "TEMPLATE.md"), "utf8"), /Instructions/);
  assert.match(templatePrompt(meta), /Application template "two".*TEMPLATE\.md.*other\.html, start\.html.*\.studio\/template\/files/);
  assert.match(templatePrompt(meta), /not screens of this project/);
  assert.match(templatePrompt(meta), /Build exactly what the user asked for/);
  assert.equal(templatePrompt(null), "");
  assert.match(templatePrompt(meta), /every route has its own route header/i);
  assert.match(templatePrompt({ ...meta, level: "route" }), /one route \(uu5Route\).*route header/i);
  assert.doesNotMatch(templatePrompt({ ...meta, level: "component" }), /route header/i);
});

test("the built-in templates are all valid and cover the five levels", async () => {
  const { templates, errors } = await loadSource(path.resolve("src/main/templates/builtin"), "builtin");
  assert.deepEqual(errors, []);
  assert.deepEqual([...new Set(templates.map((t) => t.level))].sort(), ["app", "component", "page", "route", "web"]);
  for (const t of templates) assert.ok(t.hasInstructions && t.prompt, `${t.id} has instructions and a prompt`);
});

test("a Page template is made of Bricks only: every library it uses is a dependency of the page and imported, nothing of uu5g05-elements", async () => {
  const { templates } = await loadSource(path.resolve("src/main/templates/builtin"), "builtin");
  const pages = templates.filter((t) => t.level === "page");
  assert.deepEqual(pages.map((t) => t.id).sort(), ["page-news", "page-portal"]); // a Document: portal, news (home page, landing page and product detail are Web)
  for (const t of pages) {
    const html = await readFile(path.join(t.dir, t.files[0]), "utf8");
    const deps = JSON.parse(html.match(/var uu5DemoDependencies = (\{[^}]*\})/)[1].replace(/(\w[\w-]*)(?=\s*:)/g, (k) => `"${k}"`).replace(/""/g, '"'));
    const used = [...new Set([...html.matchAll(/<\/?(Uu5\w+)\./g)].map((m) => m[1]))];
    assert.ok(used.length && used.every((ns) => /Bricks$/.test(ns)), `${t.id} uses only Bricks: ${used}`);
    for (const ns of used) {
      const imp = html.match(new RegExp(`import \\* as ${ns} from "([\\w-]+)"`));
      assert.ok(imp, `${t.id} imports ${ns}`);
      assert.ok(deps[imp[1]], `${t.id} loads ${imp[1]}`);
    }
    assert.doesNotMatch(html, /className=|useState|onClick=/, `${t.id} has nothing that would not survive the uu5String`);
  }
});

test("the prompt of a Page names the uu5Bricks rules", () => {
  const p = templatePrompt({ id: "page-portal", title: "Portal", level: "page", files: ["portal.html"] });
  assert.match(p, /Document template "Portal"/);
  assert.match(p, /uu5bricks-knowledge/);
  assert.match(p, /uu5String/);
});

test("my templates: an id from the title and a guessed level", () => {
  assert.equal(slugify("Detail předmětu – ZS 2026"), "detail-predmetu-zs-2026");
  assert.equal(slugify("  ---  "), "");
  assert.equal(guessLevel(["<Uu5Bricks.Section><Uu5ChartsBricks.PieChart/></Uu5Bricks.Section>"]), "page");
  assert.equal(guessLevel(["<Plus4U5App.RouteHeader title='x'/><Uu5Elements.Block/>"]), "route");
  assert.equal(guessLevel(["<Uu5Elements.Block/>"]), "component");
  assert.equal(guessLevel(["<a/>", "<b/>"]), "app");
});

test("the instructions of a template made from screens carry the rules and the notes of the project", () => {
  const md = buildInstructions({ title: "Course detail", description: "A course page.", instructions: "Keep the hero.", rules: "# Business rules\n\nRules, constraints and decisions …\n\n## General\n\n- R1: prices in EUR\n", notes: [{ screen: "course.html", text: "The badge\nis green" }, { screen: "x.html", text: " " }], createdFrom: "Product (course.html)" });
  assert.match(md, /^# Course detail\n\nA course page\./);
  assert.match(md, /worked example/);
  assert.match(md, /## Instructions\n\nKeep the hero\./);
  assert.match(md, /## Rules of the project it was made in[\s\S]*R1: prices in EUR/);
  assert.match(md, /^### General$/m);
  assert.doesNotMatch(md, /Rules, constraints and decisions/);
  assert.match(md, /- course\.html: The badge is green/);
  assert.doesNotMatch(md, /x\.html/);
  assert.match(md, /_Made from Product \(course\.html\)\._/);
  assert.doesNotMatch(buildInstructions({ title: "T" }), /## (Instructions|Rules|Notes)/);
});

test("a template saved from screens is a valid template of my own: it is listed, applied, edited and deleted", async () => {
  const root = await tmp("tpl-mine");
  const t = { title: "Course detail", level: "page", kind: "product", description: "A course page.", prompt: "A course page", files: [{ name: "course-detail.html", html: "<Uu5Bricks.Section/>" }], instructions: "# Course detail\n" };
  const r = await saveTemplate(root, t);
  assert.equal(r.id, "course-detail");
  const { templates, errors } = await loadSource(root, "mine");
  assert.deepEqual(errors, []);
  assert.equal(templates[0].title, "Course detail"); assert.equal(templates[0].level, "page"); assert.equal(templates[0].kind, "product"); assert.deepEqual(templates[0].files, ["course-detail.html"]);
  assert.deepEqual(await saveTemplate(root, { ...t, title: "Other" , id: "course-detail" }), { exists: true, id: "course-detail", dir: path.join(root, "course-detail") }); // not replaced without asking
  await saveTemplate(root, { ...t, id: "course-detail", description: "Changed." }, { overwrite: true });
  const mine = await readMine(root, "course-detail");
  assert.equal(mine.description, "Changed."); assert.equal(mine.markdown, "# Course detail\n"); assert.equal(mine.dir, undefined);
  const project = await tmp("tpl-mine-proj");
  await applyTemplate(await readTemplate(templates[0]), project);
  assert.equal(await readFile(path.join(project, ".studio", "template", "files", "course-detail.html"), "utf8"), "<Uu5Bricks.Section/>");
  await removeTemplate(root, "course-detail");
  assert.equal(mineDir(root, "course-detail"), null);
  await assert.rejects(removeTemplate(root, "../etc"), /not one of yours/);
});

test("saving refuses what a template may not contain", async () => {
  const root = await tmp("tpl-bad"), ok = { title: "T", level: "component", files: [{ name: "a.html", html: "x" }] };
  await assert.rejects(saveTemplate(root, { ...ok, id: "Bad Id" }), /kebab-case/);
  await assert.rejects(saveTemplate(root, { ...ok, level: "screen" }), /level/);
  await assert.rejects(saveTemplate(root, { ...ok, title: " " }), /title/);
  await assert.rejects(saveTemplate(root, { ...ok, files: [] }), /at least one/);
  await assert.rejects(saveTemplate(root, { ...ok, files: [{ name: "../a.html", html: "x" }] }), /Unsafe/);
  await assert.rejects(saveTemplate(root, { ...ok, files: [{ name: "a.html", html: "x".repeat(600 * 1024) }] }), /bigger/);
});

test("a Web template is a whole page: its own navigation and footer, no Bricks, no application components", async () => {
  const { templates } = await loadSource(path.resolve("src/main/templates/builtin"), "builtin");
  const web = templates.filter((t) => t.level === "web");
  assert.deepEqual(web.map((t) => t.id).sort(), ["web-home", "web-landing", "web-page", "web-product"]);
  for (const t of web) {
    const html = await readFile(path.join(t.dir, t.files[0]), "utf8");
    assert.match(html, /className="nav"/, `${t.id} has a navigation bar`);
    assert.match(html, /className="foot"/, `${t.id} has a footer`);
    assert.match(html, /@media \(max-width/, `${t.id} is responsive`);
    assert.doesNotMatch(html, /Uu5Bricks|Uu5Elements\.(Block|Button)|Uu5Forms/, `${t.id} looks like a web site, not an application or a document`);
  }
  assert.match(templatePrompt({ id: "web-home", title: "Home page", level: "web", files: ["home.html"] }), /Web template "Home page".*whole page of a web site/s);
});
