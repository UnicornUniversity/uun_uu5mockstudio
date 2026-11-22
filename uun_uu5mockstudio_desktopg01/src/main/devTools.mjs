/**
 * Which tools for building a handoff are on this computer: the Claude and Codex apps, their command-line tools, VS Code and its Claude Code
 * and Codex extensions. The handoff dialog offers only these (the steps for a tool the user does not have are noise).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

/** An application by its folder (macOS / Windows) or by the URL scheme it registers (`app.getApplicationNameForProtocol`). */
function hasApp({ mac = [], win = [], scheme = null }, protocolApp = () => "") {
  const home = os.homedir(), local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), pf = process.env.ProgramFiles ?? "C:\\Program Files";
  const paths = process.platform === "darwin" ? mac.flatMap((n) => [path.join("/Applications", n), path.join(home, "Applications", n)])
    : process.platform === "win32" ? win.map((p) => p.replace("%LOCALAPPDATA%", local).replace("%ProgramFiles%", pf)) : [];
  if (paths.some(exists)) return true;
  try { return Boolean(scheme && protocolApp(`${scheme}://`)); } catch { return false; }
}

/** The extensions of VS Code by their id prefix (anthropic.claude-code, openai.chatgpt = Codex). */
function vscodeExtensions(dir = path.join(os.homedir(), ".vscode", "extensions")) {
  let names = []; try { names = fs.readdirSync(dir); } catch { return { claude: false, codex: false }; }
  return { claude: names.some((n) => n.startsWith("anthropic.claude-code")), codex: names.some((n) => n.startsWith("openai.chatgpt")) };
}

/** `findClaude` / `findCodex`: the command-line tools; `protocolApp`: Electron's app.getApplicationNameForProtocol. */
export async function devTools({ findClaude, findCodex, protocolApp }) {
  const [claudeCli, codexCli] = await Promise.all([findClaude().catch(() => null), findCodex().catch(() => null)]);
  const vscode = hasApp({ mac: ["Visual Studio Code.app"], win: ["%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe", "%ProgramFiles%\\Microsoft VS Code\\Code.exe"], scheme: "vscode" }, protocolApp);
  const ext = vscode ? vscodeExtensions() : { claude: false, codex: false };
  return {
    vscode, vscodeClaude: ext.claude, vscodeCodex: ext.codex,
    claudeApp: hasApp({ mac: ["Claude.app"], win: ["%LOCALAPPDATA%\\AnthropicClaude\\claude.exe"], scheme: "claude" }, protocolApp),
    codexApp: hasApp({ mac: ["Codex.app"], win: ["%LOCALAPPDATA%\\Programs\\Codex\\Codex.exe"] }, protocolApp),
    claudeCli: Boolean(claudeCli), codexCli: Boolean(codexCli),
  };
}

/**
 * The tabs of step 2 ("Build it in your tool") for what is installed, in this order: VS Code (with an agent extension or CLI), the Claude
 * app, Codex (its app or CLI), a terminal (with one of the CLIs). Nothing found: one tab with the task only.
 */
export function handoffTabs(t) {
  const tabs = [];
  if (t.vscode && (t.vscodeClaude || t.vscodeCodex || t.claudeCli || t.codexCli)) tabs.push("vscode");
  if (t.claudeApp) tabs.push("app");
  if (t.codexApp) tabs.push("codex");
  if (t.claudeCli || t.codexCli) tabs.push("terminal");
  return tabs.length ? tabs : ["task"];
}
