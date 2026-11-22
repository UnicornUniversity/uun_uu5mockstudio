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

test("the list tells what waits in a project: draft plans and open comments", async () => {
  const { root, projects } = await setup();
  const dir = path.join(root, "alfa");
  await mkdir(path.join(dir, "plans"), { recursive: true });
  await writeFile(path.join(dir, "plans", "a.md"), "---\ntitle: A\nstatus: draft\n---\nx");
  await writeFile(path.join(dir, "plans", "b.md"), "---\ntitle: B\nstatus: approved\n---\nx");
  await writeFile(path.join(dir, "s.html"), "<p>s</p>");
  await writeFile(path.join(dir, "s.comments.json"), JSON.stringify([{ text: "one", status: "open" }, { text: "two", status: "resolved" }]));
  const p = (await projects.list()).find((x) => x.name === "alfa");
  assert.equal(p.plans, 1); assert.equal(p.comments, 1);
});

test("the list also counts notes, variants not chosen yet and comments in the sitemap", async () => {
  const { root, projects } = await setup();
  const dir = path.join(root, "beta2");
  await mkdir(dir, { recursive: true });
  for (const f of ["room.html", "room-b.html", "alone-b.html"]) await writeFile(path.join(dir, f), "<p>x</p>");
  await writeFile(path.join(dir, "room.notes.md"), "# Notes: room\n\n<!-- note n1aaa -->\nfirst\n\n<!-- note n2bbb -->\nsecond\n");
  await writeFile(path.join(dir, "sitemap.json"), JSON.stringify({ title: "Site", children: [{ title: "Home", comment: "make it shorter" }, { title: "About" }] }));
  const p = (await projects.list()).find((x) => x.name === "beta2");
  assert.equal(p.variants, 1); // alone-b.html has no original: not a variant
  assert.equal(p.notes, 2);
  assert.equal(p.mapComments, 1);
});

test("a projects folder closed to the app lists no projects instead of failing the start", async () => {
  const os = await import("node:os"), fs = await import("node:fs/promises");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "closed-")), root = path.join(dir, "projects");
  await mkdir(root); await fs.chmod(root, 0o000);
  try { assert.deepEqual(await createProjects(root, { trash: async () => {} }).list(), []); } finally { await fs.chmod(root, 0o755); }
});

test("a project says when it waits for a handoff: ready (repo, something to hand over, none yet) or outdated (screens changed since)", async () => {
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path"), { createHash } = await import("node:crypto");
  const { createProjects } = await import("../src/main/projects.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hof-")), dir = path.join(root, "P");
  try {
    fs.mkdirSync(path.join(dir, ".studio"), { recursive: true }); fs.mkdirSync(path.join(dir, "plans"));
    fs.writeFileSync(path.join(dir, "a.html"), "<html>a</html>");
    fs.writeFileSync(path.join(dir, "plans", "x.md"), "---\ntitle: X (as is)\nstatus: approved\nbaseline: src/x.js\n---\n# X\n");
    const projects = createProjects(root, { trash: async () => {} });
    const st = (o) => fs.writeFileSync(path.join(dir, ".studio", "state.json"), JSON.stringify(o));
    st({}); assert.equal((await projects.list())[0].handoff, null); // no repository
    st({ repo: { path: "/r" } }); assert.equal((await projects.list())[0].handoff, "ready");
    const h = createHash("sha256").update("<html>a</html>").digest("hex").slice(0, 16);
    st({ repo: { path: "/r" }, handoffs: [{ slug: "x", hashes: { "a.html": h } }] }); assert.equal((await projects.list())[0].handoff, null);
    fs.writeFileSync(path.join(dir, "a.html"), "<html>changed</html>"); assert.equal((await projects.list())[0].handoff, "outdated");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a new project has an empty PROJECT.md, so a sentence under a screen's heading in the rules is not taken for its description", async () => {
  const { projects, root } = await setup();
  await projects.create("Nova");
  assert.equal(await readFile(path.join(root, "Nova", "PROJECT.md"), "utf8"), "");
  const { migrateDescriptions } = await import("../src/main/rules.mjs");
  await writeFile(path.join(root, "Nova", "BUSINESS_RULES.md"), "# Business rules\n\n## Screen: header\n\nCurrent behaviour of header.js (as is).\n\n- R-001 (screen: header) A rule.\n");
  assert.equal(await migrateDescriptions(path.join(root, "Nova")), false);
  assert.match(await readFile(path.join(root, "Nova", "BUSINESS_RULES.md"), "utf8"), /Current behaviour/); // left where the agent wrote it
});
