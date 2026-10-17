import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { createProjects, sanitizeName, readState, writeState, DEFAULT_PROJECT } from "../src/main/projects.mjs";
import { resolveProjectsRoot } from "../src/main/paths.mjs";
import { tmp } from "./helpers.mjs";

const exists = (p) => access(p).then(() => true, () => false);
async function setup() {
  const trashed = [];
  const root = await tmp("projects");
  return { root, trashed, projects: createProjects(root, { trash: async (p) => void trashed.push(p) }) };
}

test("sanitizeName strips unsafe characters and rejects empty names", () => {
  assert.equal(sanitizeName("  Můj / projekt: 1  "), "Můj projekt 1");
  assert.equal(sanitizeName("../../etc"), "etc");
  assert.equal(sanitizeName(".hidden"), "hidden");
  assert.equal(sanitizeName("x".repeat(100)).length, 60);
  assert.throws(() => sanitizeName("  /// "), /must not be empty/);
  assert.throws(() => sanitizeName(undefined), /must not be empty/);
});

test("a project is a plain folder; every .html in it is a screen", async () => {
  const { projects, root } = await setup();
  assert.equal(await projects.create("Alfa"), "Alfa");
  assert.ok(await exists(path.join(root, "Alfa")));
  await writeFile(path.join(root, "Alfa", "a.html"), "x");
  await writeFile(path.join(root, "Alfa", "notes.txt"), "not a screen");
  const [p] = await projects.list();
  assert.equal(p.name, "Alfa"); assert.equal(p.screens, 1);
});

test("create refuses duplicates", async () => {
  const { projects } = await setup();
  await projects.create("Alfa");
  await assert.rejects(projects.create(" Alfa "), /already exists/);
});

test("list shows visible folders only, sorted, ignoring files and hidden folders", async () => {
  const { projects, root } = await setup();
  await projects.create("Beta"); await projects.create("alfa");
  await mkdir(path.join(root, ".trash")); await writeFile(path.join(root, "loose.html"), "x");
  assert.deepEqual((await projects.list()).map((p) => p.name), ["alfa", "Beta"]);
});

test("rename moves the folder and keeps its content", async () => {
  const { projects, root } = await setup();
  await projects.create("Alfa");
  await writeFile(path.join(root, "Alfa", "a.html"), "keep");
  assert.equal(await projects.rename("Alfa", "Gama"), "Gama");
  assert.equal(await readFile(path.join(root, "Gama", "a.html"), "utf8"), "keep");
  assert.ok(!(await exists(path.join(root, "Alfa"))));
  await projects.create("Delta");
  await assert.rejects(projects.rename("Gama", "Delta"), /already exists/);
  await assert.rejects(projects.rename("Nope", "X"), /does not exist/);
});

test("remove sends the folder to the trash instead of deleting it", async () => {
  const { projects, root, trashed } = await setup();
  await projects.create("Alfa");
  await projects.remove("Alfa");
  assert.deepEqual(trashed, [path.join(root, "Alfa")]);
  await assert.rejects(projects.remove("Nope"), /does not exist/);
});

test("ensure opens the preferred project, else the first, else creates a default one", async () => {
  const { projects } = await setup();
  assert.equal(await projects.ensure(), DEFAULT_PROJECT);
  await projects.create("Aaa");
  assert.equal(await projects.ensure("Neexistuje"), "Aaa");
  assert.equal(await projects.ensure(DEFAULT_PROJECT), DEFAULT_PROJECT);
});

test("migrateLegacy: single project kept directly in the root becomes a normal project", async () => {
  const { projects, root } = await setup();
  await mkdir(path.join(root, "mockups")); await mkdir(path.join(root, ".studio"));
  await writeFile(path.join(root, "mockups", "a.html"), "old"); await writeState(root, { sessionId: "s1" });
  assert.equal(await projects.migrateLegacy(root), true);
  assert.equal(await readFile(path.join(root, DEFAULT_PROJECT, "mockups", "a.html"), "utf8"), "old");
  assert.equal((await readState(path.join(root, DEFAULT_PROJECT))).sessionId, "s1");
  assert.equal(await projects.migrateLegacy(root), false, "idempotent");
});

test("migrateLegacy: separate legacy folder is moved under the root", async () => {
  const base = await tmp("legacy");
  const legacy = path.join(base, "project");
  await mkdir(path.join(legacy, "mockups"), { recursive: true });
  await writeFile(path.join(legacy, "mockups", "a.html"), "old");
  const projects = createProjects(path.join(base, "projects"), { trash: async () => {} });
  assert.equal(await projects.migrateLegacy(legacy), true);
  assert.equal(await readFile(path.join(base, "projects", DEFAULT_PROJECT, "mockups", "a.html"), "utf8"), "old");
  assert.ok(!(await exists(legacy)));
});

test("state is stored per project and merged by writeState", async () => {
  const { projects, root } = await setup();
  await projects.create("A"); await projects.create("B");
  await writeState(projects.dirOf("A"), { chat: [1] }); await writeState(projects.dirOf("A"), { sessionId: "x" });
  assert.deepEqual(await readState(projects.dirOf("A")), { chat: [1], sessionId: "x" });
  assert.deepEqual(await readState(projects.dirOf("B")), {});
  assert.ok(root);
});

test("projects root: dev, packaged and env override", () => {
  assert.deepEqual(resolveProjectsRoot({ isPackaged: false, documents: "/d", repoRoot: "/r" }), { root: "/r/projects", legacyDir: "/r/project" });
  assert.deepEqual(resolveProjectsRoot({ isPackaged: true, documents: "/d", repoRoot: "/r" }), { root: "/d/uu5Mock Studio", legacyDir: "/d/uu5Mock Studio" });
  assert.equal(resolveProjectsRoot({ isPackaged: true, documents: "/d", repoRoot: "/r", env: { STUDIO_PROJECTS_DIR: "/x" } }).root, "/x");
  assert.equal(resolveProjectsRoot({ isPackaged: true, documents: "/d", repoRoot: "/r", saved: "/mine" }).root, "/mine");
  assert.equal(resolveProjectsRoot({ isPackaged: true, documents: "/d", repoRoot: "/r", saved: "/mine", env: { STUDIO_PROJECTS_DIR: "/x" } }).root, "/x");
});

test("flattenAll moves screens out of the old mockups/ folder into the project", async () => {
  const { projects, root } = await setup();
  await mkdir(path.join(root, "P", "mockups"), { recursive: true }); await mkdir(path.join(root, "P", ".studio"));
  await writeFile(path.join(root, "P", "mockups", "a.html"), "A"); await writeFile(path.join(root, "P", "mockups", "b.html"), "B");
  await writeFile(path.join(root, "P", ".studio", "state.json"), "{}");
  assert.equal(await projects.flattenAll(), 2);
  assert.equal(await readFile(path.join(root, "P", "a.html"), "utf8"), "A");
  assert.ok(!(await exists(path.join(root, "P", "mockups"))));
  assert.ok(await exists(path.join(root, "P", ".studio", "state.json")));
  assert.equal(await projects.flattenAll(), 0, "idempotent");
});

test("flattenAll keeps both files when a name clashes", async () => {
  const { projects, root } = await setup();
  await mkdir(path.join(root, "P", "mockups"), { recursive: true });
  await writeFile(path.join(root, "P", "a.html"), "new"); await writeFile(path.join(root, "P", "mockups", "a.html"), "old");
  await projects.flattenAll();
  assert.equal(await readFile(path.join(root, "P", "a.html"), "utf8"), "new");
  assert.equal(await readFile(path.join(root, "P", "a-mockups.html"), "utf8"), "old");
});

test("legacy single project ends up as a flat default project (migrate + flatten)", async () => {
  const { projects, root } = await setup();
  await mkdir(path.join(root, "mockups")); await writeFile(path.join(root, "mockups", "a.html"), "old");
  await projects.migrateLegacy(root); await projects.flattenAll();
  assert.equal(await readFile(path.join(root, DEFAULT_PROJECT, "a.html"), "utf8"), "old");
  assert.deepEqual((await projects.list()).map((p) => p.name), [DEFAULT_PROJECT]);
});
