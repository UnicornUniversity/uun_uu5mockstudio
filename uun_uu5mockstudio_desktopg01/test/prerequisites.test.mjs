import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmp } from "./helpers.mjs";
import { DEFAULTS, loadPrerequisites, compareVersions, pluginStates, classifyInstallError, installPlan } from "../src/main/prerequisites.mjs";
import { shouldCheck, latestVersion, findUpdates } from "../src/main/pluginUpdates.mjs";

const cfg = loadPrerequisites({ env: {} });

test("defaults name the uu5 marketplace and the plugins", () => {
  assert.equal(cfg.marketplace.name, "uu-technical-products-mp"); assert.match(cfg.marketplace.source, /^ssh:\/\/git@uucodebase\.plus4u\.net/);
  assert.deepEqual(cfg.required, ["uu5-mockup", "uugds"]); assert.deepEqual(cfg.recommended, ["uu5-development"]);
});

test("prerequisites.json and environment variables override the defaults, bad values are ignored", async () => {
  const dir = await tmp("prereq");
  await writeFile(path.join(dir, "prerequisites.json"), JSON.stringify({ marketplace: { source: "https://mirror.example/mp.git" }, required: ["uugds"], recommended: "nope", minVersions: { uugds: "0.3.0" } }));
  const c = loadPrerequisites({ userDataDir: dir, env: {} });
  assert.equal(c.marketplace.source, "https://mirror.example/mp.git"); assert.equal(c.marketplace.name, DEFAULTS.marketplace.name);
  assert.deepEqual(c.required, ["uugds"]); assert.deepEqual(c.recommended, DEFAULTS.recommended); assert.equal(c.minVersions.uugds, "0.3.0");
  const e = loadPrerequisites({ userDataDir: dir, env: { STUDIO_MARKETPLACE_SOURCE: "/local/mp", STUDIO_MARKETPLACE_NAME: "bad name!" } });
  assert.equal(e.marketplace.source, "/local/mp"); assert.equal(e.marketplace.name, DEFAULTS.marketplace.name);
  await writeFile(path.join(dir, "prerequisites.json"), "{ broken");
  assert.deepEqual(loadPrerequisites({ userDataDir: dir, env: {} }).required, DEFAULTS.required);
});

test("compareVersions compares numbers, not strings", () => {
  assert.equal(compareVersions("0.9.0", "0.10.0"), -1); assert.equal(compareVersions("1.5.0", "1.5"), 0); assert.equal(compareVersions("2.0.0", "1.99.9"), 1);
  assert.equal(compareVersions("1.0.0-beta", "1.0.0"), -1); assert.equal(compareVersions(undefined, "0.0.1"), -1);
});

test("pluginStates: ok, disabled, missing and outdated, only for the configured marketplace", () => {
  const installed = [
    { id: "uugds@uu-technical-products-mp", version: "0.2.1", enabled: true },
    { id: "uu5-mockup@uu-technical-products-mp", version: "0.2.1", enabled: false },
    { id: "uu5-development@other-mp", version: "9.9.9", enabled: true },
  ];
  const s = pluginStates(installed, { ...cfg, minVersions: { uugds: "0.3.0" } });
  assert.deepEqual(s.map((x) => [x.name, x.kind, x.state]), [["uu5-mockup", "required", "disabled"], ["uugds", "required", "outdated"], ["uu5-development", "recommended", "missing"]]);
  assert.equal(pluginStates([], cfg).every((x) => x.state === "missing"), true);
  assert.equal(pluginStates("garbage", cfg).length, 3);
});

test("classifyInstallError recognises missing SSH access and network trouble", () => {
  assert.equal(classifyInstallError("git@uucodebase.plus4u.net: Permission denied (publickey).\nfatal: Could not read from remote repository.").kind, "ssh");
  assert.equal(classifyInstallError("Host key verification failed.").kind, "ssh");
  assert.equal(classifyInstallError("ssh: Could not resolve hostname uucodebase.plus4u.net").kind, "network");
  const o = classifyInstallError("something\nelse\nbroke"); assert.equal(o.kind, "other"); assert.match(o.message, /broke/);
});

test("installPlan: adds the marketplace only when it is missing and needed, then install / enable / update", () => {
  const states = [{ name: "uu5-mockup", id: "uu5-mockup@m", state: "missing" }, { name: "uugds", id: "uugds@m", state: "disabled" }, { name: "x", id: "x@m", state: "outdated" }, { name: "ok", id: "ok@m", state: "ok" }];
  const plan = installPlan(states, false, cfg);
  assert.deepEqual(plan.map((s) => s.args.slice(0, 3)), [["plugin", "marketplace", "add"], ["plugin", "install", "uu5-mockup@m"], ["plugin", "enable", "uugds@m"], ["plugin", "update", "x@m"]]);
  assert.equal(plan[0].args[3], cfg.marketplace.source);
  assert.equal(installPlan(states, true, cfg).length, 3);
  assert.deepEqual(installPlan([{ name: "a", id: "a@m", state: "ok" }], false, cfg), []);
});

test("shouldCheck: every 6 hours, a manual check always", () => {
  const now = 1_000_000_000_000;
  assert.equal(shouldCheck(null, now), true); assert.equal(shouldCheck(now - 3600e3, now), false); assert.equal(shouldCheck(now - 7 * 3600e3, now), true); assert.equal(shouldCheck(now - 60e3, now, true), true);
});

test("latestVersion reads the plugin manifest or the marketplace catalog; findUpdates compares and honours Later", async () => {
  const mp = await tmp("mp");
  await mkdir(path.join(mp, "plugins", "uugds", ".claude-plugin"), { recursive: true });
  await writeFile(path.join(mp, "plugins", "uugds", ".claude-plugin", "plugin.json"), JSON.stringify({ version: "0.10.0" }));
  await mkdir(path.join(mp, ".claude-plugin"), { recursive: true });
  await writeFile(path.join(mp, ".claude-plugin", "marketplace.json"), JSON.stringify({ plugins: [{ name: "uu5-mockup", version: "0.3.0" }] }));
  assert.equal(latestVersion(mp, "uugds"), "0.10.0"); assert.equal(latestVersion(mp, "uu5-mockup"), "0.3.0"); assert.equal(latestVersion(mp, "nope"), null);
  const states = [{ name: "uugds", id: "uugds@m", state: "ok", version: "0.9.0" }, { name: "uu5-mockup", id: "uu5-mockup@m", state: "ok", version: "0.3.0" }, { name: "gone", id: "gone@m", state: "missing", version: null }];
  assert.deepEqual(findUpdates(states, mp), [{ name: "uugds", id: "uugds@m", installed: "0.9.0", latest: "0.10.0" }]);
  assert.deepEqual(findUpdates(states, mp, { later: { "uugds@m": "0.10.0" } }), []);
  assert.equal(findUpdates(states, mp, { later: { "uugds@m": "0.9.5" } }).length, 1); // postponed an older version only
});
