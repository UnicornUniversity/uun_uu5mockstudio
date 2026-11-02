import { test } from "node:test";
import assert from "node:assert/strict";
import { codexArgs } from "../src/main/codexService.mjs";
import { configuredPath, candidatePaths } from "../src/main/codexEnv.mjs";

test("a fresh run: workspace sandbox with the global rules folder writable, prompt on stdin", () => {
  const a = codexArgs({ writable: ["/g"], model: "gpt-x" });
  assert.deepEqual(a.slice(0, 3), ["exec", "--json", "--skip-git-repo-check"]);
  assert.ok(a.includes('sandbox_mode="workspace-write"'));
  assert.ok(a.includes('sandbox_workspace_write.writable_roots=["/g"]'));
  assert.deepEqual(a.slice(-3), ["-m", "gpt-x", "-"]);
});

test("a resumed run names the session and plan mode is read-only", () => {
  const a = codexArgs({ sessionId: "th1", plan: true, writable: ["/g"], economy: true });
  assert.deepEqual(a.slice(0, 3), ["exec", "resume", "th1"]);
  assert.ok(a.includes('sandbox_mode="read-only"'));
  assert.ok(!a.some((x) => x.startsWith("sandbox_workspace_write")));
  assert.ok(a.includes('model_reasoning_effort="low"'));
});

test("the Codex binary: path from the ChatGPT app config comes first", () => {
  assert.equal(configuredPath('a = 1\nCODEX_CLI_PATH = "/x/codex"\n'), "/x/codex");
  assert.equal(configuredPath("nothing"), null);
  assert.equal(candidatePaths({ platform: "darwin", home: "/h", config: 'CODEX_CLI_PATH = "/x/codex"' })[0], "/x/codex");
});

test("the preview tools are passed as an MCP server that Codex may call without asking", () => {
  const a = codexArgs({ mcpUrl: "http://127.0.0.1:5/mcp/t" });
  assert.ok(a.includes('mcp_servers.studio-browser.url="http://127.0.0.1:5/mcp/t"'));
  assert.ok(a.includes('mcp_servers.studio-browser.default_tools_approval_mode="approve"'));
  assert.ok(!codexArgs({}).some((x) => x.startsWith("mcp_servers")));
});
