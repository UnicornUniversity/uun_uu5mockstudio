import { usageOf, contextOf } from "../../renderer/usage.js";

/**
 * The events every AI provider (Claude, Codex…) sends to the window, so that the window knows nothing about the SDK behind it:
 *   { type: "init", model }                          the model of the request
 *   { type: "status", kind: "thinking" | "text" | "tool", tool? }   what the agent has started to do
 *   { type: "text_delta", text }                     a piece of the answer
 *   { type: "turn", ctx, tools: [{ id, name, input }] }   one step of the agent finished; tools it called, ctx = size of the context (0 = unknown)
 *   { type: "tool_result", id, isError }             the result of one tool call
 *   { type: "result", isError, text, usage }         the request is over; usage = counters (see `usageOf`): cumulative over the conversation, or of this request alone when `perRequest` is set; or null
 *   { type: "stopped" } | { type: "app_error", message }
 * Any of them may carry `sessionId` (the id to resume the conversation with).
 */

/** The tool of a Codex item (`command_execution`, `file_change`, `mcp_tool_call`) in the shape the window knows, or null for an item that is no tool. */
function codexTool(item) {
  if (item.type === "command_execution") return { id: item.id, name: "Shell", input: { command: item.command } };
  if (item.type === "file_change") return { id: item.id, name: "Edit", input: { file_path: item.changes?.[0]?.path ?? "", changes: item.changes } };
  if (item.type === "mcp_tool_call") return { id: item.id, name: `mcp__${item.server}__${item.tool}`, input: item.arguments ?? {} };
  return null;
}
/** Codex counts `input_tokens` with the cached ones inside; the window wants the new ones and the cached ones apart. `model` names the request in the details. */
export function codexUsage(u, model = "codex") {
  if (!u) return null;
  const cached = u.cached_input_tokens ?? 0, inn = Math.max(0, (u.input_tokens ?? 0) - cached), out = (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0);
  if (!inn && !out && !cached) return null;
  return { in: inn, out, cacheRead: cached, cacheWrite: 0, models: inn || out ? { [model]: { in: inn, out } } : {}, perRequest: true };
}

/** One line of `codex exec --json` as a list of events (see the sample in the tests). `model` is only for the usage details. */
export function codexEvents(ev, { model } = {}) {
  const out = [];
  if (ev?.type === "thread.started") out.push({ type: "init", model, sessionId: ev.thread_id });
  else if (ev?.type === "item.started" || ev?.type === "item.completed") {
    const item = ev.item ?? {}, done = ev.type === "item.completed", tool = codexTool(item);
    if (tool && !done) { out.push({ type: "status", kind: "tool", tool: tool.name }, { type: "turn", ctx: 0, tools: [tool] }); }
    else if (tool) out.push({ type: "tool_result", id: item.id, isError: item.status === "failed" || (item.type === "command_execution" && item.exit_code != null && item.exit_code !== 0) });
    else if (done && item.type === "agent_message") out.push({ type: "status", kind: "text" }, { type: "text_delta", text: item.text ?? "" }, { type: "turn", ctx: 0, tools: [] });
  } else if (ev?.type === "turn.completed") out.push({ type: "result", isError: false, text: "", usage: codexUsage(ev.usage, model) });
  else if (ev?.type === "turn.failed") out.push({ type: "result", isError: true, text: ev.error?.message ?? "The request failed.", usage: null });
  return out;
}

/** One message of the Claude Agent SDK as a list of events (an empty list for a message the window does not need). */
export function claudeEvents(m) {
  const out = [];
  if (m?.type === "system" && m.subtype === "init") out.push({ type: "init", model: m.model });
  else if (m?.type === "stream_event" && m.event?.type === "content_block_start") {
    const b = m.event.content_block;
    if (b?.type === "tool_use") out.push({ type: "status", kind: "tool", tool: b.name });
    else if (b?.type === "thinking") out.push({ type: "status", kind: "thinking" });
    else if (b?.type === "text") out.push({ type: "status", kind: "text" });
  } else if (m?.type === "stream_event" && m.event?.delta?.type === "text_delta") out.push({ type: "text_delta", text: m.event.delta.text });
  else if (m?.type === "assistant") {
    const tools = (m.message?.content ?? []).filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} }));
    out.push({ type: "turn", ctx: contextOf(m), tools });
  } else if (m?.type === "user" && Array.isArray(m.message?.content)) {
    for (const b of m.message.content) if (b.type === "tool_result") out.push({ type: "tool_result", id: b.tool_use_id, isError: Boolean(b.is_error) });
  } else if (m?.type === "result") out.push({ type: "result", isError: Boolean(m.is_error), text: m.result ?? m.subtype, usage: usageOf(m) });
  else if (m?.type === "stopped" || m?.type === "app_error") out.push(m);
  if (m?.session_id) for (const e of out) e.sessionId = m.session_id;
  return out;
}
