import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmp } from "./helpers.mjs";
import { loadPrerequisites } from "../src/main/prerequisites.mjs";
import { installedFromToml, marketplacesFromToml, codexInstallPlan, ensureCodexPlugins } from "../src/main/codexPlugins.mjs";

const cfg = loadPrerequisites({ env: {} });
const TOML = `[marketplaces.uu-technical-products-mp]
source_type = "local"

[plugins."documents@openai-primary-runtime"]
enabled = true

[plugins."uugds@uu-technical-products-mp"]
enabled = true

[plugins."uu5-development@uu-technical-products-mp"]
enabled = false
`;

test("enabled plugins and known marketplaces are read from config.toml", () => {
  assert.deepEqual([...installedFromToml(TOML)].sort(), ["documents@openai-primary-runtime", "uugds@uu-technical-products-mp"]);
  assert.deepEqual([...marketplacesFromToml(TOML)], ["uu-technical-products-mp"]);
  assert.equal(installedFromToml("").size, 0);
});

test("the plan lists what is missing; a marketplace unknown to Codex is added from its local folder", async () => {
  const p = codexInstallPlan(TOML, cfg);
  assert.deepEqual(p.missing, ["uu5-mockup@uu-technical-products-mp", "uu5-development@uu-technical-products-mp"]);
  assert.equal(p.addMarketplace, null);
  const dir = await tmp();
  assert.equal(codexInstallPlan("", cfg, { marketplaceDir: dir }).addMarketplace, dir);
  assert.equal(codexInstallPlan("", cfg, { marketplaceDir: path.join(dir, "none") }).addMarketplace, null);
});

async function home(toml) {
  const h = await tmp(); await mkdir(path.join(h, ".codex"), { recursive: true }); await writeFile(path.join(h, ".codex", "config.toml"), toml);
  await mkdir(path.join(h, ".skilled-plus4u-mcp", "marketplaces", "uu-technical-products-mp"), { recursive: true });
  return h;
}

test("ensure installs the missing plugins one by one and reports failures without throwing", async () => {
  const calls = [];
  const h = await home(TOML);
  const r = await ensureCodexPlugins({ bin: "codex", cfg, home: h, env: {}, exec: async (_b, args) => { calls.push(args.join(" ")); if (args[2] === "uu5-development@uu-technical-products-mp") throw Object.assign(new Error("x"), { stderr: "Permission denied (publickey)" }); } });
  assert.deepEqual(calls, ["plugin add uu5-mockup@uu-technical-products-mp", "plugin add uu5-development@uu-technical-products-mp"]);
  assert.deepEqual(r.installed, ["uu5-mockup@uu-technical-products-mp"]);
  assert.equal(r.failed[0].id, "uu5-development@uu-technical-products-mp");
  assert.match(r.failed[0].message, /SSH key|refused/);
});

test("ensure registers the marketplace first when Codex does not know it, and does nothing when all is there", async () => {
  const calls = [];
  const h = await home("");
  await ensureCodexPlugins({ bin: "codex", cfg, home: h, env: {}, exec: async (_b, args) => { calls.push(args.slice(0, 3).join(" ")); } });
  assert.equal(calls[0], "plugin marketplace add");
  const all = [...cfg.required, ...cfg.recommended].map((n) => `[plugins."${n}@${cfg.marketplace.name}"]\nenabled = true\n`).join("\n");
  const r = await ensureCodexPlugins({ bin: "codex", cfg, home: await home(all), env: {}, exec: async () => { throw new Error("must not run"); } });
  assert.equal(r.skipped, true);
  assert.equal((await ensureCodexPlugins({ cfg })).skipped, true); // no Codex
});

import { installedVersion, availableVersion, outdatedPlugins } from "../src/main/codexPlugins.mjs";

async function withVersions(inst, avail) {
  const h = await home(`[plugins."uugds@uu-technical-products-mp"]\nenabled = true\n`);
  await mkdir(path.join(h, ".codex", "plugins", "cache", "uu-technical-products-mp", "uugds", inst), { recursive: true });
  const pj = path.join(h, ".skilled-plus4u-mcp", "marketplaces", "uu-technical-products-mp", "plugins", "uugds", ".codex-plugin");
  await mkdir(pj, { recursive: true }); await writeFile(path.join(pj, "plugin.json"), JSON.stringify({ version: avail }));
  return h;
}

test("a plugin whose marketplace version is newer is outdated and is installed again", async () => {
  const h = await withVersions("0.2.1", "0.10.0");
  assert.equal(installedVersion("uugds", "uu-technical-products-mp", h), "0.2.1");
  assert.equal(availableVersion("uugds", "uu-technical-products-mp", h), "0.10.0");
  const toml = `[plugins."uugds@uu-technical-products-mp"]\nenabled = true\n`;
  assert.deepEqual(outdatedPlugins({ ...cfg, required: ["uugds"], recommended: [] }, toml, h), ["uugds@uu-technical-products-mp"]);
  const calls = [];
  const r = await ensureCodexPlugins({ bin: "codex", cfg: { ...cfg, required: ["uugds"], recommended: [] }, home: h, env: {}, exec: async (_b, a) => { calls.push(a.join(" ")); } });
  assert.deepEqual(calls, ["plugin add uugds@uu-technical-products-mp"]);
  assert.deepEqual(r.updated, ["uugds@uu-technical-products-mp"]);
});

test("the same or a newer installed version is left alone", async () => {
  const toml = `[plugins."uugds@uu-technical-products-mp"]\nenabled = true\n`, one = { ...cfg, required: ["uugds"], recommended: [] };
  assert.deepEqual(outdatedPlugins(one, toml, await withVersions("0.2.1", "0.2.1")), []);
  assert.deepEqual(outdatedPlugins(one, toml, await withVersions("1.0.0", "0.9.0")), []);
});

import { codexPluginVersions } from "../src/main/codexPlugins.mjs";

test("the versions report lists installed and offered versions of the wanted plugins", async () => {
  const h = await withVersions("0.2.1", "0.3.0");
  const r = codexPluginVersions({ ...cfg, required: ["uugds"], recommended: ["uu5-mockup"] }, h);
  assert.deepEqual(r, [{ name: "uugds", installed: "0.2.1", available: "0.3.0" }, { name: "uu5-mockup", installed: null, available: null }]);
});

import { codexPluginStates } from "../src/main/codexPlugins.mjs";

test("plugin states for the window: ok, outdated, missing, with the kind", async () => {
  const h = await withVersions("0.2.1", "0.3.0");
  const r = codexPluginStates({ ...cfg, required: ["uugds"], recommended: ["uu5-mockup"] }, h);
  assert.deepEqual(r.map((p) => [p.name, p.kind, p.state]), [["uugds", "required", "outdated"], ["uu5-mockup", "recommended", "missing"]]);
  assert.equal(codexPluginStates({ ...cfg, required: ["uugds"], recommended: [] }, await withVersions("0.3.0", "0.3.0"))[0].state, "ok");
});
