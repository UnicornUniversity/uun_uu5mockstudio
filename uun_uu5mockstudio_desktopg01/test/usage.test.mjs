import test from "node:test";
import assert from "node:assert/strict";
import { usageOf, usageDelta, formatTokens, usageLabel, usageTitle, contextOf, CONTEXT_WARN } from "../src/renderer/usage.js";

test("formatTokens", () => {
  for (const [n, s] of [[0, "0"], [842, "842"], [999, "999"], [1000, "1.0k"], [4200, "4.2k"], [9999, "9.9k"], [10000, "10.0k"], [12450, "12.4k"], [99999, "99.9k"], [100000, "100k"], [999999, "999k"], [1000000, "1.0M"], [1234567, "1.2M"]]) assert.equal(formatTokens(n), s, String(n));
});

test("usageOf adds up every model and keeps the cache read apart", () => {
  const u = usageOf({ type: "result", modelUsage: {
    "claude-sonnet-5-5": { inputTokens: 1000, outputTokens: 4000, cacheReadInputTokens: 120000, cacheCreationInputTokens: 3000, costUSD: 0.1 },
    "claude-haiku-5-5": { inputTokens: 200, outputTokens: 300, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
  } });
  assert.deepEqual([u.in, u.out, u.cacheRead, u.cacheWrite], [1000 + 3000 + 200, 4300, 120000, 3000]);
  assert.deepEqual(u.models["claude-sonnet-5-5"], { in: 4000, out: 4000 });
  assert.equal(usageLabel({ ...u, cum: u }), "8.5k tokens");
  assert.match(usageTitle(u), /Input 4\.2k · Output 4\.3k/);
  assert.match(usageTitle(u), /Cache: read 120k, written 3\.0k/);
  assert.match(usageTitle(u), /claude-haiku-5-5: 200 in, 300 out/);
});

test("usageOf falls back to usage and returns null without tokens", () => {
  const u = usageOf({ usage: { input_tokens: 50, output_tokens: 70, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 } });
  assert.deepEqual([u.in, u.out, u.cacheRead, u.cacheWrite, Object.keys(u.models).length], [55, 70, 10, 5, 0]);
  assert.equal(usageOf({ type: "result" }), null);
  assert.equal(usageOf({ modelUsage: {}, usage: { input_tokens: 0, output_tokens: 0 } }), null);
  assert.equal(usageOf(null), null);
  assert.equal(usageOf({ modelUsage: { m: { inputTokens: "x", outputTokens: -3 } } }), null);
});

test("the counters are cumulative: a request is the difference to the previous result", () => {
  const a = usageOf({ modelUsage: { s: { inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 9000, cacheCreationInputTokens: 200 } } });
  const b = usageOf({ modelUsage: { s: { inputTokens: 1300, outputTokens: 900, cacheReadInputTokens: 12000, cacheCreationInputTokens: 600 }, h: { inputTokens: 40, outputTokens: 5 } } });
  assert.equal(usageDelta(a, null), a);
  const d = usageDelta(b, a);
  assert.deepEqual([d.in, d.out, d.cacheRead, d.cacheWrite], [300 + 400 + 40, 400 + 5, 3000, 400]);
  assert.deepEqual(d.models, { s: { in: 700, out: 400 }, h: { in: 40, out: 5 } });
  assert.equal(usageDelta(a, b), a, "a counter that went down: a new process started counting, take the counters as they are");
  assert.equal(usageDelta(a, a), null, "nothing used");
  assert.equal(usageDelta(null, a), null);
});

test("a label says when it is a total of the conversation", () => {
  const u = usageOf({ modelUsage: { s: { inputTokens: 6000000, outputTokens: 400000 } } });
  assert.equal(usageLabel({ ...u, cum: u }), "6.4M tokens");
  assert.equal(usageLabel({ ...u, cum: u, sofar: true }), "6.4M tokens so far");
  assert.equal(usageLabel(u), "6.4M tokens so far", "an entry of the first version holds the counters");
  assert.match(usageTitle({ ...u, sofar: true, cum: u }), /whole conversation/);
});

test("the context is the input of the last call of the main loop, and the label shows it", () => {
  assert.equal(contextOf({ message: { usage: { input_tokens: 10, cache_creation_input_tokens: 200, cache_read_input_tokens: 5000 } } }), 5210);
  assert.equal(contextOf({ parent_tool_use_id: "x", message: { usage: { input_tokens: 99999 } } }), 0, "a subagent has its own context");
  assert.equal(contextOf({ message: {} }), 0);
  const u = usageOf({ modelUsage: { s: { inputTokens: 1000, outputTokens: 500 } } });
  assert.equal(usageLabel({ ...u, cum: u, ctx: 439000 }), "1.5k tokens · context 439k");
  assert.match(usageTitle({ ...u, cum: u, ctx: CONTEXT_WARN + 1 }), /new conversation would be cheaper/);
  assert.match(usageTitle({ ...u, cum: u, ctx: 50000 }), /fine/);
});
