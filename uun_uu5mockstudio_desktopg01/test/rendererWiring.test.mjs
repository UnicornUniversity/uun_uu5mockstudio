import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The renderer is not unit-tested, so a deleted `const x = ...` only shows as "x is not defined" at run time. This guards the objects
// that many handlers depend on.
test("renderer.js declares the objects its handlers use", async () => {
  const src = await readFile(new URL("../src/renderer/renderer.js", import.meta.url), "utf8");
  for (const name of ["canvas", "memory", "propsPanel", "iconPicker", "inspector", "dock"]) assert.match(src, new RegExp(`^(const|let) ${name}\\b`, "m"), `${name} is not declared`);
  assert.match(src, /^let repo\b/m);
  for (const fn of ["showRepo", "linkRepoFlow", "pickBranch"]) assert.match(src, new RegExp(`(function ${fn}\\b|const ${fn}\\b)`), `${fn} is missing`);
});
