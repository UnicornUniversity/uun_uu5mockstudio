import test from "node:test";
import assert from "node:assert/strict";
import { settingsSections, rowValue } from "../src/renderer/settingsModel.js";

const ids = (o) => settingsSections(o).flatMap((s) => s.rows.map((r) => r.id));
const section = (o, id) => settingsSections(o).find((s) => s.id === id);

test("Settings groups everything that was spread over View, Help and Project", () => {
  assert.deepEqual(settingsSections({ platform: "darwin", agents: ["claude", "codex"] }).map((s) => s.title), ["General", "Appearance", "AI providers", "Integrations", "Offline use"]);
  assert.deepEqual(ids({ platform: "darwin", agents: ["claude", "codex"] }), ["role", "folder", "theme", "glass", "claude", "codex", "mcp", "images", "offline", "warm", "clear"]);
});

test("AI providers: Claude Code only when it applies, Codex only when it is usable", () => {
  for (const a of [null, [], ["claude"], ["claude", "codex"]]) assert.ok(ids({ agents: a }).includes("claude"), JSON.stringify(a));
  assert.ok(!ids({ agents: ["codex"] }).includes("claude"));
  assert.ok(ids({ agents: ["codex"] }).includes("codex"));
  for (const a of [null, [], ["claude"]]) assert.ok(!ids({ agents: a }).includes("codex"), JSON.stringify(a));
  // a Codex-only user still sees the AI providers group, a group without rows would be dropped
  assert.ok(section({ agents: ["codex"] }, "ai"));
});

test("Glass effect exists only on macOS", () => {
  assert.ok(ids({ platform: "darwin" }).includes("glass"));
  for (const p of ["win32", "linux"]) assert.ok(!ids({ platform: p }).includes("glass"), p);
});

test("every row is an action with a menu action id, a choice with options or a toggle with a key", () => {
  for (const s of settingsSections({ platform: "darwin", agents: ["claude", "codex"] })) for (const r of s.rows) {
    assert.ok(r.title && r.desc, r.id);
    if (r.kind === "action") assert.ok(r.action && r.button, r.id);
    else if (r.kind === "choice") assert.ok(r.key && r.options.length > 1, r.id);
    else if (r.kind === "toggle") assert.ok(r.key, r.id);
    else assert.fail(`unknown kind of ${r.id}`);
  }
});

test("row values: the role label and the state of picture generation", () => {
  const row = (id) => settingsSections({ agents: null }).flatMap((s) => s.rows).find((r) => r.id === id);
  assert.equal(rowValue(row("role"), { roleLabel: "Solution architect" }), "Solution architect");
  assert.equal(rowValue(row("role"), {}), "not chosen");
  assert.equal(rowValue(row("images"), { images: { enabled: true, hasKey: true } }), "on");
  assert.equal(rowValue(row("images"), { images: { enabled: true, hasKey: false } }), "on, no key");
  assert.equal(rowValue(row("images"), { images: { enabled: false, hasKey: true } }), "off");
  assert.equal(rowValue(row("folder"), {}), "");
});
