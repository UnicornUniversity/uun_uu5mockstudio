import test from "node:test";
import assert from "node:assert/strict";
import { memoryPrompt } from "../src/main/claudeService.mjs";

test("the prompt tells the agent to keep BUSINESS_RULES.md and carries its current content as data", () => {
  const p = memoryPrompt({ cwd: "/p/Demo", repoDir: null, rules: "# Business rules\n- R-001 Codes are unique.\n" });
  assert.match(p, /BUSINESS_RULES\.md in \/p\/Demo/); assert.match(p, /<<<RULES\n# Business rules\n- R-001 Codes are unique\.\nRULES>>>/);
  assert.match(p, /<screen>\.notes\.md/); assert.ok(!/Linked git repository/.test(p));
});

test("a missing rules file is announced and a long one is truncated", () => {
  assert.match(memoryPrompt({ cwd: "/p", rules: "" }), /does not exist yet/);
  assert.match(memoryPrompt({ cwd: "/p", rules: "" }), /PROJECT\.md in \/p/);
  assert.ok(!/<<<PROJECT/.test(memoryPrompt({ cwd: "/p", rules: "" })));
  assert.match(memoryPrompt({ cwd: "/p", rules: "", description: "# Project description\n\nRooms." }), /<<<PROJECT\n# Project description\n\nRooms\.\nPROJECT>>>/);
  const long = memoryPrompt({ cwd: "/p", rules: "x".repeat(20000) });
  assert.match(long, /truncated/); assert.ok(long.length < 14500);
});

test("a linked repository is described as read-only", () => {
  const p = memoryPrompt({ cwd: "/p/Demo", repoDir: "/r/app", rules: "" });
  assert.match(p, /Linked git repository \(READ-ONLY\): \/r\/app/); assert.match(p, /Never write there/);
});
