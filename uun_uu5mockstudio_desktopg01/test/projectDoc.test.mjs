import test from "node:test";
import assert from "node:assert/strict";
import { getProjectText, setProjectText, getScreenText, setScreenText, extractFromRules } from "../src/renderer/projectDoc.js";

test("project text: set, read, replace, clear; the title stays", () => {
  const a = setProjectText("", "Rooms of the university.\nManaged by the office.");
  assert.equal(a, "# Project description\n\nRooms of the university.\nManaged by the office.\n");
  assert.equal(getProjectText(a), "Rooms of the university.\nManaged by the office.");
  const b = setProjectText(a, "Short.");
  assert.equal(getProjectText(b), "Short."); assert.equal((b.match(/# Project description/g) ?? []).length, 1);
  assert.equal(getProjectText(setProjectText(b, "  ")), "");
});

test("screen text lives under its own heading and does not disturb the project text or other sections", () => {
  let md = setProjectText("", "About.");
  md = setScreenText(md, "rooms", "List of rooms.");
  md = setScreenText(md, "detail", "Detail of a room.");
  assert.equal(getScreenText(md, "rooms"), "List of rooms."); assert.equal(getScreenText(md, "Detail"), "Detail of a room.");
  assert.equal(getProjectText(md), "About.");
  md = setProjectText(md, "About, changed.");
  assert.equal(getScreenText(md, "rooms"), "List of rooms."); assert.equal(getProjectText(md), "About, changed.");
  md = setScreenText(md, "rooms", "Changed.");
  assert.equal(getScreenText(md, "rooms"), "Changed."); assert.equal(getScreenText(md, "detail"), "Detail of a room.");
  md = setScreenText(md, "rooms", "");
  assert.ok(!md.includes("## Screen: rooms")); assert.equal(getScreenText(md, "detail"), "Detail of a room.");
  assert.equal(setScreenText("", "x", ""), "");
});

test("a section somebody added by hand survives, markers at line starts are dropped", () => {
  const md = "# Project description\n\nAbout.\n\n## Glossary\n\n- room: a place\n";
  const a = setProjectText(md, "- sneaky\n# not a heading");
  assert.ok(a.includes("## Glossary\n\n- room: a place")); assert.equal(getProjectText(a), "sneaky\nnot a heading");
  assert.ok(setScreenText(md, "rooms", "x").includes("- room: a place"));
});

test("extractFromRules moves descriptions out of BUSINESS_RULES.md and leaves the rules alone", () => {
  const rules = `# Business rules

Intro.

## Description

University room management.

## General

- R-001 Room codes are unique

## Screen: rooms

List of rooms.
With filters.

- R-003 (screen: rooms) Inactive rooms stay in the list

## Screen: detail

Detail of a room.
`;
  const r = extractFromRules(rules);
  assert.equal(r.project, "University room management.");
  assert.deepEqual(r.screens, { rooms: "List of rooms.\nWith filters.", detail: "Detail of a room." });
  assert.ok(!r.rules.includes("University room management") && !r.rules.includes("List of rooms") && !r.rules.includes("Detail of a room"));
  assert.ok(r.rules.includes("- R-001 Room codes are unique") && r.rules.includes("- R-003 (screen: rooms) Inactive rooms stay in the list") && r.rules.includes("Intro."));
  assert.ok(r.rules.includes("## Screen: rooms\n\n- R-003"), "a rule keeps a blank line below its section heading");
  assert.equal(extractFromRules("# Business rules\n\n## General\n\n- R-001 x\n"), null);
});
