import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { namesFromCss, catalogFrom, loadMdi, MDI_CSS, MDI_META, MDI_VERSION } from "../src/main/mdiIcons.mjs";

const CSS = `.mdi:before{font-family:"Material Design Icons"}.mdi-strategy::before{content:"\\F11D6"}.mdi-rocket-launch-outline::before{content:"\\F14DF"}.mdi-strategy:before{content:"x"}.mdi-spin:before{animation:x}`;
const META = [{ name: "strategy", aliases: ["football-play"], tags: ["Sport"], version: "4.5.95" }];

test("names come from the stylesheet once, in its order", () => {
  assert.deepEqual(namesFromCss(CSS), ["strategy", "rocket-launch-outline", "spin"]);
});

test("the catalog takes aliases and the first tag from the metadata, and works without it", () => {
  const c = catalogFrom(CSS, META);
  assert.deepEqual(c.icons[0], { code: "mdi-strategy", name: "strategy", keywords: ["football-play", "Sport"], category: "Sport", since: "4.5.95" });
  assert.deepEqual(c.icons[1], { code: "mdi-rocket-launch-outline", name: "rocket-launch-outline", keywords: [], category: "Other", since: null });
  assert.equal(catalogFrom(CSS).icons.length, 3);
});

test("loadMdi fetches once, caches, and gives null when the stylesheet cannot be fetched", async () => {
  const cacheFile = path.join(await mkdtemp(path.join(tmpdir(), "mdi-")), "mdi.json");
  const seen = [];
  const fetchText = async (url) => { seen.push(url); if (url === MDI_CSS) return CSS; if (url === MDI_META) return JSON.stringify(META); throw new Error("404"); };
  const a = await loadMdi({ fetchText, cacheFile });
  assert.equal(a.version, MDI_VERSION); assert.equal(a.icons.length, 3);
  const b = await loadMdi({ fetchText: async () => { throw new Error("offline"); }, cacheFile });
  assert.deepEqual(b.icons, a.icons);
  assert.deepEqual(seen, [MDI_CSS, MDI_META]);
  assert.equal(await loadMdi({ fetchText: async () => { throw new Error("offline"); }, cacheFile: cacheFile + ".none" }), null);
});

test("the renderer draws mdi icons with the same stylesheet", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/renderer/iconPicker.js", import.meta.url), "utf8"));
  assert.match(src, new RegExp(`MDI_CSS = "${MDI_CSS.replace(/[.]/g, "\\.")}"`));
});
