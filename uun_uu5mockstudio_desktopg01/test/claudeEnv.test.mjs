import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, chmod, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getStatus, installPlugins, installClaude, installerCommand, login, checkPluginUpdates, updatePlugins, configure } from "../src/main/claudeEnv.mjs";
import { tmp } from "./helpers.mjs";

afterEach(() => delete process.env.STUDIO_CLAUDE_BIN);

const PLUGINS_OK = JSON.stringify([
  { id: "uu5-mockup@uu-technical-products-mp", version: "0.2.1", enabled: true }, { id: "uugds@uu-technical-products-mp", version: "0.2.1", enabled: true }, { id: "uu5-development@uu-technical-products-mp", version: "1.5.0", enabled: true },
]);
/**
 * A stand-in for the `claude` CLI. `auth` / `list` / `market` are shell snippets answering `auth ...`, `plugin list --json` and
 * `plugin marketplace list --json`; every other call is appended to `<dir>/calls.log` and answered by `other` (default: success).
 */
async function fakeClaude(authScript, { list = PLUGINS_OK, market = '[{"name":"uu-technical-products-mp","source":"directory","installLocation":"/x"}]', other = "exit 0" } = {}) {
  const dir = await tmp("claude"), bin = path.join(dir, "claude");
  await writeFile(bin, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then ${authScript}; exit 0; fi
if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then echo '${list}'; exit 0; fi
if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "list" ]; then echo '${market}'; exit 0; fi
echo "$@" >> "${dir}/calls.log"
${other}
`);
  await chmod(bin, 0o755);
  return bin;
}
const calls = async (bin) => (await readFile(path.join(path.dirname(bin), "calls.log"), "utf8").catch(() => "")).split("\n").filter(Boolean);

test("missing when the configured binary does not exist", async () => {
  process.env.STUDIO_CLAUDE_BIN = "/nonexistent/claude";
  assert.equal((await getStatus({ refresh: true })).state, "missing");
});

test("ready when logged in", async () => {
  process.env.STUDIO_CLAUDE_BIN = await fakeClaude(`echo '{"loggedIn":true,"email":"a@b.cz","authMethod":"claude.ai"}'`);
  const s = await getStatus({ refresh: true });
  assert.equal(s.state, "ready"); assert.equal(s.email, "a@b.cz"); assert.match(s.version, /9\.9\.9/);
});

test("loggedOut when loggedIn is false, also with a non-zero exit code", async () => {
  process.env.STUDIO_CLAUDE_BIN = await fakeClaude(`echo '{"loggedIn":false}'`);
  assert.equal((await getStatus({ refresh: true })).state, "loggedOut");
  process.env.STUDIO_CLAUDE_BIN = await fakeClaude(`echo '{"loggedIn":false}'; exit 1`);
  assert.equal((await getStatus({ refresh: true })).state, "loggedOut");
});

test("loggedOut (with the error) when auth status prints garbage", async () => {
  process.env.STUDIO_CLAUDE_BIN = await fakeClaude(`echo 'not json'; exit 2`);
  const s = await getStatus({ refresh: true });
  assert.equal(s.state, "loggedOut"); assert.ok(s.error);
});

test("pluginsMissing when logged in but a required plugin is not installed, ready again once it is", async () => {
  const none = JSON.stringify([{ id: "uugds@uu-technical-products-mp", version: "0.2.1", enabled: true }]);
  process.env.STUDIO_CLAUDE_BIN = await fakeClaude(`echo '{"loggedIn":true}'`, { list: none });
  const s = await getStatus({ refresh: true });
  assert.equal(s.state, "pluginsMissing");
  assert.deepEqual(s.plugins.map((p) => [p.name, p.state]), [["uu5-mockup", "missing"], ["uugds", "ok"], ["uu5-development", "missing"]]);
  process.env.STUDIO_CLAUDE_BIN = await fakeClaude(`echo '{"loggedIn":true}'`);
  assert.equal((await getStatus({ refresh: true })).state, "ready");
});

test("a missing recommended plugin does not block", async () => {
  const noDocs = JSON.stringify([{ id: "uu5-mockup@uu-technical-products-mp", version: "1", enabled: true }, { id: "uugds@uu-technical-products-mp", version: "1", enabled: true }]);
  process.env.STUDIO_CLAUDE_BIN = await fakeClaude(`echo '{"loggedIn":true}'`, { list: noDocs });
  const s = await getStatus({ refresh: true });
  assert.equal(s.state, "ready"); assert.equal(s.plugins.find((p) => p.name === "uu5-development").state, "missing");
});

test("a logged-out user is asked to sign in before plugins are looked at", async () => {
  process.env.STUDIO_CLAUDE_BIN = await fakeClaude(`echo '{"loggedIn":false}'`, { list: "[]" });
  assert.equal((await getStatus({ refresh: true })).state, "loggedOut");
});

test("installPlugins adds the marketplace, installs the missing plugins and reports every step", async () => {
  const bin = await fakeClaude(`echo '{"loggedIn":true}'`, { list: "[]", market: "[]" });
  process.env.STUDIO_CLAUDE_BIN = bin; await getStatus({ refresh: true });
  const seen = [], r = await installPlugins({ onStep: (e) => seen.push(`${e.state}:${e.label}`) });
  assert.equal(r.ok, true);
  const log = await calls(bin);
  assert.match(log[0], /^plugin marketplace add ssh:\/\/git@uucodebase\.plus4u\.net\S+ --scope user$/);
  assert.deepEqual(log.slice(1), ["plugin install uu5-mockup@uu-technical-products-mp -y --scope user", "plugin install uugds@uu-technical-products-mp -y --scope user", "plugin install uu5-development@uu-technical-products-mp -y --scope user"]);
  assert.equal(seen.filter((x) => x.startsWith("ok:")).length, 4);
});

test("installPlugins stops at the first failure and explains missing SSH access", async () => {
  const bin = await fakeClaude(`echo '{"loggedIn":true}'`, { list: "[]", market: "[]", other: `echo "git@uucodebase.plus4u.net: Permission denied (publickey)." >&2; exit 1` });
  process.env.STUDIO_CLAUDE_BIN = bin; await getStatus({ refresh: true });
  const r = await installPlugins();
  assert.equal(r.ok, false); assert.equal(r.error.kind, "ssh"); assert.match(r.error.message, /uuCodebase/);
  assert.equal((await calls(bin)).length, 1); // nothing else was tried after the marketplace failed
});

test("installPlugins does nothing when everything is in order", async () => {
  const bin = await fakeClaude(`echo '{"loggedIn":true}'`);
  process.env.STUDIO_CLAUDE_BIN = bin; await getStatus({ refresh: true });
  assert.deepEqual(await installPlugins(), { ok: true, steps: [] }); assert.deepEqual(await calls(bin), []);
});

test("login passes the chosen method and e-mail to `claude auth login`", async () => {
  const bin = await fakeClaude(`echo '{"loggedIn":false}'`, { other: `exit 0` });
  process.env.STUDIO_CLAUDE_BIN = bin; await getStatus({ refresh: true });
  assert.equal(await login({}), 0); assert.equal(await login({ method: "console" }), 0); assert.equal(await login({ method: "sso", email: "a@b.cz" }), 0); await login({ email: "not an e-mail" });
  assert.deepEqual(await calls(bin), ["auth login --claudeai", "auth login --console", "auth login --sso --email a@b.cz", "auth login --claudeai"]);
});

test("installerCommand: the official installer per platform, replaceable for tests", () => {
  assert.match(installerCommand("darwin", {}).shown, /^curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash$/);
  assert.equal(installerCommand("win32", {}).cmd, "powershell.exe"); assert.match(installerCommand("win32", {}).shown, /install\.ps1/);
  assert.equal(installerCommand("linux", { STUDIO_INSTALL_CMD: "/tmp/x.sh" }).cmd, "/tmp/x.sh");
});

test("installClaude streams the installer's output and finds the new claude", async () => {
  const dir = await tmp("inst"), fake = await fakeClaude(`echo '{"loggedIn":false}'`), installer = path.join(dir, "install.sh");
  await writeFile(installer, `#!/bin/sh\necho "Downloading..."\necho "Installed to ${fake}"\n`); await chmod(installer, 0o755);
  process.env.STUDIO_INSTALL_CMD = installer; process.env.STUDIO_CLAUDE_BIN = "/nonexistent/claude";
  try {
    const lines = [], p = installClaude({ onLine: (l) => lines.push(l) });
    await new Promise((r) => setTimeout(r, 50)); process.env.STUDIO_CLAUDE_BIN = fake; // "the installer put claude in place"
    const r = await p;
    assert.deepEqual(lines, ["Downloading...", `Installed to ${fake}`]); assert.equal(r.ok, true); assert.equal(r.status.state, "loggedOut");
  } finally { delete process.env.STUDIO_INSTALL_CMD; }
});

test("installClaude reports a failing installer", async () => {
  const dir = await tmp("inst2"), installer = path.join(dir, "install.sh");
  await writeFile(installer, `#!/bin/sh\necho "curl: (6) Could not resolve host" >&2\nexit 6\n`); await chmod(installer, 0o755);
  process.env.STUDIO_INSTALL_CMD = installer; process.env.STUDIO_CLAUDE_BIN = "/nonexistent/claude";
  try { const r = await installClaude(); assert.equal(r.ok, false); assert.equal(r.code, 6); assert.match(r.output, /Could not resolve host/); } finally { delete process.env.STUDIO_INSTALL_CMD; }
});

test("checkPluginUpdates compares installed versions with the marketplace folder; updatePlugins runs `plugin update -y`", async () => {
  const mp = await tmp("mpdir");
  for (const [name, version] of [["uugds", "0.3.0"], ["uu5-mockup", "0.2.1"]]) {
    await mkdir(path.join(mp, "plugins", name, ".claude-plugin"), { recursive: true });
    await writeFile(path.join(mp, "plugins", name, ".claude-plugin", "plugin.json"), JSON.stringify({ version }));
  }
  const market = JSON.stringify([{ name: "uu-technical-products-mp", source: "directory", installLocation: mp }]);
  const bin = await fakeClaude(`echo '{"loggedIn":true}'`, { market });
  process.env.STUDIO_CLAUDE_BIN = bin; await getStatus({ refresh: true });
  const r = await checkPluginUpdates();
  assert.deepEqual(r, { updates: [{ name: "uugds", id: "uugds@uu-technical-products-mp", installed: "0.2.1", latest: "0.3.0" }], checked: true });
  assert.equal((await calls(bin))[0], "plugin marketplace update uu-technical-products-mp"); // the catalog is refreshed first
  assert.deepEqual((await checkPluginUpdates({ later: { "uugds@uu-technical-products-mp": "0.3.0" } })).updates, []);
  const u = await updatePlugins(["uugds@uu-technical-products-mp", "evil@elsewhere"]);
  assert.equal(u.ok, true); assert.deepEqual(u.steps, [{ id: "uugds@uu-technical-products-mp", ok: true }]); // other marketplaces are refused
  assert.ok((await calls(bin)).includes("plugin update uugds@uu-technical-products-mp -y"));
});

test("checkPluginUpdates without the marketplace configured just reports nothing", async () => {
  process.env.STUDIO_CLAUDE_BIN = await fakeClaude(`echo '{"loggedIn":true}'`, { market: "[]" }); await getStatus({ refresh: true });
  assert.deepEqual(await checkPluginUpdates(), { updates: [], checked: false });
});
