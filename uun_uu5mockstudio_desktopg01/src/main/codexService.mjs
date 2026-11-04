import { spawn } from "node:child_process";
import { agentInstructions } from "./claudeService.mjs";
import { findCodex, codexShell } from "./codexEnv.mjs";
import { ensureCodexPlugins } from "./codexPlugins.mjs";
import { codexEvents } from "./providers/events.mjs";
import { requiredFiles, skillsPrompt, readsSkill, writesScreen, reworkPrompt } from "./codexSkills.mjs";

/** What Codex is told on top of the common instructions: it has no preview tools and no Claude Code skills of its own. */
export const CODEX_NOTE = [
  "You are Codex. The studio-browser tools named above (browser_open, browser_reload, browser_console, browser_snapshot, browser_click, browser_screenshot, screen_structure) are MCP tools of the server `studio-browser`; call them the way you call any MCP tool. If they are not offered to you, check your work by re-reading the file you wrote. Do not start a server.",
].join(" ");

/** The `codex exec` command line. A resumed run accepts fewer flags than a fresh one, so the sandbox is set with `-c`, which both accept. */
export function codexArgs({ sessionId, model, plan = false, economy = false, writable = [], mcpUrl = "", docServers = {}, docTools = {} }) {
  const toml = (v) => JSON.stringify(v);
  const table = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k} = ${toml(String(v))}`).join(", ")} }`;
  // the Plus4U documents of the project: the MCP proxy with only its reading tools enabled (approved, as approval is "never")
  const docs = Object.entries(docServers).flatMap(([name, s]) => [
    "-c", `mcp_servers.${name}.command=${toml(s.command)}`, "-c", `mcp_servers.${name}.args=${JSON.stringify(s.args ?? [])}`, "-c", `mcp_servers.${name}.env=${table(s.env ?? {})}`,
    "-c", `mcp_servers.${name}.enabled_tools=${JSON.stringify(docTools[name] ?? [])}`, "-c", `mcp_servers.${name}.startup_timeout_sec=120`, "-c", `mcp_servers.${name}.default_tools_approval_mode=${toml("approve")}`,
  ]);
  return [
    "exec", ...(sessionId ? ["resume", sessionId] : []),
    "--json", "--skip-git-repo-check",
    "-c", `sandbox_mode=${toml(plan ? "read-only" : "workspace-write")}`,
    ...(!plan && writable.length ? ["-c", `sandbox_workspace_write.writable_roots=${JSON.stringify(writable)}`] : []),
    "-c", `approval_policy=${toml("never")}`,
    // the preview tools of the app; with approval "never" Codex refuses MCP calls unless the server is set to approve them
    ...(mcpUrl ? ["-c", `mcp_servers.studio-browser.url=${toml(mcpUrl)}`, "-c", `mcp_servers.studio-browser.default_tools_approval_mode=${toml("approve")}`] : []),
    ...docs,
    ...(economy ? ["-c", `model_reasoning_effort=${toml("low")}`] : []),
    ...(model ? ["-m", model] : []),
    "-", // the prompt comes on stdin
  ];
}

/** The usage of two runs of one request, added up (both count per request). */
export function sumUsage(a, b) {
  if (!a || !b) return a ?? b ?? null;
  const models = { ...a.models };
  for (const [m, v] of Object.entries(b.models ?? {})) models[m] = { in: (models[m]?.in ?? 0) + v.in, out: (models[m]?.out ?? 0) + v.out };
  return { ...b, in: a.in + b.in, out: a.out + b.out, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, models };
}

let pluginsDone; // once per run of the app: the skills of the app are put into Codex (what is missing, best effort: without them Codex still works from the rules in the prompt)
export const resetCodexPlugins = () => { pluginsDone = undefined; };

/** The provider "codex": the user's Codex CLI (`codex exec --json`), logged in with ChatGPT or an API key. `onEvent` gets the events of providers/events.mjs. */
export class CodexService {
  static id = "codex";
  static label = "Codex";
  constructor({ cwd, urlBase, onEvent, mcpUrl = "", sessionId, repoDir = null, repoLabel = "", globalRoot = null, docs = null }) {
    Object.assign(this, { cwd, urlBase, onEvent, mcpUrl, sessionId, repoDir, repoLabel, globalRoot, docs, child: undefined, stopped: false });
  }

  /** One `codex exec` run with `text` on stdin. Resolves what the run did: { finished, result (held back, see send), wrote, read, stderr }. */
  _run(bin, text, { model, plan, economy }) {
    const args = codexArgs({ sessionId: this.sessionId, model, plan, economy, writable: this.globalRoot ? [this.globalRoot] : [], mcpUrl: this.mcpUrl, docServers: this.docSetup?.servers, docTools: this.docSetup?.readTools });
    const child = spawn(bin, args, { cwd: this.cwd, shell: codexShell(), stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    child.stdin.on("error", () => {}); // the process may end before it has read everything
    child.stdin.end(text);
    const run = { finished: false, result: null, wrote: false, read: false, stderr: "" };
    let buf = "";
    const line = (l) => {
      let j; try { j = JSON.parse(l); } catch { return; }
      if (j.type === "item.started" || j.type === "item.completed") { if (j.item?.type === "command_execution" && readsSkill(j.item.command)) run.read = true; if (writesScreen(j.item)) run.wrote = true; }
      for (const ev of codexEvents(j, { model: model || "codex" })) {
        if (ev.sessionId) this.sessionId = ev.sessionId;
        if (ev.type === "result") { run.finished = true; run.result = ev; } else this.onEvent(ev); // the result is held: a run that is sent back must not end the request
      }
    };
    child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) line(l); } });
    child.stderr.on("data", (d) => { run.stderr = (run.stderr + d).slice(-2000); });
    return new Promise((resolve) => {
      let done = false; const end = () => { if (done) return; done = true; if (buf.trim()) line(buf.trim()); this.child = undefined; resolve(run); };
      child.on("error", (e) => { run.stderr += String(e.message); end(); });
      child.on("close", end);
    });
  }

  async send(prompt, model, { plan = false, economy = false } = {}) {
    this.stopped = false;
    const bin = await findCodex();
    if (!bin) return this.onEvent({ type: "app_error", message: "Codex was not found. Install the Codex CLI or the ChatGPT app, or set STUDIO_CODEX_BIN." });
    await (pluginsDone ??= ensureCodexPlugins({ bin }).catch(() => null));
    const { instructions, docs } = await agentInstructions(this, { plan, economy });
    this.docSetup = docs; // the MCP servers of the Plus4U documents for both runs
    const files = requiredFiles(), skills = skillsPrompt(files);
    let run = await this._run(bin, `${instructions}\n${CODEX_NOTE}${skills ? `\n${skills}` : ""}\n\n--- The request of the user ---\n${prompt}`, { model, plan, economy });
    // Codex only "may" use a skill: when it wrote a screen without having read them, it is sent back once.
    if (!this.stopped && run.finished && !plan && files.length && run.wrote && !run.read) {
      this.onEvent({ type: "text_delta", text: "\n\nThe mandatory uu5 and uuGDS skills were not read, so Codex is asked to read them and rework the screen." });
      this.onEvent({ type: "turn", ctx: 0, tools: [] });
      const first = run.result, again = await this._run(bin, reworkPrompt(files), { model, plan, economy });
      if (again.finished) again.result = { ...again.result, usage: sumUsage(first?.usage, again.result?.usage) };
      run = again.finished ? again : { ...run, stderr: again.stderr };
    }
    if (this.stopped) this.onEvent({ type: "stopped" });
    else if (run.finished) this.onEvent(run.result);
    else this.onEvent({ type: "app_error", message: `Codex ended without an answer.${run.stderr.trim() ? ` ${run.stderr.trim().split("\n").slice(-3).join(" ")}` : ""}` });
  }

  setSession(id) { this.sessionId = id || undefined; }
  reset() { this.sessionId = undefined; }
  stop() { this.stopped = true; this.child?.kill(); }
}
