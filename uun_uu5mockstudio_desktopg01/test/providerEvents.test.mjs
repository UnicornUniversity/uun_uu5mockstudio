import { test } from "node:test";
import assert from "node:assert/strict";
import { claudeEvents } from "../src/main/providers/events.mjs";

test("init carries the model and the session id", () => {
  assert.deepEqual(claudeEvents({ type: "system", subtype: "init", model: "claude-sonnet-5-5", session_id: "s1" }), [{ type: "init", model: "claude-sonnet-5-5", sessionId: "s1" }]);
});

test("content blocks become statuses, text deltas stay text", () => {
  const start = (b) => claudeEvents({ type: "stream_event", event: { type: "content_block_start", content_block: b } });
  assert.deepEqual(start({ type: "tool_use", name: "Write" }), [{ type: "status", kind: "tool", tool: "Write" }]);
  assert.deepEqual(start({ type: "thinking" }), [{ type: "status", kind: "thinking" }]);
  assert.deepEqual(start({ type: "text" }), [{ type: "status", kind: "text" }]);
  assert.deepEqual(claudeEvents({ type: "stream_event", event: { delta: { type: "text_delta", text: "Hi" } } }), [{ type: "text_delta", text: "Hi" }]);
});

test("an assistant message lists its tool calls and the context size", () => {
  const [e] = claudeEvents({ type: "assistant", message: { content: [{ type: "text", text: "x" }, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.html" } }], usage: { input_tokens: 10, cache_read_input_tokens: 5 } } });
  assert.deepEqual(e, { type: "turn", ctx: 15, tools: [{ id: "t1", name: "Read", input: { file_path: "a.html" } }] });
});

test("tool results, one event per block", () => {
  const ev = claudeEvents({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1" }, { type: "tool_result", tool_use_id: "t2", is_error: true }] } });
  assert.deepEqual(ev, [{ type: "tool_result", id: "t1", isError: false }, { type: "tool_result", id: "t2", isError: true }]);
});

test("result carries the cumulative usage", () => {
  const [e] = claudeEvents({ type: "result", is_error: false, result: "done", usage: { input_tokens: 100, output_tokens: 20 } });
  assert.equal(e.type, "result");
  assert.equal(e.isError, false);
  assert.equal(e.usage.in, 100);
  assert.equal(e.usage.out, 20);
});

test("app events pass through and unknown messages vanish", () => {
  assert.deepEqual(claudeEvents({ type: "stopped" }), [{ type: "stopped" }]);
  assert.deepEqual(claudeEvents({ type: "app_error", message: "x" }), [{ type: "app_error", message: "x" }]);
  assert.deepEqual(claudeEvents({ type: "system", subtype: "other" }), []);
});

import { codexEvents, codexUsage } from "../src/main/providers/events.mjs";

test("codex: a run of the real `codex exec --json` becomes the same events", () => {
  const lines = [
    { type: "thread.started", thread_id: "th1" },
    { type: "turn.started" },
    { type: "item.completed", item: { id: "i0", type: "agent_message", text: "Creating it." } },
    { type: "item.started", item: { id: "i1", type: "command_execution", command: "printf hi > a.txt", status: "in_progress", exit_code: null } },
    { type: "item.completed", item: { id: "i1", type: "command_execution", command: "printf hi > a.txt", status: "completed", exit_code: 0 } },
    { type: "turn.completed", usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50, reasoning_output_tokens: 10 } },
  ];
  const ev = lines.flatMap((l) => codexEvents(l, { model: "gpt" }));
  assert.deepEqual(ev.map((e) => e.type), ["init", "status", "text_delta", "turn", "status", "turn", "tool_result", "result"]);
  assert.equal(ev[0].sessionId, "th1");
  assert.deepEqual(ev[5].tools, [{ id: "i1", name: "Shell", input: { command: "printf hi > a.txt" } }]);
  assert.deepEqual(ev[6], { type: "tool_result", id: "i1", isError: false });
  assert.deepEqual(ev[7].usage, { in: 200, out: 60, cacheRead: 800, cacheWrite: 0, models: { gpt: { in: 200, out: 60 } }, perRequest: true });
});

test("codex: failed commands, file changes, failed turns", () => {
  assert.equal(codexEvents({ type: "item.completed", item: { id: "i", type: "command_execution", exit_code: 2 } })[0].isError, true);
  const [, t] = codexEvents({ type: "item.started", item: { id: "f", type: "file_change", changes: [{ path: "/p/a.html", kind: "add" }] } });
  assert.deepEqual(t.tools[0], { id: "f", name: "Edit", input: { file_path: "/p/a.html", changes: [{ path: "/p/a.html", kind: "add" }] } });
  assert.deepEqual(codexEvents({ type: "turn.failed", error: { message: "boom" } }), [{ type: "result", isError: true, text: "boom", usage: null }]);
  assert.equal(codexUsage(null), null);
});
