import test from "node:test";
import assert from "node:assert/strict";
import { memoryPrompt, studioPrompt } from "../src/main/claudeService.mjs";

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

test("the studio prompt names every browser tool, asks to look before changing a screen and to spend few tokens", () => {
  const p = studioPrompt({ cwd: "/p/Demo", urlBase: "http://127.0.0.1:1234/Demo", memory: "MEMORY BLOCK" });
  for (const t of ["browser_open", "browser_reload", "browser_console", "browser_snapshot", "browser_screenshot", "browser_click"]) assert.ok(p.includes(t), t);
  assert.match(p, /read its file first/); assert.match(p, /one at the end, not one per step/); assert.match(p, /browser_click never changes files/);
  assert.match(p, /Economy \(the conversation is re-read by every step/); assert.match(p, /never dozens of tiny Edits/); assert.match(p, /not after every edit/);
  assert.match(p, /\/p\/Demo\/<kebab-name>\.html/); assert.ok(p.endsWith("MEMORY BLOCK"), "the project memory comes last");
});

test("the agent records business rules itself: the ones the user states and the ones the screen implements, the inferred ones marked", async () => {
  const { memoryPrompt, planPrompt } = await import("../src/main/claudeService.mjs");
  const p = memoryPrompt({ cwd: "/p/demo", rules: "" });
  assert.match(p, /without being asked and without asking for permission/);
  assert.match(p, /who may do what \(roles, permissions\), the conditions of a change of state, validations/);
  assert.match(p, /ends with `\(assumed\)`/);
  assert.match(planPrompt(), /business rules the plan implies/);
});

test("the Economy mode adds a short rule and the screenshot for the agent is small", async () => {
  const { ECONOMY_MODE } = await import("../src/main/claudeService.mjs");
  assert.match(ECONOMY_MODE, /smallest change/); assert.match(ECONOMY_MODE, /two or three sentences/);
  const { shrinkScreenshot, SCREENSHOT_WIDTH } = await import("../src/main/screenshot.mjs");
  let asked = null;
  const fake = (w) => ({ getSize: () => ({ width: w, height: 600 }), resize: (o) => { asked = o.width; return { toJPEG: (q) => Buffer.from(`j${q}`) }; }, toJPEG: (q) => Buffer.from(`full${q}`) });
  assert.equal(shrinkScreenshot(fake(2880)).toString(), "j72"); assert.equal(asked, SCREENSHOT_WIDTH);
  assert.equal(shrinkScreenshot(fake(700)).toString(), "full72", "a small one is not scaled");
});
