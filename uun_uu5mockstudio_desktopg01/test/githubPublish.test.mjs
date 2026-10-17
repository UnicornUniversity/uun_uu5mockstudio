import test from "node:test";
import assert from "node:assert/strict";
import { parseAuthor, releaseAssets, defaultNotes, problems } from "../scripts/lib/githubPublish.mjs";

test("parseAuthor accepts Name <email> only", () => {
  assert.deepEqual(parseAuthor("Marek Beranek <marek@example.org>"), { name: "Marek Beranek", email: "marek@example.org" });
  assert.equal(parseAuthor("marek@example.org"), null); assert.equal(parseAuthor(" <>"), null); assert.equal(parseAuthor(undefined), null);
});

test("releaseAssets picks installers of the version and nothing else", () => {
  const files = ["uu5Mock-Studio-0.1.1-arm64.dmg", "uu5Mock-Studio-0.1.1-arm64.dmg.blockmap", "uu5Mock-Studio-0.1.1-arm64.zip", "uu5Mock-Studio-0.1.0-arm64.dmg", "latest-mac.yml", "builder-debug.yml", "uu5Mock-Studio-0.1.1-x64.exe", "uu5Mock-Studio-0.1.1-x86_64.AppImage", "mac-arm64"];
  assert.deepEqual(releaseAssets(files, "0.1.1"), ["uu5Mock-Studio-0.1.1-arm64.dmg", "uu5Mock-Studio-0.1.1-arm64.zip", "uu5Mock-Studio-0.1.1-x64.exe", "uu5Mock-Studio-0.1.1-x86_64.AppImage"]);
  assert.deepEqual(releaseAssets(files, "0.2.0"), []);
});

test("defaultNotes falls back to a minimal text", () => {
  assert.equal(defaultNotes("1.0.0", "## Notes\n"), "## Notes\n"); assert.match(defaultNotes("1.0.0", "  "), /uu5Mock Studio 1\.0\.0/);
});

test("problems lists everything that blocks publishing", () => {
  const ok = { dirty: false, ghInstalled: true, ghAuthed: true, assets: ["a.dmg"], releaseExists: false, sameTree: false, author: { name: "A", email: "a@b.cz" } };
  assert.deepEqual(problems(ok), []);
  assert.equal(problems({ ...ok, dirty: true, releaseExists: true, sameTree: true, assets: [], author: null }).length, 5);
  assert.match(problems({ ...ok, missingRootFiles: ["LICENSE", "README.md"] })[0], /LICENSE, README\.md/);
  assert.deepEqual(problems({ ...ok, release: false, assets: [], releaseExists: true, ghInstalled: false }), [], "sources only needs neither installers, a free tag nor gh");
  assert.match(problems({ ...ok, ghInstalled: false })[0], /not installed/); assert.match(problems({ ...ok, ghAuthed: false })[0], /not signed in/);
});
