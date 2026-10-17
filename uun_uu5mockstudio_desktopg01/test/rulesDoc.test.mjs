import test from "node:test";
import assert from "node:assert/strict";
import { parseRules, editItem, deleteItem, countRules } from "../src/renderer/rulesDoc.js";

const MD = `# Business rules

Intro text.

## General

- R-001 Room codes are unique
- R-002 Capacity is at least 1
- a plain bullet

## Screen: rooms

- R-003 (screen: rooms) Inactive rooms stay in the list

\`\`\`
- R-009 inside code
\`\`\`
`;

test("parseRules recognises headings, rules, plain bullets and code", () => {
  const l = parseRules(MD), by = (k) => l.filter((x) => x.kind === k);
  assert.equal(by("h1").length, 1); assert.equal(by("h2").length, 2);
  const items = by("item");
  assert.deepEqual(items.map((x) => x.id), ["R-001", "R-002", "", "R-003"]);
  assert.equal(items[3].screen, "rooms"); assert.equal(items[3].text, "Inactive rooms stay in the list");
  assert.ok(l.some((x) => x.kind === "code" && x.text.includes("R-009")), "a rule-like line inside a code block stays code");
  assert.equal(countRules(MD), 3);
});

test("editItem rewrites only the text of one line and keeps id, screen and the rest of the file", () => {
  const i = parseRules(MD).find((x) => x.id === "R-003").i;
  const out = editItem(MD, i, "  Inactive rooms\nare hidden ");
  assert.ok(out.includes("- R-003 (screen: rooms) Inactive rooms are hidden\n"));
  assert.equal(out.split("\n").length, MD.split("\n").length);
  assert.equal(out.replace("Inactive rooms are hidden", "Inactive rooms stay in the list"), MD);
});

test("an empty text or deleteItem removes the line; other lines are not items", () => {
  const i = parseRules(MD).find((x) => x.id === "R-002").i;
  assert.ok(!deleteItem(MD, i).includes("R-002")); assert.ok(!editItem(MD, i, "  ").includes("R-002"));
  assert.equal(editItem(MD, 0, "x"), MD, "a heading is not editable here");
});
