import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getStatus, requireClaude } from "./claudeEnv.mjs";
import { codexStatus } from "./codexEnv.mjs";

/**
 * Which AI providers the user can really use right now and what models each offers, so that the window lists only those:
 * [{ provider: "claude" | "codex", label, models: [{ id, label, description }], defaultLabel }].
 * `id` is what the window sends as the model: "" (Claude's own default), a Claude alias or id, "codex" (Codex's configured default) or "codex:<slug>".
 * A provider that is not installed or not signed in is left out.
 */

/** Claude's rows of `supportedModels()`: its "default" row becomes "" (no override), the rest is passed by value. */
export function claudeModelOptions(rows) {
  const out = [];
  for (const m of Array.isArray(rows) ? rows : []) {
    if (!m?.value) continue;
    out.push({ id: m.value === "default" ? "" : m.value, label: m.displayName || m.value, description: m.description ?? "" });
  }
  return out;
}

/** The models Codex offers (`~/.codex/models_cache.json`: the visible ones, in its own order) and the one configured as default (`model = "…"` in config.toml). */
export function codexModelOptions(cache, toml = "") {
  const models = (Array.isArray(cache?.models) ? cache.models : []).filter((m) => m?.slug && m.visibility === "list").sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const configured = /^\s*model\s*=\s*"([^"\n]+)"/m.exec(String(toml))?.[1] ?? null;
  const shown = models.find((m) => m.slug === configured)?.display_name ?? configured;
  return {
    defaultLabel: shown ? `Default (${shown})` : "Default",
    models: [{ id: "codex", label: shown ? `Default (${shown})` : "Default", description: "The model configured in your Codex." }, ...models.map((m) => ({ id: `codex:${m.slug}`, label: m.display_name || m.slug, description: m.description ?? "" }))],
  };
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const readText = (file) => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } };

/** Asks Claude Code for its models (no tokens used); the fixed aliases when it does not answer in time. */
export async function listClaudeModels({ timeout = 8000 } = {}) {
  const fallback = [{ value: "default", displayName: "Default" }, { value: "opus", displayName: "Opus" }, { value: "sonnet", displayName: "Sonnet" }, { value: "haiku", displayName: "Haiku" }];
  let q;
  try {
    q = query({ prompt: (async function* () { await new Promise(() => {}); })(), options: { pathToClaudeCodeExecutable: requireClaude(), cwd: os.tmpdir(), settingSources: [] } });
    const rows = await Promise.race([q.supportedModels(), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), timeout))]);
    return claudeModelOptions(rows.length ? rows : fallback);
  } catch { return claudeModelOptions(fallback); }
  finally { try { q?.close(); } catch { /* already gone */ } }
}

let cached = null;
/**
 * The usable providers. `deps` can be replaced for tests. The answer is kept for the run of the app: `refresh` asks again
 * (after the user signed in or installed something).
 */
export async function listAgents({ refresh = false, deps = {} } = {}) {
  if (cached && !refresh) return cached;
  const d = { claudeStatus: getStatus, claudeModels: listClaudeModels, codexStatus, home: os.homedir(), ...deps };
  const [cs, xs] = await Promise.all([d.claudeStatus({ refresh }).catch(() => null), d.codexStatus({ refresh }).catch(() => null)]);
  const out = [];
  if (cs && (cs.state === "ready" || cs.state === "pluginsMissing")) out.push({ provider: "claude", label: "Claude", defaultLabel: "Default", models: await d.claudeModels() });
  if (xs?.installed && xs.loggedIn) {
    const cx = codexModelOptions(readJson(path.join(d.home, ".codex", "models_cache.json")), readText(path.join(d.home, ".codex", "config.toml")));
    out.push({ provider: "codex", label: "Codex", ...cx });
  }
  return (cached = out);
}
