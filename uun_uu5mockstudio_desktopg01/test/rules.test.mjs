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

import { appendGlobalRule, readGlobalRules, writeGlobalRules, GLOBAL_FILE, GLOBAL_TEMPLATE } from "../src/main/rules.mjs";
import { memoryPrompt, componentsInRules } from "../src/main/claudeService.mjs";
import { accessPolicy } from "../src/main/repo.mjs";
import { countRules, parseRules } from "../src/renderer/rulesDoc.js";

test("rules of all projects: G-ids, their own file, the template", async () => {
  assert.equal(nextRuleId("- G-004 a\n- R-009 b", "G"), "G-005"); assert.equal(nextRuleId("- R-009 b", "G"), "G-001");
  const root = await tmp();
  assert.equal(await readGlobalRules(root), "");
  const a = await appendGlobalRule(root, "Every screen is composed of bricks.");
  const b = await appendGlobalRule(root, "A brick is built from Plus4U5Elements components.");
  assert.deepEqual([a.id, b.id], ["G-001", "G-002"]);
  const text = await readFile(path.join(root, GLOBAL_FILE), "utf8");
  assert.ok(text.startsWith(GLOBAL_TEMPLATE.trimEnd())); assert.match(text, /- G-001 Every screen[\s\S]*- G-002 A brick/);
  assert.equal(countRules(text), 2, "the dialog counts G- rules too"); assert.equal(parseRules(text).find((l) => l.kind === "item").id, "G-001");
  await writeGlobalRules(root, "# x\n"); assert.equal(await readGlobalRules(root), "# x\n");
  await assert.rejects(appendGlobalRule(root, "  "), /empty/);
});

test("the prompt carries the rules of all projects and where to write them; the agent may touch only that one extra file", () => {
  const p = memoryPrompt({ cwd: "/p/demo", rules: "- R-001 x", globalRules: "- G-001 Every screen is composed of bricks.", globalFile: "/p/GLOBAL_RULES.md" });
  assert.match(p, /Rules for ALL projects: \/p\/GLOBAL_RULES\.md/); assert.match(p, /G-001 Every screen/); assert.match(p, /in all projects, record it in \/p\/GLOBAL_RULES\.md/);
  assert.ok(p.indexOf("Rules for ALL projects") < p.indexOf("Project memory"));
  assert.doesNotMatch(memoryPrompt({ cwd: "/p/demo", rules: "" }), /ALL projects/, "without a global file nothing changes");
  const ok = (tool, target) => accessPolicy({ cwd: "/p/demo", repoDir: null, tool, target, extraFiles: ["/p/GLOBAL_RULES.md"] }).behavior;
  assert.equal(ok("Write", "/p/GLOBAL_RULES.md"), "allow"); assert.equal(ok("Edit", "/p/GLOBAL_RULES.md"), "allow"); assert.equal(ok("Read", "/p/GLOBAL_RULES.md"), "allow");
  assert.equal(ok("Write", "/p/other.md"), "deny"); assert.equal(ok("Write", "/p/demo/a.html"), "allow");
});

test("library components named in the rules are described for the agent", () => {
  const docs = { available: () => true, has: (n) => n === "Plus4U5Elements.ContentContainer", get: () => ({ description: "Outer wrapper.", url: null, props: [{ name: "title", type: "lsi", required: false, default: null, enum: null }] }), file: () => "/w/cc.md" };
  const t = componentsInRules(docs, "Every brick is built from @Plus4U5Elements.ContentContainer and Nope.Thing and foo.bar.");
  assert.match(t, /^Library components named in the rules/); assert.match(t, /Plus4U5Elements\.ContentContainer – Outer wrapper/); assert.doesNotMatch(t, /Nope/);
  assert.equal(componentsInRules({ available: () => false }, "Plus4U5Elements.ContentContainer"), ""); assert.equal(componentsInRules(docs, "no components here"), "");
});

import { planPrompt, toolVerdict, PLAN_DENIED, studioPrompt, disallowedTools } from "../src/main/claudeService.mjs";

test("planning mode: the prompt asks for a plan with a tree, and no tool may change files", () => {
  const p = planPrompt();
  assert.match(p, /do NOT create, edit or delete any file/); assert.match(p, /`uu5-tree`/); assert.match(p, /"library"[\s\S]*"new"[\s\S]*"existing"/); assert.match(p, /"add" \| "modify" \| "remove" \| "keep"/); assert.match(p, /Build nothing yet/);
  assert.match(p, /`uu5-questions`/); assert.match(p, /NEVER draw the tree as text/); assert.match(p, /screen_structure/); assert.match(p, /"relation"[\s\S]*"render"[\s\S]*"disabled"/);
  const v = (plan, tool, target) => toolVerdict({ plan, cwd: "/p/demo", repoDir: null, tool, target }).behavior;
  for (const tool of PLAN_DENIED) assert.equal(v(true, tool, "/p/demo/a.html"), "deny", tool);
  assert.equal(v(false, "Write", "/p/demo/a.html"), "allow", "building is as before");
  assert.equal(v(true, "Read", "/p/demo/a.html"), "allow"); assert.equal(v(true, "Grep", "/p/demo"), "allow");
  assert.equal(v(true, "Write", "/p/GLOBAL_RULES.md"), "deny", "not even the rules while planning");
  assert.match(studioPrompt({ cwd: "/p/demo", urlBase: "http://x" }), /switch the message field from Agent to Plan/);
});

test("planning mode removes the file tools from the agent; building keeps them", () => {
  assert.deepEqual(disallowedTools(false), ["Bash"]);
  for (const t of ["Bash", ...PLAN_DENIED]) assert.ok(disallowedTools(true).includes(t), t);
});
