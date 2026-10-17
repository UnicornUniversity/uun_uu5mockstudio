import fs from "node:fs";
import path from "node:path";

/**
 * What the app needs besides Claude Code itself: plugins and the marketplace they come from. The defaults are baked in, a
 * `prerequisites.json` in the app's data folder (or STUDIO_MARKETPLACE_SOURCE / STUDIO_MARKETPLACE_NAME) overrides them, e.g. for a mirror.
 */
export const DEFAULTS = {
  marketplace: { name: "uu-technical-products-mp", source: "ssh://git@uucodebase.plus4u.net:9422/ec65742216410afe7eced8e5ede01102/uu-technical-products-mp.git" },
  required: ["uu5-mockup", "uugds"], // skills the agent builds the mockups with
  recommended: ["uu5-development"], // component reference for the inspector
  minVersions: {}, // { plugin: "x.y.z" }: older than this counts as "needs update"
};

export function loadPrerequisites({ userDataDir, env = process.env } = {}) {
  let file = {};
  try { if (userDataDir) file = JSON.parse(fs.readFileSync(path.join(userDataDir, "prerequisites.json"), "utf8")); } catch { /* none or unreadable: defaults */ }
  const list = (v, d) => (Array.isArray(v) && v.every((x) => typeof x === "string" && /^[\w.-]+$/.test(x)) ? v : d);
  const mp = { ...DEFAULTS.marketplace, ...(file.marketplace ?? {}) };
  if (env.STUDIO_MARKETPLACE_SOURCE) mp.source = env.STUDIO_MARKETPLACE_SOURCE;
  if (env.STUDIO_MARKETPLACE_NAME) mp.name = env.STUDIO_MARKETPLACE_NAME;
  if (!/^[\w.-]+$/.test(mp.name)) mp.name = DEFAULTS.marketplace.name;
  return { marketplace: mp, required: list(file.required, DEFAULTS.required), recommended: list(file.recommended, DEFAULTS.recommended), minVersions: { ...DEFAULTS.minVersions, ...(file.minVersions ?? {}) } };
}

/** -1 / 0 / 1 for dotted version numbers (numeric parts compared as numbers: 0.9.0 < 0.10.0; a pre-release suffix sorts before the release). */
export function compareVersions(a, b) {
  const parse = (v) => { const [core, pre] = String(v ?? "0").split("-"); return { n: core.split(".").map((x) => parseInt(x, 10) || 0), pre }; };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.n.length, y.n.length); i++) { const d = (x.n[i] ?? 0) - (y.n[i] ?? 0); if (d) return d < 0 ? -1 : 1; }
  if (x.pre && !y.pre) return -1; if (!x.pre && y.pre) return 1;
  return 0;
}

/**
 * `claude plugin list --json` -> one entry per wanted plugin: { name, id, kind: "required"|"recommended", state, version }.
 * state: "ok" | "disabled" | "missing" | "outdated" (installed but older than the minimum version).
 */
export function pluginStates(installed, cfg) {
  const byName = new Map();
  for (const p of Array.isArray(installed) ? installed : []) {
    const [name, mp] = String(p.id ?? "").split("@");
    if (mp === cfg.marketplace.name) byName.set(name, p);
  }
  const entry = (name, kind) => {
    const p = byName.get(name), min = cfg.minVersions[name];
    const state = !p ? "missing" : p.enabled === false ? "disabled" : min && compareVersions(p.version, min) < 0 ? "outdated" : "ok";
    return { name, id: `${name}@${cfg.marketplace.name}`, kind, state, version: p?.version ?? null };
  };
  return [...cfg.required.map((n) => entry(n, "required")), ...cfg.recommended.map((n) => entry(n, "recommended"))];
}

/** Makes sense of a failed `marketplace add` / `plugin install`: { kind: "ssh" | "network" | "other", message }. */
export function classifyInstallError(output) {
  const t = String(output ?? "");
  if (/Permission denied \(publickey|Host key verification failed|Could not read from remote repository|no such identity|Authentication failed|git@[^ ]+: Permission denied/i.test(t))
    return { kind: "ssh", message: "Access to the plugin repository was refused. You need access to uuCodebase (an SSH key registered there) to install these plugins." };
  if (/Could not resolve host|Network is unreachable|Connection timed out|Connection refused|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|timed out/i.test(t))
    return { kind: "network", message: "The plugin repository could not be reached. Check the network or VPN and try again." };
  return { kind: "other", message: t.trim().split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 300) || "The command failed." };
}

/** The steps that bring the plugins in: add the marketplace if it is not there, install or enable what is not ok. */
export function installPlan(states, marketplaceKnown, cfg) {
  const steps = [];
  if (!marketplaceKnown && states.some((s) => s.state === "missing")) steps.push({ label: `Add the marketplace ${cfg.marketplace.name}`, args: ["plugin", "marketplace", "add", cfg.marketplace.source, "--scope", "user"] });
  for (const s of states) {
    if (s.state === "missing") steps.push({ label: `Install ${s.name}`, args: ["plugin", "install", s.id, "-y", "--scope", "user"] });
    else if (s.state === "disabled") steps.push({ label: `Enable ${s.name}`, args: ["plugin", "enable", s.id] });
    else if (s.state === "outdated") steps.push({ label: `Update ${s.name}`, args: ["plugin", "update", s.id, "-y"] });
  }
  return steps;
}
