import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPrerequisites, marketplaceGroups, classifyInstallError, compareVersions } from "./prerequisites.mjs";

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

/** Every wanted plugin of every marketplace: [{ name, kind, mp }]. */
const wanted = (cfg) => marketplaceGroups(cfg).flatMap((g) => [...g.required.map((name) => ({ name, kind: "required", mp: g.marketplace.name })), ...g.recommended.map((name) => ({ name, kind: "recommended", mp: g.marketplace.name }))]);

/**
 * What is to be done so that the skills of the app are in Codex: the plugins that are missing, and the marketplaces (with their local folders) to register first
 * when Codex does not know them (`addMarketplaces`; `addMarketplace` is the folder of the first one).
 */
export function codexInstallPlan(toml, cfg, { marketplaceDir, home = os.homedir() } = {}) {
  const have = installedFromToml(toml), known = marketplacesFromToml(toml);
  const missingBy = wanted(cfg).filter((w) => !have.has(`${w.name}@${w.mp}`));
  const missing = missingBy.map((w) => `${w.name}@${w.mp}`);
  const addMarketplaces = [];
  for (const mp of new Set(missingBy.map((w) => w.mp))) {
    const dir = mp === cfg.marketplace.name && marketplaceDir ? marketplaceDir : marketplaceDirOf(mp, home);
    if (!known.has(mp) && fs.existsSync(dir)) addMarketplaces.push({ name: mp, dir });
  }
  return { missing, addMarketplace: addMarketplaces[0]?.dir ?? null, addMarketplaces };
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
  return wanted(cfg).filter(({ name, mp }) => {
    const inst = installedVersion(name, mp, home), avail = availableVersion(name, mp, home);
    return have.has(`${name}@${mp}`) && inst && avail && compareVersions(inst, avail) < 0;
  }).map(({ name, mp }) => `${name}@${mp}`);
}

/** The wanted plugins with the version installed in Codex and the one the marketplace offers: [{ name, marketplace, installed, available }] (null = none). */
export function codexPluginVersions(cfg = loadPrerequisites(), home = os.homedir()) {
  return wanted(cfg).map(({ name, mp }) => ({ name, marketplace: mp, installed: installedVersion(name, mp, home), available: availableVersion(name, mp, home) }));
}

/** The wanted plugins with their state for the window: [{ name, kind, installed, available, state: "ok" | "outdated" | "missing" }]. */
export function codexPluginStates(cfg = loadPrerequisites(), home = os.homedir()) {
  const kinds = new Map(wanted(cfg).map((w) => [`${w.name}@${w.mp}`, w.kind]));
  return codexPluginVersions(cfg, home).map((p) => ({ ...p, kind: kinds.get(`${p.name}@${p.marketplace}`), state: !p.installed ? "missing" : p.available && compareVersions(p.installed, p.available) < 0 ? "outdated" : "ok" }));
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
  const plan = codexInstallPlan(toml, cfg, { marketplaceDir: marketplaceDirOf(cfg.marketplace.name, home), home });
  const outdated = outdatedPlugins(cfg, toml, home);
  if (!plan.missing.length && !outdated.length) return { ...out, skipped: true };
  const opts = { timeout: 120000, env };
  const fail = (id, e) => out.failed.push({ id, message: classifyInstallError(`${e?.stderr ?? ""}${e?.stdout ?? ""}${e?.message ?? ""}`).message });
  const broken = new Set();
  for (const m of plan.addMarketplaces) {
    try { await exec(bin, ["plugin", "marketplace", "add", m.dir], opts); }
    catch (e) { broken.add(m.name); for (const id of plan.missing.filter((x) => x.endsWith(`@${m.name}`))) fail(id, e); }
  }
  for (const id of plan.missing.filter((x) => !broken.has(x.split("@")[1]))) {
    try { await exec(bin, ["plugin", "add", id], opts); out.installed.push(id); } catch (e) { fail(id, e); }
  }
  for (const id of outdated) {
    try { await exec(bin, ["plugin", "add", id], opts); out.updated.push(id); } catch (e) { fail(id, e); }
  }
  return out;
}
