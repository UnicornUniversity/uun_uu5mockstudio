import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPrerequisites, classifyInstallError, compareVersions } from "./prerequisites.mjs";

const run = promisify(execFile);

/** Plugins enabled in Codex, from its config.toml (`[plugins."name@marketplace"]`, `enabled = false` switches one off). `codex plugin list` is not used: one broken marketplace makes it fail as a whole. */
export function installedFromToml(toml) {
  const ids = new Set();
  for (const m of String(toml ?? "").matchAll(/^\[plugins\."([^"\]]+)"\]\s*\n((?:(?!\[).*\n?)*)/gm)) if (!/^\s*enabled\s*=\s*false\b/m.test(m[2])) ids.add(m[1]);
  return ids;
}

/** Marketplaces Codex knows (`[marketplaces.<name>]`). */
export function marketplacesFromToml(toml) {
  return new Set([...String(toml ?? "").matchAll(/^\[marketplaces\.([\w.-]+)\]/gm)].map((m) => m[1]));
}

/** What is to be done so that the skills of the app are in Codex: the plugins that are missing, and the local folder of the marketplace to register first when Codex does not know it. */
export function codexInstallPlan(toml, cfg, { marketplaceDir } = {}) {
  const have = installedFromToml(toml);
  const missing = [...cfg.required, ...cfg.recommended].map((n) => `${n}@${cfg.marketplace.name}`).filter((id) => !have.has(id));
  const addMarketplace = missing.length && !marketplacesFromToml(toml).has(cfg.marketplace.name) && marketplaceDir && fs.existsSync(marketplaceDir) ? marketplaceDir : null;
  return { missing, addMarketplace };
}

/** Where the uuAiMarketplace extension keeps the marketplaces it has synchronised. */
export const marketplaceDirOf = (name, home = os.homedir()) => path.join(home, ".skilled-plus4u-mcp", "marketplaces", name);

/** The newest version of a plugin installed in Codex (its plugin cache holds one folder per version), or null. */
export function installedVersion(name, mp, home = os.homedir()) {
  try { return fs.readdirSync(path.join(home, ".codex", "plugins", "cache", mp, name), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(compareVersions).pop() ?? null; } catch { return null; }
}
/** The version the synchronised marketplace offers (its Codex manifest), or null. */
export function availableVersion(name, mp, home = os.homedir()) {
  try { return JSON.parse(fs.readFileSync(path.join(marketplaceDirOf(mp, home), "plugins", name, ".codex-plugin", "plugin.json"), "utf8")).version ?? null; } catch { return null; }
}
/**
 * Plugins installed in Codex that the marketplace has newer versions of. Codex keeps the installed copy as it was: the uuAiMarketplace
 * extension updates the marketplace folder, and only installing again (`codex plugin add`) brings the new version into Codex.
 */
export function outdatedPlugins(cfg, toml, home = os.homedir()) {
  const have = installedFromToml(toml);
  return [...cfg.required, ...cfg.recommended].filter((n) => {
    const id = `${n}@${cfg.marketplace.name}`, inst = installedVersion(n, cfg.marketplace.name, home), avail = availableVersion(n, cfg.marketplace.name, home);
    return have.has(id) && inst && avail && compareVersions(inst, avail) < 0;
  }).map((n) => `${n}@${cfg.marketplace.name}`);
}

/** The wanted plugins with the version installed in Codex and the one the marketplace offers: [{ name, installed, available }] (null = none). */
export function codexPluginVersions(cfg = loadPrerequisites(), home = os.homedir()) {
  return [...cfg.required, ...cfg.recommended].map((name) => ({ name, installed: installedVersion(name, cfg.marketplace.name, home), available: availableVersion(name, cfg.marketplace.name, home) }));
}

/** The wanted plugins with their state for the window: [{ name, kind, installed, available, state: "ok" | "outdated" | "missing" }]. */
export function codexPluginStates(cfg = loadPrerequisites(), home = os.homedir()) {
  const kind = (n) => (cfg.required.includes(n) ? "required" : "recommended");
  return codexPluginVersions(cfg, home).map((p) => ({ ...p, kind: kind(p.name), state: !p.installed ? "missing" : p.available && compareVersions(p.installed, p.available) < 0 ? "outdated" : "ok" }));
}

/**
 * Installs the missing plugins and brings the outdated ones up to date into Codex with `codex plugin add`. Resolves `{ installed, updated, failed: [{ id, message }], skipped }` and never rejects:
 * a Codex without the plugins still works, the agent just has no skills (the rules are in the prompt).
 * `exec(bin, args)` is injectable for tests; `env` can point Codex to another CODEX_HOME.
 */
export async function ensureCodexPlugins({ bin, cfg = loadPrerequisites(), home = os.homedir(), env = process.env, exec = (b, a, o) => run(b, a, o) } = {}) {
  const out = { installed: [], updated: [], failed: [], skipped: false };
  if (!bin) return { ...out, skipped: true };
  const codexHome = env.CODEX_HOME || path.join(home, ".codex");
  let toml = ""; try { toml = fs.readFileSync(path.join(codexHome, "config.toml"), "utf8"); } catch { /* none yet */ }
  const plan = codexInstallPlan(toml, cfg, { marketplaceDir: marketplaceDirOf(cfg.marketplace.name, home) });
  const outdated = outdatedPlugins(cfg, toml, home);
  if (!plan.missing.length && !outdated.length) return { ...out, skipped: true };
  const opts = { timeout: 120000, env };
  const fail = (id, e) => out.failed.push({ id, message: classifyInstallError(`${e?.stderr ?? ""}${e?.stdout ?? ""}${e?.message ?? ""}`).message });
  if (plan.addMarketplace) {
    try { await exec(bin, ["plugin", "marketplace", "add", plan.addMarketplace], opts); }
    catch (e) { for (const id of plan.missing) fail(id, e); return out; }
  }
  for (const id of plan.missing) {
    try { await exec(bin, ["plugin", "add", id], opts); out.installed.push(id); } catch (e) { fail(id, e); }
  }
  for (const id of outdated) {
    try { await exec(bin, ["plugin", "add", id], opts); out.updated.push(id); } catch (e) { fail(id, e); }
  }
  return out;
}
