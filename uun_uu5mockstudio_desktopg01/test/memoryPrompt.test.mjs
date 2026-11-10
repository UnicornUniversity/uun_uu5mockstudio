import test from "node:test";
import assert from "node:assert/strict";
import { memoryPrompt, studioPrompt, kindPrompt } from "../src/main/claudeService.mjs";

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

test("the agent is told to write components with their namespace, without aliases", () => {
  assert.match(studioPrompt({ cwd: "/p", urlBase: "http://x" }), /Do not alias or destructure a library/);
});

test("the sitemap of the project is part of the memory of the agent, and never to be edited by it", () => {
  const out = memoryPrompt({ cwd: "/p", rules: "", sitemapBlock: "- Portal -> index.html\n  - About" });
  assert.match(out, /sitemap\.json in \/p is the sitemap/); assert.match(out, /<<<SITEMAP\n- Portal -> index\.html/); assert.match(out, /never edit the file/);
  assert.doesNotMatch(memoryPrompt({ cwd: "/p", rules: "" }), /SITEMAP/);
});

test("a whole web site starts with its sitemap, an application or one page gets none unless asked", () => {
  assert.match(kindPrompt({ level: "web", scope: "site" }), /its sitemap comes first/);
  assert.match(kindPrompt({ level: "page", scope: "single" }), /one page, not a web site or portal: do not propose a sitemap/);
  assert.match(kindPrompt({ level: "app" }), /an application, not a web site/);
  assert.match(kindPrompt({ level: "component" }), /unless the user asks for a sitemap/);
  assert.equal(kindPrompt({ level: "web" }), ""); assert.equal(kindPrompt(null), ""); // an older Web project: as before
});
