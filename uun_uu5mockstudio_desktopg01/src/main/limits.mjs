import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { requireClaude, getStatus, claudeChildEnv } from "./claudeEnv.mjs";
import { claudeLimits, codexLimits } from "../renderer/limits.js";

/**
 * The plan limits of the user's AI accounts for the meter in the chat footer (shapes: renderer/limits.js).
 * Claude: the usage call of the Agent SDK (the data of `/usage` in Claude Code; experimental in the SDK, so any failure only hides the meter).
 * Codex: `codex exec --json` does not report them, but Codex writes them into the log of every run, so the newest log is read.
 */

const USAGE_CALL = "usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET";

/** Claude's limits: an idle Claude Code process answers the usage call (no tokens are used). null when the SDK, the account or time does not allow it. */
export async function readClaudeLimits({ timeout = 25000 } = {}) {
  let q;
  try {
    let bin; try { bin = requireClaude(); } catch { await getStatus({}); bin = requireClaude(); } // Claude Code not looked for yet
    q = query({ prompt: (async function* () { await new Promise(() => {}); })(), options: { pathToClaudeCodeExecutable: bin, ...(claudeChildEnv() ? { env: claudeChildEnv() } : {}), cwd: os.tmpdir(), settingSources: [] } });
    if (typeof q[USAGE_CALL] !== "function") { console.warn("[limits] the Agent SDK has no usage call"); return null; } // a newer SDK renamed it: no meter rather than an error
    const resp = await Promise.race([q[USAGE_CALL]({ skipBehaviors: true }), new Promise((_, r) => setTimeout(() => r(new Error(`no answer in ${timeout / 1000} s`)), timeout))]);
    const l = claudeLimits(resp);
    if (l) return l;
    console.warn(`[limits] Claude reports no plan limits (subscription: ${resp?.subscription_type ?? "none"}, available: ${resp?.rate_limits_available})`);
    // an answer without plan limits: Claude Code runs on an API key (often ANTHROPIC_API_KEY from the shell the app was started from), paid per token
    return resp && resp.rate_limits_available === false ? { provider: "claude", plan: resp.subscription_type ?? null, windows: [], noPlan: true, envKey: Boolean(process.env.ANTHROPIC_API_KEY) } : null;
  } catch (e) { console.warn(`[limits] Claude's plan limits could not be read: ${e?.message ?? e}`); return null; }
  finally { try { q?.close(); } catch { /* already gone */ } }
}

const dirsDesc = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().reverse(); } catch { return []; } };

/** The newest log of a Codex run: `<home>/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, looked for in the last few days that have any. */
export function newestCodexLog(home = os.homedir()) {
  const root = path.join(process.env.CODEX_HOME || path.join(home, ".codex"), "sessions");
  let best = null, days = 0;
  for (const y of dirsDesc(root)) for (const m of dirsDesc(path.join(root, y))) for (const d of dirsDesc(path.join(root, y, m))) {
    if (days++ >= 3) return best; // a run continued later is written to its old day, so a few days are compared by time
    const dir = path.join(root, y, m, d);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      try { const t = fs.statSync(path.join(dir, f)).mtimeMs; if (!best || t > best.t) best = { file: path.join(dir, f), t }; } catch { /* gone meanwhile */ }
    }
  }
  return best;
}

/** The end of a file (the limits are written after every step, so the last ones are near the end). */
function tail(file, bytes = 256 * 1024) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size, start = Math.max(0, size - bytes), buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString("utf8");
    return start ? text.slice(text.indexOf("\n") + 1) : text; // the first, cut line is dropped
  } finally { fs.closeSync(fd); }
}

/** Codex's limits from its newest log, with the time they were written (`at`); null without a log that has them. */
export function readCodexLimits({ home = os.homedir(), now = Date.now() } = {}) {
  try {
    const log = newestCodexLog(home);
    if (!log) return null;
    const l = codexLimits(tail(log.file), now);
    return l ? { ...l, at: log.t } : null;
  } catch { return null; }
}

/** The limits of one provider ("claude" | "codex"); Claude's answer is kept a minute (a failure is not kept), and a question already on its way is shared. */
let claudeCache = null, claudeAsking = null;
/** Forgets Claude's answer (the sign-in changed). */
export const forgetClaudeLimits = () => { claudeCache = null; };
export async function readLimits(provider, { refresh = false } = {}) {
  if (provider === "codex") return readCodexLimits();
  if (!refresh && claudeCache && Date.now() - claudeCache.t < 60000) return claudeCache.v;
  claudeAsking ??= readClaudeLimits().then((v) => { if (v) claudeCache = { t: Date.now(), v }; return v; }).finally(() => { claudeAsking = null; });
  return claudeAsking;
}
