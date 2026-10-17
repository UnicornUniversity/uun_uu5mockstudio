import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendRule, nextRuleId, summarizeChange, readRules, writeNotes, readNotes, parseNotes, serializeNotes, newNoteId, screensWithNotes, notePath, TEMPLATE } from "../src/main/rules.mjs";

const tmp = () => mkdtemp(path.join(os.tmpdir(), "rules-"));

test("nextRuleId follows the highest existing id", () => {
  assert.equal(nextRuleId(""), "R-001"); assert.equal(nextRuleId("- R-007 a\n- R-012 b\n- R-003 c"), "R-013");
});

test("appendRule creates the file from the template and adds rules to General and to screen sections", async () => {
  const d = await tmp();
  const a = await appendRule(d, "A room code is unique within a building.", null);
  assert.equal(a.id, "R-001"); assert.ok((await readRules(d)).startsWith(TEMPLATE.trimEnd()));
  const b = await appendRule(d, "Capacity is 1–500.", "rooms");
  const c = await appendRule(d, "Inactive rooms stay in the list.", "rooms");
  const d2 = await appendRule(d, "Deleting needs confirmation.", null);
  const text = await readRules(d);
  assert.deepEqual([b.id, c.id, d2.id], ["R-002", "R-003", "R-004"]);
  assert.match(text, /## General\n\n- R-001 A room code is unique within a building\.\n- R-004 Deleting needs confirmation\.\n\n## Screen: rooms\n\n- R-002 \(screen: rooms\) Capacity is 1–500\.\n- R-003 \(screen: rooms\) Inactive rooms stay in the list\.\n$/);
  await assert.rejects(appendRule(d, "   ", null), /empty/);
});

test("summarizeChange lists added and removed lines", () => {
  const before = "# t\n- R-001 a\n- R-002 b\n", after = "# t\n- R-001 a\n- R-002 changed\n- R-003 c\n";
  assert.deepEqual(summarizeChange(before, after), { added: ["- R-002 changed", "- R-003 c"], removed: ["- R-002 b"] });
  assert.deepEqual(summarizeChange("x", "x"), { added: [], removed: [] });
});

test("several notes of a screen are written as one readable Markdown file and read back with their ids", async () => {
  const d = await tmp();
  const kept = await writeNotes(d, "rooms.html", [{ id: "n1", text: "Owner: facility team." }, { id: "k2", text: "Open question:\n- do inactive rooms show in search?" }, { id: "blank", text: "  " }]);
  assert.deepEqual(kept.map((n) => n.id), ["n1", "k2"]);
  const raw = await readFile(path.join(d, "rooms.notes.md"), "utf8");
  assert.equal(raw, "# Notes: rooms\n\n<!-- note n1 -->\nOwner: facility team.\n\n<!-- note k2 -->\nOpen question:\n- do inactive rooms show in search?\n");
  assert.deepEqual(await readNotes(d, "rooms.html"), [{ id: "n1", text: "Owner: facility team." }, { id: "k2", text: "Open question:\n- do inactive rooms show in search?" }]);
  assert.deepEqual(screensWithNotes(d), ["rooms.html"]);
});

test("a file without markers (older version or written by hand) is read as one note and gets markers when saved", async () => {
  assert.deepEqual(parseNotes("Just a note.\nSecond line."), [{ id: "main", text: "Just a note.\nSecond line." }]);
  assert.deepEqual(parseNotes("# Notes: rooms\n\nText under a title"), [{ id: "main", text: "Text under a title" }]);
  assert.deepEqual(parseNotes("  \n"), []);
  assert.equal(serializeNotes("rooms.html", [{ id: "main", text: "x" }]), "# Notes: rooms\n\n<!-- note main -->\nx\n");
  assert.equal(serializeNotes("rooms.html", []), "");
});

test("blank notes are dropped, no notes removes the file, ids are validated, names must be screens", async () => {
  const d = await tmp();
  await writeNotes(d, "rooms.html", [{ id: "a", text: "x" }]);
  assert.deepEqual(await writeNotes(d, "rooms.html", [{ id: "a", text: "" }]), []);
  await assert.rejects(access(path.join(d, "rooms.notes.md")));
  assert.deepEqual(await writeNotes(d, "rooms.html", [{ id: "../evil", text: "x" }, { id: "ok", text: "y" }]), [{ id: "ok", text: "y" }]);
  assert.equal(path.basename(notePath(d, "../../etc/rooms.html")), "rooms.notes.md");
  assert.throws(() => notePath(d, "rooms.txt"), /Not a screen/);
  const id = newNoteId(["n1"]); assert.match(id, /^n[a-z0-9]{1,5}$/); assert.notEqual(newNoteId([id]), id);
});
