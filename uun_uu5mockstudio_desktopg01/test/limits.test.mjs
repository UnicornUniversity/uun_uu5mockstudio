import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claudeLimits, codexLimits, providerOf, windowsFor, resetText, levelOf } from "../src/renderer/limits.js";
import { readCodexLimits } from "../src/main/limits.mjs";

// the shape of the usage call of the Agent SDK (shortened from a real answer)
const CLAUDE = {
  subscription_type: "team", rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 2, resets_at: "2026-11-21T12:50:00.292782+00:00" },
    seven_day: { utilization: 41, resets_at: "2026-11-28T06:00:00+00:00" },
    seven_day_opus: null, seven_day_sonnet: { utilization: 73, resets_at: "2026-11-28T06:00:00+00:00" },
    model_scoped: [{ display_name: "Fable", utilization: 95, resets_at: "2026-11-28T06:00:00+00:00" }],
  },
};

test("Claude's usage answer becomes the windows of the meter, the weekly window of a model marked with it", () => {
  const l = claudeLimits(CLAUDE);
  assert.equal(l.provider, "claude"); assert.equal(l.plan, "team");
  assert.deepEqual(l.windows.map((w) => [w.key, w.short, w.used, w.model ?? null]), [["five_hour", "5 h", 2, null], ["seven_day", "week", 41, null], ["seven_day_sonnet", "Sonnet", 73, "sonnet"], ["model:Fable", "Fable", 95, "fable"]]);
  assert.equal(l.windows[0].resetsAt, Date.parse("2026-11-21T12:50:00.292Z"));
});

test("without plan limits (an API key) or with an odd answer Claude has no meter", () => {
  assert.equal(claudeLimits({ rate_limits_available: false, rate_limits: null }), null);
  assert.equal(claudeLimits(null), null);
  assert.equal(claudeLimits({ rate_limits_available: true, rate_limits: { five_hour: { utilization: null } } }), null);
});

test("the meter shows the general windows and the weekly window of the chosen model only", () => {
  const l = claudeLimits(CLAUDE), keys = (m, r) => windowsFor(l, m, r).map((w) => w.key);
  assert.deepEqual(keys("opus"), ["five_hour", "seven_day"]);
  assert.deepEqual(keys("sonnet"), ["five_hour", "seven_day", "seven_day_sonnet"]);
  assert.deepEqual(keys("", "claude-fable-5-2"), ["five_hour", "seven_day", "model:Fable"]); // Default = the model of Claude Code
  assert.deepEqual(windowsFor(null, "opus"), []);
});

const codexLine = (primary, secondary) => JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: {}, rate_limits: { limit_id: "codex", primary, secondary, plan_type: "team" } } });

test("Codex's limits are the last ones in the log of its run; a window that reset meanwhile is empty again", () => {
  const now = 1_795_000_000_000;
  const log = [codexLine({ used_percent: 50, window_minutes: 300, resets_at: 1_794_000_000 }, { used_percent: 5, window_minutes: 10080, resets_at: 1_796_000_000 }), "{\"type\":\"other\"}", codexLine({ used_percent: 30, window_minutes: 300, resets_at: 1_794_999_000 }, { used_percent: 12, window_minutes: 10080, resets_at: 1_796_000_000 }), "not json"].join("\n");
  const l = codexLimits(log, now);
  assert.equal(l.provider, "codex"); assert.equal(l.plan, "team");
  assert.deepEqual(l.windows.map((w) => [w.label, w.short, w.used]), [["5-hour window", "5 h", 0], ["Weekly limit", "week", 12]]);
  assert.equal(codexLimits("", now), null);
});

test("the newest Codex log is found and read", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "limits-")), day = path.join(home, ".codex", "sessions", "2026", "11", "20");
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(day, "rollout-a.jsonl"), codexLine({ used_percent: 7, window_minutes: 300, resets_at: 4_000_000_000 }, null) + "\n");
  const old = process.env.CODEX_HOME; delete process.env.CODEX_HOME;
  try { const l = readCodexLimits({ home, now: 1_795_000_000_000 }); assert.equal(l.windows[0].used, 7); assert.ok(l.at > 0); }
  finally { if (old !== undefined) process.env.CODEX_HOME = old; fs.rmSync(home, { recursive: true, force: true }); }
  assert.equal(readCodexLimits({ home: path.join(os.tmpdir(), "no-such-home-xyz") }), null);
});

test("the provider follows the model; reset texts and colours", () => {
  assert.equal(providerOf("codex"), "codex"); assert.equal(providerOf("codex:gpt-5"), "codex"); assert.equal(providerOf("opus"), "claude"); assert.equal(providerOf(""), "claude");
  const now = 0;
  assert.equal(resetText(30 * 60000, now), "in 30 min"); assert.equal(resetText(134 * 60000, now), "in 2 h 14 min"); assert.equal(resetText(3 * 86400000, now), "in 3 days"); assert.equal(resetText(null), "");
  assert.deepEqual([levelOf(10), levelOf(75), levelOf(95)], ["ok", "warn", "high"]);
});

test("with ANTHROPIC_API_KEY on the computer, Claude Code uses the Claude account unless the key is chosen", async () => {
  const { usesKey, claudeChildEnv } = await import("../src/main/claudeEnv.mjs");
  const env = { PATH: "/bin", ANTHROPIC_API_KEY: "sk-test" };
  assert.equal(usesKey({ pref: "auto", env, account: true }), false);
  assert.equal(usesKey({ pref: "auto", env, account: false }), true); // no account signed in: the key is all there is
  assert.equal(usesKey({ pref: "key", env, account: true }), true);
  assert.equal(usesKey({ pref: "account", env, account: false }), false);
  assert.deepEqual(claudeChildEnv(env, { pref: "auto", account: true }), { PATH: "/bin" });
  assert.equal(claudeChildEnv(env, { pref: "key", account: true }), undefined); // the app's own environment, key included
  assert.equal(claudeChildEnv({ PATH: "/bin" }, { pref: "account" }), undefined); // no key: nothing to change
});

test("Settings offers the choice only when the key is on the computer", async () => {
  const { settingsSections } = await import("../src/renderer/settingsModel.js");
  const rows = (o) => settingsSections(o).find((s) => s.id === "ai").rows.map((r) => r.id);
  assert.deepEqual(rows({ agents: ["claude"] }), ["claude"]);
  assert.deepEqual(rows({ agents: ["claude"], claudeKey: true }), ["claude", "claudeAuth"]);
});
