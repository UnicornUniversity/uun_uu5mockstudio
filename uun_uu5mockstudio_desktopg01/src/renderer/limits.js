/**
 * The plan limits of the user's AI account (Claude subscription, Codex with ChatGPT) as one shape for the meter in the chat footer:
 * `{ provider, plan, windows: [{ key, label, short, used (0–100), resetsAt (ms) | null, model? }] }`, or null when nothing is known
 * (API key, not signed in, an answer that could not be read). The main process reads them (main/limits.mjs); these functions only shape them.
 */
const pct = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null);
const ms = (v) => { if (v == null || v === "") return null; const t = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : Date.parse(v); return Number.isFinite(t) ? t : null; };

/** The answer of Claude's usage call (SDK `SDKControlGetUsageResponse`). Weekly windows of single models carry `model` (lower case) to match the chosen model. */
export function claudeLimits(resp) {
  const rl = resp?.rate_limits_available ? resp.rate_limits : null;
  if (!rl || typeof rl !== "object") return null;
  const windows = [];
  const add = (key, label, short, w, model) => { const used = pct(w?.utilization); if (used != null) windows.push({ key, label, short, used, resetsAt: ms(w.resets_at), ...(model ? { model } : {}) }); };
  add("five_hour", "5-hour window", "5 h", rl.five_hour);
  add("seven_day", "Weekly limit", "week", rl.seven_day);
  add("seven_day_opus", "Weekly limit of Opus", "Opus", rl.seven_day_opus, "opus");
  add("seven_day_sonnet", "Weekly limit of Sonnet", "Sonnet", rl.seven_day_sonnet, "sonnet");
  for (const m of Array.isArray(rl.model_scoped) ? rl.model_scoped : []) if (m?.display_name) add(`model:${m.display_name}`, `Weekly limit of ${m.display_name}`, m.display_name, m, String(m.display_name).toLowerCase());
  return windows.length ? { provider: "claude", plan: resp.subscription_type ?? null, windows } : null;
}

/** The last `rate_limits` that Codex wrote into the log of a run (`~/.codex/sessions/…/rollout-*.jsonl`, the `token_count` events). `now` decides which windows have reset meanwhile. */
export function codexLimits(jsonl, now = Date.now()) {
  const lines = String(jsonl ?? "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"rate_limits"')) continue;
    let rl; try { const o = JSON.parse(lines[i]); rl = o?.payload?.rate_limits ?? o?.rate_limits ?? o?.msg?.rate_limits; } catch { continue; }
    if (!rl || typeof rl !== "object") continue;
    const windows = [];
    for (const [key, w] of [["primary", rl.primary], ["secondary", rl.secondary]]) {
      let used = pct(w?.used_percent); if (used == null) continue;
      const mins = Number(w.window_minutes);
      let resetsAt = ms(w.resets_at);
      if (resetsAt != null && resetsAt <= now) { used = 0; resetsAt = null; } // the window has started again since the last run: empty, its next reset unknown
      const week = mins >= 7 * 24 * 60 - 60, hours = Number.isFinite(mins) ? Math.round(mins / 60) : null;
      windows.push({ key, label: week ? "Weekly limit" : hours ? `${hours}-hour window` : "Short window", short: week ? "week" : hours ? `${hours} h` : key, used, resetsAt });
    }
    if (windows.length) return { provider: "codex", plan: rl.plan_type ?? null, windows };
  }
  return null;
}

/** The provider of a model of the select: "codex" / "codex:<slug>" run Codex, everything else Claude. */
export const providerOf = (model) => (/^codex(:|$)/.test(String(model ?? "")) ? "codex" : "claude");

/**
 * The windows that apply to the chosen model: the general ones (5 h, week) and the weekly window of that very model (Opus, Sonnet, …).
 * `resolved` is what Claude's "Default" stands for (e.g. "claude-opus-4-…"), so that the default gets its model's window too.
 */
export function windowsFor(limits, model, resolved = "") {
  if (!limits?.windows?.length) return [];
  const id = `${model || resolved || ""}`.toLowerCase();
  return limits.windows.filter((w) => !w.model || (id && id.includes(w.model)));
}

/** "in 2 h 14 min", "in 3 days", "Mon 9:00"-like text for a reset; "" when unknown. */
export function resetText(at, now = Date.now()) {
  if (!Number.isFinite(at)) return "";
  const d = Math.max(0, at - now), min = Math.round(d / 60000);
  if (min < 60) return `in ${Math.max(1, min)} min`;
  if (min < 24 * 60) { const h = Math.floor(min / 60), m = min % 60; return `in ${h} h${m ? ` ${m} min` : ""}`; }
  const days = Math.round(min / (24 * 60)); return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** How full a window is, for the colour: "ok" under 70 %, "warn" under 90 %, else "high". */
export const levelOf = (used) => (used >= 90 ? "high" : used >= 70 ? "warn" : "ok");
