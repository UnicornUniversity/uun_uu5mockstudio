import fs from "node:fs";
import path from "node:path";

/**
 * What the app needs besides Claude Code itself: plugins and the marketplace they come from. The defaults are baked in, a
 * `prerequisites.json` in the app's data folder (or STUDIO_MARKETPLACE_SOURCE / STUDIO_MARKETPLACE_NAME) overrides them, e.g. for a mirror.
 */
export const DEFAULTS = {
  marketplace: { name: "uu-technical-products-mp", source: "ssh://git@uucodebase.plus4u.net:9422/ec65742216410afe7eced8e5ede01102/uu-technical-products-mp.git" },
  required: ["uu5-mockup", "uugds"], // skills the agent builds the mockups with
  recommended: ["uu5-development", "uu5bricks"], // component reference for the inspector (uu5bricks: the Bricks of content pages)
  minVersions: {}, // { plugin: "x.y.z" }: older than this counts as "needs update"
  // more marketplaces with plugins the app uses (it reads uuBookKit pages and uuManagementKit documents through them): installed and kept up to date like the rest
  extra: [
    { marketplace: { name: "uu-business-products-mp", source: "ssh://git@uucodebase.plus4u.net:9422/aef3057e3d70156f0f2e9e7c733c1427/uu-business-products-mp.git" }, required: [], recommended: ["uubookkit", "uumanagementkit"] },
  ],
};

/** Every marketplace the app takes plugins from: the main one (marketplace / required / recommended) first, then `extra`. [{ marketplace, required, recommended }] */
export function marketplaceGroups(cfg) {
  const main = { marketplace: cfg.marketplace, required: cfg.required ?? [], recommended: cfg.recommended ?? [] };
  const seen = new Set([main.marketplace.name]);
  return [main, ...(cfg.extra ?? []).filter((g) => g?.marketplace?.name && !seen.has(g.marketplace.name) && seen.add(g.marketplace.name)).map((g) => ({ marketplace: g.marketplace, required: g.required ?? [], recommended: g.recommended ?? [] }))];
}

export function loadPrerequisites({ userDataDir, env = process.env } = {}) {
  let file = {};
  try { if (userDataDir) file = JSON.parse(fs.readFileSync(path.join(userDataDir, "prerequisites.json"), "utf8")); } catch { /* none or unreadable: defaults */ }
  const list = (v, d) => (Array.isArray(v) && v.every((x) => typeof x === "string" && /^[\w.-]+$/.test(x)) ? v : d);
  const mp = { ...DEFAULTS.marketplace, ...(file.marketplace ?? {}) };
  if (env.STUDIO_MARKETPLACE_SOURCE) mp.source = env.STUDIO_MARKETPLACE_SOURCE;
  if (env.STUDIO_MARKETPLACE_NAME) mp.name = env.STUDIO_MARKETPLACE_NAME;
  if (!/^[\w.-]+$/.test(mp.name)) mp.name = DEFAULTS.marketplace.name;
  const okMp = (m) => m && /^[\w.-]+$/.test(m.name ?? "") && typeof m.source === "string" && m.source.length > 0;
  const extra = Array.isArray(file.extra) ? file.extra.filter((g) => okMp(g?.marketplace)).map((g) => ({ marketplace: { name: g.marketplace.name, source: g.marketplace.source }, required: list(g.required, []), recommended: list(g.recommended, []) })) : DEFAULTS.extra;
  return { marketplace: mp, required: list(file.required, DEFAULTS.required), recommended: list(file.recommended, DEFAULTS.recommended), minVersions: { ...DEFAULTS.minVersions, ...(file.minVersions ?? {}) }, extra };
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
  const list = Array.isArray(installed) ? installed : [];
  const out = [];
  for (const g of marketplaceGroups(cfg)) {
    const mpName = g.marketplace.name, byName = new Map();
    for (const p of list) {
      const [name, mp] = String(p.id ?? "").split("@");
      if (mp === mpName) byName.set(name, p);
    }
    const entry = (name, kind) => {
      const p = byName.get(name), min = cfg.minVersions[name];
      const state = !p ? "missing" : p.enabled === false ? "disabled" : min && compareVersions(p.version, min) < 0 ? "outdated" : "ok";
      return { name, id: `${name}@${mpName}`, marketplace: mpName, kind, state, version: p?.version ?? null };
    };
    out.push(...g.required.map((n) => entry(n, "required")), ...g.recommended.map((n) => entry(n, "recommended")));
  }
  return out;
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

/**
 * The steps that bring the plugins in: add the marketplaces that are not there (only those with a missing plugin), install or enable what is not ok.
 * `marketplaceKnown`: a boolean for all marketplaces, or a Set / array of the names Claude Code knows.
 */
export function installPlan(states, marketplaceKnown, cfg) {
  const steps = [];
  const known = (name) => (typeof marketplaceKnown === "boolean" ? marketplaceKnown : new Set(marketplaceKnown).has(name));
  for (const g of marketplaceGroups(cfg)) {
    if (!known(g.marketplace.name) && states.some((s) => s.state === "missing" && (s.marketplace ?? cfg.marketplace.name) === g.marketplace.name))
      steps.push({ label: `Add the marketplace ${g.marketplace.name}`, args: ["plugin", "marketplace", "add", g.marketplace.source, "--scope", "user"] });
  }
  for (const s of states) {
    if (s.state === "missing") steps.push({ label: `Install ${s.name}`, args: ["plugin", "install", s.id, "-y", "--scope", "user"] });
    else if (s.state === "disabled") steps.push({ label: `Enable ${s.name}`, args: ["plugin", "enable", s.id] });
    else if (s.state === "outdated") steps.push({ label: `Update ${s.name}`, args: ["plugin", "update", s.id, "-y"] });
  }
  return steps;
}
