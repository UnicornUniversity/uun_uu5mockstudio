import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findIconsDir, loadIcons } from "../src/main/uuGdsIcons.mjs";

test("the icon catalog is read from the uugds plugin's skill data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gds-"));
  const dir = path.join(root, "skills", "uugds-icons", "data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "icons.json"), JSON.stringify({ icons: [
    { code: "plus-circle", fullCode: "uugds-plus-circle", prefix: "uugds", name: "Plus circle", keywords: ["add"], category: "uiaction", isCommon: true },
    { code: "x", fullCode: "uugdsstencil-edit-x", prefix: "uugdsstencil", name: "X", category: "edit", deprecated: true },
  ] }));
  await writeFile(path.join(dir, "conventions.json"), JSON.stringify({ actions: { create: { icon: "uugds-plus-circle" }, save: { icon: null } } }));
  const plugins = path.join(root, "installed.json");
  await writeFile(plugins, JSON.stringify({ plugins: { "uugds@market": [{ installPath: root }] } }));
  assert.equal(findIconsDir({ pluginsFile: plugins }), dir);
  const cat = loadIcons(dir);
  assert.deepEqual(cat.icons[0], { code: "uugds-plus-circle", name: "Plus circle", keywords: ["add"], category: "uiaction", common: true, deprecated: false });
  assert.equal(cat.icons[1].deprecated, true); assert.deepEqual(cat.icons[1].keywords, []);
  assert.deepEqual(cat.actions, { create: "uugds-plus-circle" }); // actions without an icon (Save) are left out
});

test("without the plugin there is no catalog", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gds-"));
  assert.equal(findIconsDir({ pluginsFile: path.join(dir, "none.json") }), null);
  assert.equal(loadIcons(null), null);
});
