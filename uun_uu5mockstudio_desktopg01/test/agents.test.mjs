import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmp } from "./helpers.mjs";
import { claudeModelOptions, codexModelOptions, listAgents } from "../src/main/agents.mjs";
import { buildMenuTemplate } from "../src/main/menu.mjs";

test("Claude's default row means no override, the others are passed by value", () => {
  const o = claudeModelOptions([{ value: "default", displayName: "Default (recommended)", description: "x" }, { value: "opus", displayName: "Opus 5.5" }, { displayName: "broken" }]);
  assert.deepEqual(o.map((m) => [m.id, m.label]), [["", "Default (recommended)"], ["opus", "Opus 5.5"]]);
  assert.deepEqual(claudeModelOptions(null), []);
});

test("Codex models: only the visible ones, in its order, with the configured default first", () => {
  const cache = { models: [
    { slug: "b", display_name: "B", visibility: "list", priority: 2 }, { slug: "hid", display_name: "H", visibility: "hide", priority: 1 }, { slug: "a", display_name: "A", visibility: "list", priority: 0 },
  ] };
  const r = codexModelOptions(cache, 'personality = "x"\nmodel = "a"\n');
  assert.deepEqual(r.models.map((m) => m.id), ["codex", "codex:a", "codex:b"]);
  assert.equal(r.defaultLabel, "Default (A)");
  assert.equal(codexModelOptions(null, "").models.length, 1);
});

async function home() {
  const h = await tmp(); await mkdir(path.join(h, ".codex"), { recursive: true });
  await writeFile(path.join(h, ".codex", "models_cache.json"), JSON.stringify({ models: [{ slug: "m", display_name: "M", visibility: "list", priority: 0 }] }));
  await writeFile(path.join(h, ".codex", "config.toml"), 'model = "m"\n');
  return h;
}
const claudeOk = { state: "ready" }, codexOk = { installed: true, loggedIn: true };

test("only providers that are installed and signed in are listed", async () => {
  const deps = (c, x, h) => ({ claudeStatus: async () => c, codexStatus: async () => x, claudeModels: async () => [{ id: "", label: "Default", description: "" }], home: h });
  const h = await home();
  assert.deepEqual((await listAgents({ refresh: true, deps: deps(claudeOk, codexOk, h) })).map((a) => a.provider), ["claude", "codex"]);
  assert.deepEqual((await listAgents({ refresh: true, deps: deps({ state: "loggedOut" }, codexOk, h) })).map((a) => a.provider), ["codex"]);
  assert.deepEqual((await listAgents({ refresh: true, deps: deps({ state: "pluginsMissing" }, { installed: true, loggedIn: false }, h) })).map((a) => a.provider), ["claude"]);
  assert.deepEqual(await listAgents({ refresh: true, deps: deps({ state: "missing" }, { installed: false, loggedIn: false }, h) }), []);
});

