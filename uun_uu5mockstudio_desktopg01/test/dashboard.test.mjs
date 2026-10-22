import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile, utimes, stat } from "node:fs/promises";
import { ago, newProjectName } from "../src/renderer/dashboard.js";
import { createThumbs, framesOf } from "../src/main/thumbs.mjs";
import { createProjects } from "../src/main/projects.mjs";
import { tmp } from "./helpers.mjs";

test("a new project gets a neutral, unique name", () => {
  assert.equal(newProjectName([]), "New project");
  assert.equal(newProjectName(["new project", "New project 2"]), "New project 3");
});

test("ago", () => {
  const now = 1_000_000_000_000;
  assert.equal(ago(now - 5000, now), "just now");
  assert.equal(ago(now - 5 * 60000, now), "5 min ago");
  assert.equal(ago(now - 3 * 3600000, now), "3 hours ago");
  assert.equal(ago(now - 30 * 3600000, now), "yesterday");
  assert.equal(ago(now - 5 * 86400000, now), "5 days ago");
});

test("framesOf follows the saved layout and flows new screens to the right", () => {
  const f = framesOf(["a.html", "b.html", "c.html"], { "a.html": { x: 0, y: 0, device: "mobile" }, "c.html": { x: 5, y: 7, device: "custom", w: 300, h: 200 } });
  assert.deepEqual(f.map((x) => [x.file, x.x, x.y, x.w, x.h]), [["a.html", 0, 0, 390, 844], ["b.html", 510, 0, 1440, 900], ["c.html", 5, 7, 300, 200]]);
});

test("the picture of a project is its whole canvas and is made again only when a screen or the layout changes", async () => {
  const root = await tmp("thumbs");
  const projects = createProjects(root, { trash: async () => {} });
  await projects.create("A"); await projects.create("Empty");
  await writeFile(path.join(root, "A", "one.html"), "<h1>1</h1>"); await writeFile(path.join(root, "A", "two.html"), "<h1>2</h1>");
  const seen = [];
  const thumbs = createThumbs({ projects, port: 1234, render: async (html, count) => { seen.push({ html, count }); return Buffer.from("jpg"); } });
  assert.match(await thumbs.get("A"), /^data:image\/jpeg;base64,/);
  assert.equal(seen[0].count, 2);
  assert.ok(seen[0].html.includes("http://127.0.0.1:1234/A/one.html") && seen[0].html.includes("http://127.0.0.1:1234/A/two.html"), "every screen is in the picture");
  await thumbs.get("A"); assert.equal(seen.length, 1, "cached");
  await mkdir(path.join(root, "A", ".studio"), { recursive: true });
  await writeFile(path.join(root, "A", ".studio", "state.json"), JSON.stringify({ layout: { frames: { "two.html": { x: 0, y: 0, device: "mobile" } } } }));
  await thumbs.get("A"); assert.equal(seen.length, 2, "a moved screen paints again");
  const later = new Date(Date.now() + 5000); await utimes(path.join(root, "A", "one.html"), later, later);
  await thumbs.get("A"); assert.equal(seen.length, 3, "a changed screen paints again");
  assert.equal(await thumbs.get("Empty"), null);
  assert.ok((await projects.list()).find((p) => p.name === "A").updated >= later.getTime() - 1000);
});

test("project names: the first screen names the project", async () => {
  const { projectNameFromScreen } = await import("../src/renderer/dashboard.js");
  assert.equal(projectNameFromScreen("thesis-assignment-form.html"), "Thesis assignment form");
  assert.equal(projectNameFromScreen("thesis-assignment-form.html", ["Thesis assignment form"]), "Thesis assignment form 2");
  assert.equal(projectNameFromScreen(".html"), null);
});
