import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { keepVariantFiles } from "../src/main/variantKeep.mjs";
import { makeProject } from "./helpers.mjs";

const setup = async () => {
  const dir = await makeProject({ "room.html": "ORIG", "room-a.html": "A", "room-b.html": "B", "other.html": "O" });
  fs.writeFileSync(path.join(dir, "room.comments.json"), "[]");
  fs.writeFileSync(path.join(dir, "room-a.comments.json"), '[{"x":1}]');
  fs.writeFileSync(path.join(dir, "room-a.notes.md"), "# Notes: room-a\n\n<!-- note n1 -->\nhello\n");
  const trashed = [], trash = async (p) => { trashed.push(path.basename(p)); fs.rmSync(p); };
  return { dir, trashed, opts: () => ({ trash, screens: fs.readdirSync(dir).filter((f) => f.endsWith(".html")) }) };
};

test("a variant replaces the original: the original and the other variants go to the trash, notes and comments move over", async () => {
  const { dir, trashed, opts } = await setup();
  const r = await keepVariantFiles(dir, "room-a.html", opts());
  assert.deepEqual(r, { kept: "room.html", removed: ["room-b.html"] });
  assert.deepEqual(trashed.sort(), ["room-b.html", "room.comments.json", "room.html"]);
  assert.equal(fs.readFileSync(path.join(dir, "room.html"), "utf8"), "A");
  assert.equal(fs.readFileSync(path.join(dir, "room.comments.json"), "utf8"), '[{"x":1}]');
  assert.ok(fs.existsSync(path.join(dir, "room.notes.md")));
  assert.ok(!fs.existsSync(path.join(dir, "room-a.html")) && !fs.existsSync(path.join(dir, "room-a.comments.json")));
  assert.ok(fs.existsSync(path.join(dir, "other.html")));
});

test("the original can be kept: all its variants go to the trash", async () => {
  const { dir, trashed, opts } = await setup();
  const r = await keepVariantFiles(dir, "room.html", opts());
  assert.deepEqual(r, { kept: "room.html", removed: ["room-a.html", "room-b.html"] });
  assert.deepEqual(trashed.sort(), ["room-a.comments.json", "room-a.html", "room-a.notes.md", "room-b.html"]);
  assert.equal(fs.readFileSync(path.join(dir, "room.html"), "utf8"), "ORIG");
  assert.ok(fs.existsSync(path.join(dir, "room.comments.json")));
});

test("a screen without variants cannot be kept", async () => {
  const { dir, opts } = await setup();
  await assert.rejects(keepVariantFiles(dir, "other.html", opts()), /no variants/);
  await assert.rejects(keepVariantFiles(dir, "missing.html", opts()), /does not exist/);
});
