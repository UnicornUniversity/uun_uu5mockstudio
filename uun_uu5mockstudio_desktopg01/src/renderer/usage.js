/**
 * Tokens of one request of the agent, from the `result` message of the Agent SDK. `modelUsage` (every model of the request, subagents
 * included) is the source; `usage` (the main loop only) is the fallback. The main number is what the request had to process anew:
 * input (uncached + written to the cache) + output. Reading from the cache is cheap and repeats with every message, so it is kept apart.
 */
const num = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** `{ in, out, cacheRead, cacheWrite, models: { <model>: { in, out } } }`, or null when the message carries no tokens. */
export function usageOf(result) {
  if (!result || typeof result !== "object") return null;
  const total = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, models: {} };
  const mu = result.modelUsage && typeof result.modelUsage === "object" ? Object.entries(result.modelUsage) : [];
  if (mu.length) {
    for (const [model, m] of mu) {
      const i = num(m?.inputTokens) + num(m?.cacheCreationInputTokens), o = num(m?.outputTokens);
      total.in += i; total.out += o; total.cacheRead += num(m?.cacheReadInputTokens); total.cacheWrite += num(m?.cacheCreationInputTokens);
      if (i || o) total.models[model] = { in: i, out: o };
    }
  } else if (result.usage) {
    const u = result.usage;
    total.in = num(u.input_tokens) + num(u.cache_creation_input_tokens); total.out = num(u.output_tokens);
    total.cacheRead = num(u.cache_read_input_tokens); total.cacheWrite = num(u.cache_creation_input_tokens);
  }
  return total.in || total.out || total.cacheRead ? total : null;
}

/** 842, 4.2k, 12.4k, 120k, 1.2M (one decimal below 100k and below a million, the rest rounded down). */
export function formatTokens(n) {
  n = Math.round(n);
  if (n < 1000) return String(n);
  if (n < 100000) return `${(Math.floor(n / 100) / 10).toFixed(1)}k`;
  if (n < 1000000) return `${Math.floor(n / 1000)}k`;
  return `${(Math.floor(n / 100000) / 10).toFixed(1)}M`;
}

/** "12.4k tokens". */
export const usageLabel = (u) => `${formatTokens(u.in + u.out)} tokens`;

/** The tooltip: input and output, the cache, the models. */
export function usageTitle(u) {
  const lines = [`Input ${formatTokens(u.in)} · Output ${formatTokens(u.out)}`];
  if (u.cacheRead || u.cacheWrite) lines.push(`Cache: read ${formatTokens(u.cacheRead)}, written ${formatTokens(u.cacheWrite)} (reading is not counted above)`);
  const models = Object.entries(u.models ?? {});
  if (models.length > 1 || (models.length === 1 && models[0][0])) for (const [model, m] of models) lines.push(`${model}: ${formatTokens(m.in)} in, ${formatTokens(m.out)} out`);
  return lines.join("\n");
}
