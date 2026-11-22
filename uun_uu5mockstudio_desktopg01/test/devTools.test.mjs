import test from "node:test";
import assert from "node:assert/strict";
import { handoffTabs, devTools } from "../src/main/devTools.mjs";

test("the handoff offers only the tools on this computer", () => {
  const none = { vscode: false, vscodeClaude: false, vscodeCodex: false, claudeApp: false, codexApp: false, claudeCli: false, codexCli: false };
  assert.deepEqual(handoffTabs(none), ["task"]); // nothing found: the folder and the task only
  assert.deepEqual(handoffTabs({ ...none, codexApp: true }), ["codex"]);
  assert.deepEqual(handoffTabs({ ...none, claudeApp: true, claudeCli: true }), ["app", "terminal"]);
  assert.deepEqual(handoffTabs({ ...none, vscode: true }), ["task"]); // VS Code without an agent in it is no way to build
  assert.deepEqual(handoffTabs({ ...none, vscode: true, vscodeCodex: true, codexApp: true, codexCli: true }), ["vscode", "codex", "terminal"]);
});

test("the command-line tools are found by the app's own lookups", async () => {
  const t = await devTools({ findClaude: async () => "/usr/local/bin/claude", findCodex: async () => null, protocolApp: () => "" });
  assert.equal(t.claudeCli, true); assert.equal(t.codexCli, false);
  const failing = await devTools({ findClaude: async () => { throw new Error("x"); }, findCodex: async () => undefined, protocolApp: () => { throw new Error("y"); } });
  assert.equal(failing.claudeCli, false); assert.equal(failing.codexCli, false);
});
