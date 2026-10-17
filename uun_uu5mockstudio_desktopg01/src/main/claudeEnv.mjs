import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPrerequisites, pluginStates, installPlan, classifyInstallError } from "./prerequisites.mjs";
import { findUpdates } from "./pluginUpdates.mjs";

const run = promisify(execFile);
let cached;

/** Well-known install locations per platform (used when the shell lookup finds nothing). Native installers beat npm shims. */
export function candidatePaths({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  if (platform === "win32") {
    const j = path.win32.join;
    return [
      j(home, ".local", "bin", "claude.exe"),
      env.LOCALAPPDATA && j(env.LOCALAPPDATA, "Programs", "claude", "claude.exe"),
      j(home, ".claude", "local", "claude.exe"),
      env.APPDATA && j(env.APPDATA, "npm", "claude.cmd"),
    ].filter(Boolean);
  }
  const j = path.posix.join;
  return [j(home, ".claude/local/claude"), j(home, ".local/bin/claude"), j(home, ".npm-global/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/usr/bin/claude"];
}

const isShim = (bin) => process.platform === "win32" && /\.(cmd|bat)$/i.test(bin); // cannot be exec'd without a shell on Windows

/** GUI apps do not inherit the shell PATH, so ask the OS / a login shell first, then probe common locations. */
export async function findClaude({ refresh = false } = {}) {
  if (process.env.STUDIO_CLAUDE_BIN) return (cached = existsSync(process.env.STUDIO_CLAUDE_BIN) ? process.env.STUDIO_CLAUDE_BIN : undefined);
  if (cached && !refresh && existsSync(cached)) return cached;
  cached = undefined;
  try {
    const lines = process.platform === "win32"
      ? (await run("where", ["claude"], { timeout: 8000 })).stdout
      : (await run(process.env.SHELL || "/bin/zsh", ["-lc", "command -v claude"], { timeout: 8000 })).stdout;
    const found = lines.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && existsSync(l));
    const p = found.find((l) => !isShim(l)) ?? found[0];
    if (p) return (cached = p);
  } catch {}
  return (cached = candidatePaths().find(existsSync));
}

export function requireClaude() {
  if (!cached) throw new Error("Claude Code was not found.");
  return cached;
}

let userDataDir = null; // where an optional prerequisites.json lives
export const configure = (o = {}) => { if (o.userDataDir) userDataDir = o.userDataDir; };
export const prerequisites = () => loadPrerequisites({ userDataDir });

/** Runs `claude <args>`; resolves { code, stdout, stderr } and never rejects. */
function runClaude(args, { timeout = 60000, onLine } = {}) {
  return new Promise((resolve) => {
    if (!cached) return resolve({ code: -1, stdout: "", stderr: "Claude Code was not found." });
    const child = spawn(cached, args, { shell: isShim(cached), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", done = false;
    const finish = (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ code, stdout, stderr }); } };
    const timer = setTimeout(() => { child.kill(); finish(-2); }, timeout);
    const feed = (store) => (d) => { const t = String(d); if (store === "o") stdout += t; else stderr += t; if (onLine) for (const l of t.split(/\r?\n/).filter(Boolean)) onLine(l); };
    child.stdout.on("data", feed("o")); child.stderr.on("data", feed("e"));
    child.on("exit", (code) => finish(code ?? -1)); child.on("error", (e) => { stderr += String(e.message); finish(-1); });
  });
}
const parseJson = (t, fallback) => { try { return JSON.parse(t); } catch { return fallback; } };

/** Plugins the app wants, with their state, and whether the marketplace they come from is configured in Claude Code. */
export async function pluginInfo() {
  const cfg = prerequisites();
  const [list, mps] = await Promise.all([runClaude(["plugin", "list", "--json"], { timeout: 30000 }), runClaude(["plugin", "marketplace", "list", "--json"], { timeout: 30000 })]);
  const installed = parseJson(list.stdout, []), marketplaces = parseJson(mps.stdout, []);
  const market = marketplaces.find?.((m) => m.name === cfg.marketplace.name);
  return { cfg, states: pluginStates(installed, cfg), marketplaceKnown: Boolean(market), installLocation: market?.installLocation ?? null, ok: list.code === 0 };
}

/** state: "missing" | "loggedOut" | "pluginsMissing" | "ready"; `plugins` lists the wanted plugins with their state. */
export async function getStatus({ refresh = false } = {}) {
  const bin = await findClaude({ refresh });
  if (!bin) return { state: "missing" };
  let version;
  try { version = (await run(bin, ["--version"], { timeout: 8000, shell: isShim(bin) })).stdout.trim(); } catch (e) { return { state: "missing", error: String(e.message) }; }
  try {
    const { stdout } = await run(bin, ["auth", "status"], { timeout: 10000, shell: isShim(bin) });
    const s = JSON.parse(stdout);
    if (!s.loggedIn) return { state: "loggedOut", bin, version, plugins: [] };
    const info = await pluginInfo(), blocking = info.states.some((p) => p.kind === "required" && p.state !== "ok");
    return { state: blocking ? "pluginsMissing" : "ready", bin, version, email: s.email, authMethod: s.authMethod, plugins: info.states, marketplaceKnown: info.marketplaceKnown };
  } catch (e) {
    // `auth status` exits non-zero when logged out
    try { if (JSON.parse(e.stdout).loggedIn === false) return { state: "loggedOut", bin, version, plugins: [] }; } catch {}
    return { state: "loggedOut", bin, version, error: String(e.message).slice(0, 200) };
  }
}

let loginChild = null, installChild = null;

/**
 * Lets Claude Code itself run its login flow (opens the browser, the app never sees a password); resolves with the exit code.
 * `method`: "claudeai" (subscription, default) | "console" (API billing) | "sso"; `email` pre-fills the login page.
 */
export function login({ method = "claudeai", email } = {}) {
  return new Promise((resolve) => {
    if (!cached) return resolve(-1);
    const args = ["auth", "login", ...(method === "console" ? ["--console"] : method === "sso" ? ["--sso"] : ["--claudeai"]), ...(email && /^[^\s@]+@[^\s@]+$/.test(email) ? ["--email", email] : [])];
    cancelLogin();
    const child = (loginChild = spawn(cached, args, { stdio: "ignore", shell: isShim(cached) }));
    child.on("exit", (code) => { if (loginChild === child) loginChild = null; resolve(code ?? -1); });
    child.on("error", () => resolve(-1));
  });
}
export function cancelLogin() { try { loginChild?.kill(); } catch { /* already gone */ } loginChild = null; }

/** The official installer for this platform: { cmd, args, shown } (STUDIO_INSTALL_CMD replaces it, for tests and mirrors). */
export function installerCommand(platform = process.platform, env = process.env) {
  if (env.STUDIO_INSTALL_CMD) return { cmd: env.STUDIO_INSTALL_CMD, args: [], shown: env.STUDIO_INSTALL_CMD };
  if (platform === "win32") { const shown = "irm https://claude.ai/install.ps1 | iex"; return { cmd: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", shown], shown }; }
  const shown = "curl -fsSL https://claude.ai/install.sh | bash";
  return { cmd: "/bin/bash", args: ["-lc", shown], shown };
}

/** Runs the installer and reports its output line by line; afterwards looks for `claude` again. Resolves { ok, code, status }. */
export function installClaude({ onLine } = {}) {
  return new Promise((resolve) => {
    const { cmd, args } = installerCommand();
    let tail = "";
    const child = (installChild = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TERM: "dumb", NO_COLOR: "1" } }));
    const timer = setTimeout(() => { try { child.kill(); } catch { /* done */ } }, 10 * 60 * 1000);
    const feed = (d) => { for (const l of String(d).split(/\r?\n/).map((x) => x.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim()).filter(Boolean)) { tail = `${tail}\n${l}`.slice(-2000); onLine?.(l); } };
    child.stdout.on("data", feed); child.stderr.on("data", feed);
    const end = async (code, error) => { clearTimeout(timer); if (installChild === child) installChild = null; const status = await getStatus({ refresh: true }); resolve({ ok: code === 0 && status.state !== "missing", code, output: tail.trim(), error, status }); };
    child.on("exit", (code) => end(code ?? -1)); child.on("error", (e) => end(-1, e.message));
  });
}
export function cancelInstall() { try { installChild?.kill(); } catch { /* already gone */ } }

/** Adds the marketplace and installs / enables / updates the wanted plugins that are not in order. Resolves { ok, steps, error? }. */
export async function installPlugins({ onStep } = {}) {
  const info = await pluginInfo(), steps = installPlan(info.states, info.marketplaceKnown, info.cfg), done = [];
  for (const [i, step] of steps.entries()) {
    onStep?.({ label: step.label, index: i, total: steps.length, state: "run" });
    const r = await runClaude(step.args, { timeout: 5 * 60 * 1000 });
    const ok = r.code === 0;
    done.push({ label: step.label, ok });
    onStep?.({ label: step.label, index: i, total: steps.length, state: ok ? "ok" : "bad" });
    if (!ok) return { ok: false, steps: done, error: classifyInstallError(`${r.stderr}\n${r.stdout}`) };
  }
  return { ok: true, steps: done };
}

/** Refreshes the marketplace and lists plugins that have a newer version there. Failures (offline, no SSH access) just return no updates. */
export async function checkPluginUpdates({ refreshCatalog = true, later = {} } = {}) {
  const before = await pluginInfo();
  if (!before.marketplaceKnown || !before.installLocation) return { updates: [], checked: false };
  if (refreshCatalog) await runClaude(["plugin", "marketplace", "update", before.cfg.marketplace.name], { timeout: 90000 });
  return { updates: findUpdates(before.states.filter((s) => s.state !== "missing"), before.installLocation, { later }), checked: true };
}

/** `claude plugin update <id> -y` for each plugin. Resolves { ok, steps, error? }. */
export async function updatePlugins(ids, { onStep } = {}) {
  const cfg = prerequisites(), valid = ids.filter((id) => new RegExp(`^[\\w.-]+@${cfg.marketplace.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(id)), done = [];
  for (const [i, id] of valid.entries()) {
    onStep?.({ label: `Update ${id.split("@")[0]}`, index: i, total: valid.length, state: "run" });
    const r = await runClaude(["plugin", "update", id, "-y"], { timeout: 5 * 60 * 1000 }), ok = r.code === 0;
    done.push({ id, ok }); onStep?.({ label: `Update ${id.split("@")[0]}`, index: i, total: valid.length, state: ok ? "ok" : "bad" });
    if (!ok) return { ok: false, steps: done, error: classifyInstallError(`${r.stderr}\n${r.stdout}`) };
  }
  return { ok: true, steps: done };
}
