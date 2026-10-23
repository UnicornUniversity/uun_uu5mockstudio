import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import { parseTemplate, loadSource, loadPlugins, mergeSources, readTemplate, applyTemplate, templatePrompt } from "../src/main/templates.mjs";
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
  assert.match((await parseTemplate(await make(root, "no-level", { level: "page" }))).error, /level/);
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

test("applying a template copies the starter files without overwriting and keeps the instructions", async () => {
  const root = await tmp("tpl-apply"), project = await tmp("tpl-proj");
  await writeFile(path.join(project, "start.html"), "mine");
  const t = (await parseTemplate(await make(root, "two", { level: "app" }, { "start.html": "<a/>", "other.html": "<b/>" }), "mine")).template;
  const r = await applyTemplate(await readTemplate(t), project);
  assert.deepEqual(r, { written: ["other.html"], skipped: ["start.html"] });
  assert.equal(await readFile(path.join(project, "start.html"), "utf8"), "mine");
  const meta = JSON.parse(await readFile(path.join(project, ".studio", "template", "template.json"), "utf8"));
  assert.equal(meta.id, "two"); assert.deepEqual(meta.written, ["other.html"]);
  assert.match(await readFile(path.join(project, ".studio", "template", "TEMPLATE.md"), "utf8"), /Instructions/);
  assert.match(templatePrompt(meta), /Application template "two".*other\.html.*TEMPLATE\.md/);
  assert.equal(templatePrompt(null), "");
  assert.match(templatePrompt(meta), /every route has its own route header/i);
  assert.match(templatePrompt({ ...meta, level: "route" }), /one route \(uu5Route\).*route header/i);
  assert.doesNotMatch(templatePrompt({ ...meta, level: "component" }), /route header/i);
});

test("the built-in templates are all valid and cover the three levels", async () => {
  const { templates, errors } = await loadSource(path.resolve("src/main/templates/builtin"), "builtin");
  assert.deepEqual(errors, []);
  assert.deepEqual([...new Set(templates.map((t) => t.level))].sort(), ["app", "component", "route"]);
  for (const t of templates) assert.ok(t.hasInstructions && t.prompt, `${t.id} has instructions and a prompt`);
});
