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
