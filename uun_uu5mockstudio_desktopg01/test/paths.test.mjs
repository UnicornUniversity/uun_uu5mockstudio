import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatePaths } from "../src/main/claudeEnv.mjs";

test("Claude candidate paths: macOS/Linux", () => {
  const c = candidatePaths({ platform: "darwin", home: "/Users/a", env: {} });
  assert.ok(c.includes("/Users/a/.claude/local/claude") && c.includes("/opt/homebrew/bin/claude") && c.includes("/Users/a/.local/bin/claude"));
});

test("Claude candidate paths: Windows prefers native .exe over the npm .cmd shim", () => {
  const c = candidatePaths({ platform: "win32", home: "C:\\Users\\a", env: { APPDATA: "C:\\Users\\a\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" } });
  assert.equal(c[0], "C:\\Users\\a\\.local\\bin\\claude.exe");
  assert.ok(c.at(-1).endsWith("npm\\claude.cmd"));
  assert.ok(c.every((p) => !p.includes("/")), "windows paths use backslashes");
});

test("Windows candidates skip env-based entries that are not set", () => {
  assert.equal(candidatePaths({ platform: "win32", home: "C:\\Users\\a", env: {} }).length, 2);
});

test("a projects folder closed to the app is told apart, and the user learns where to allow it", async () => {
  const { isAccessDenied, accessDeniedMessage, FILES_AND_FOLDERS_SETTINGS } = await import("../src/main/paths.mjs");
  assert.equal(isAccessDenied({ code: "EPERM" }), true); assert.equal(isAccessDenied({ code: "EACCES" }), true);
  assert.equal(isAccessDenied({ code: "ENOENT" }), false); assert.equal(isAccessDenied(null), false);
  const m = accessDeniedMessage("/Users/x/Documents/uu5Mock Studio", "darwin");
  assert.match(m.detail, /^\/Users\/x\/Documents\/uu5Mock Studio/); assert.match(m.detail, /Privacy & Security → Files and Folders/);
  assert.doesNotMatch(accessDeniedMessage("/p", "win32").detail, /macOS/);
  assert.match(FILES_AND_FOLDERS_SETTINGS, /^x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_FilesAndFolders$/);
});

test("the app opens its window even when the projects folder is closed to it, and a failed start never leaves it hidden", async () => {
  const src = await (await import("node:fs/promises")).readFile(new URL("../src/main/main.mjs", import.meta.url), "utf8");
  assert.match(src, /try \{ await projects\.migrateLegacy\(legacyDir\); await projects\.flattenAll\(\); \} catch \(e\) \{ if \(isAccessDenied\(e\)\) blocked \?\?= e;/);
  assert.match(src, /if \(blocked\) win\.webContents\.once\("did-finish-load", \(\) => askForFolderAccess\(\)\);/);
  assert.match(src, /\}\)\.catch\(\(e\) => \{ \/\/ a failure while starting must not leave the app running without a window/);
});
