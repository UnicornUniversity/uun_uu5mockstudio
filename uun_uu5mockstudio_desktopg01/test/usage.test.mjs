import test from "node:test";
import assert from "node:assert/strict";
import { usageOf, formatTokens, usageLabel, usageTitle } from "../src/renderer/usage.js";

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
  assert.equal(usageLabel(u), "8.5k tokens");
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
