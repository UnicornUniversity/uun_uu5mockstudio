import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const run = promisify(execFile);
let cached;

/** `CODEX_CLI_PATH` as the ChatGPT app writes it into ~/.codex/config.toml (a quoted string on one line). */
export function configuredPath(toml) {
  const m = /^\s*CODEX_CLI_PATH\s*=\s*"([^"\n]+)"/m.exec(String(toml ?? ""));
  return m ? m[1] : null;
}

/** Well-known install locations, used when the shell lookup finds nothing. */
export function candidatePaths({ platform = process.platform, home = os.homedir(), env = process.env, config = "" } = {}) {
  const fromConfig = configuredPath(config);
  if (platform === "win32") {
    const j = path.win32.join;
    return [fromConfig, env.APPDATA && j(env.APPDATA, "npm", "codex.cmd"), j(home, ".local", "bin", "codex.exe")].filter(Boolean);
  }
  const j = path.posix.join;
  return [fromConfig, "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex", j(home, ".local/bin/codex"), j(home, ".npm-global/bin/codex"), "/opt/homebrew/bin/codex", "/usr/local/bin/codex"].filter(Boolean);
}

const isShim = (bin) => process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);

/** Whether the binary really starts: an npm install can leave a `codex` shim on PATH whose native binary is missing. */
async function works(bin) {
  try { await run(bin, ["--version"], { timeout: 10000, shell: isShim(bin) }); return true; } catch { return false; }
}

/** The Codex CLI: STUDIO_CODEX_BIN, then what a login shell finds (GUI apps have no shell PATH), then the common locations; the first that starts wins. */
export async function findCodex({ refresh = false } = {}) {
  if (process.env.STUDIO_CODEX_BIN) return (cached = existsSync(process.env.STUDIO_CODEX_BIN) ? process.env.STUDIO_CODEX_BIN : undefined);
  if (cached && !refresh && existsSync(cached)) return cached;
  cached = undefined;
  const found = [];
  try {
    const out = process.platform === "win32"
      ? (await run("where", ["codex"], { timeout: 8000 })).stdout
      : (await run(process.env.SHELL || "/bin/zsh", ["-lc", "command -v codex"], { timeout: 8000 })).stdout;
    found.push(...out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && existsSync(l)).sort((x, y) => isShim(x) - isShim(y)));
  } catch {}
  let config = ""; try { config = readFileSync(path.join(os.homedir(), ".codex", "config.toml"), "utf8"); } catch {}
  for (const bin of new Set([...found, ...candidatePaths({ config }).filter(existsSync)])) if (await works(bin)) return (cached = bin);
  return undefined;
}

export function requireCodex() {
  if (!cached) throw new Error("Codex was not found. Install the Codex CLI or the ChatGPT app, or set STUDIO_CODEX_BIN.");
  return cached;
}
export const codexShell = () => Boolean(cached && isShim(cached));

/** `codex login status`: { installed, loggedIn, text }. Never rejects. */
export async function codexStatus({ refresh = false } = {}) {
  const bin = await findCodex({ refresh });
  if (!bin) return { installed: false, loggedIn: false, text: "Codex was not found." };
  try {
    const r = await run(bin, ["login", "status"], { timeout: 15000, shell: isShim(bin) });
    const text = `${r.stdout}${r.stderr}`.trim();
    return { installed: true, loggedIn: /logged in/i.test(text) && !/not logged in/i.test(text), text };
  } catch (e) {
    return { installed: true, loggedIn: false, text: String(e?.stdout ?? e?.stderr ?? e?.message ?? e).trim() };
  }
}

/** The version of the Codex CLI ("0.166.0-alpha.5.1"), or null. */
export async function codexVersion() {
  const bin = await findCodex();
  if (!bin) return null;
  try { const r = await run(bin, ["--version"], { timeout: 10000, shell: isShim(bin) }); return /(\d+\.\d+\.\d+[^\s]*)/.exec(`${r.stdout}`)?.[1] ?? null; } catch { return null; }
}
