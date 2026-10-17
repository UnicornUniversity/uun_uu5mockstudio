import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseBml, parseIcons, loadBml, BML_BASE, BML_CSS } from "../src/main/uuBml.mjs";
import { isIconProp, isStateIconProp } from "../src/renderer/propsPanel.js";
import { parseStateCode, stateCode, isStateCode, isBmlCode } from "../src/renderer/iconPicker.js";

// the shape of the real uuBml stylesheet (numbers via [class*=uubml-state-sNN], kinds via colour rules)
const CSS = `.uubml[class*=uubml-state-s00]:after{content:"\\f4c0"}.uubml[class*=uubml-state-s02]:after{content:"\\f4c0"}.uubml[class*=uubml-state-s27]:after{content:"x"}
[class*=uubml-state-][class*=-initial]:before{color:#5ae8f3}[class*=uubml-state-][class*=-active]:before{color:#61ee4d}[class*=uubml-state-][class*=-alternative-active]:before{color:#fdbe00}
[class*=uubml-state-][class*=-cancelled]:before{color:#fff}.uubml-yen{}`;

test("parseBml reads the state numbers, the kinds and the icons from the stylesheet", () => {
  const s = parseBml(CSS);
  assert.deepEqual(s.numbers, ["00", "02", "27"]);
  assert.deepEqual(s.variants, ["", "default", "initial", "active", "alternative-active", "cancelled"]);
  assert.equal(parseBml("body{}"), null);
});

test("loadStates: the CDN first, then the cache, then the built-in list", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uubml-")), cacheFile = path.join(dir, "states.json");
  const ok = await loadBml({ fetchText: async (url) => { assert.equal(url, BML_BASE + BML_CSS); return CSS; }, cacheFile });
  assert.equal(ok.source, "cdn"); assert.deepEqual(ok.numbers, ["00", "02", "27"]); assert.equal(ok.cssUrl, BML_BASE + BML_CSS);
  const cached = await loadBml({ fetchText: async () => { throw new Error("offline"); }, cacheFile });
  assert.equal(cached.source, "cache"); assert.deepEqual(cached.numbers, ["00", "02", "27"]);
  const builtin = await loadBml({ fetchText: async () => { throw new Error("offline"); }, cacheFile: path.join(dir, "none.json") });
  assert.equal(builtin.source, "builtin"); assert.equal(builtin.numbers.length, 99); assert.equal(builtin.numbers[98], "98"); assert.ok(builtin.variants.includes("alternative-final"));
  const junk = await loadBml({ fetchText: async () => "<html>blocked</html>", cacheFile: path.join(dir, "none.json") });
  assert.equal(junk.source, "builtin", "a page that is not the stylesheet is ignored");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("state codes: parse, build and recognise", () => {
  assert.deepEqual(parseStateCode("uubml-state-s02-active"), { number: "02", variant: "active" });
  assert.deepEqual(parseStateCode("uubml-state-s27"), { number: "27", variant: "" });
  assert.deepEqual(parseStateCode("uubml-state-s00-alternative-final"), { number: "00", variant: "alternative-final" });
  assert.equal(parseStateCode("uugds-plus"), null);
  assert.equal(stateCode("02", "active"), "uubml-state-s02-active"); assert.equal(stateCode("27"), "uubml-state-s27");
  assert.ok(isStateCode("uubml-state-s00-final")); assert.ok(!isStateCode("uubml-artifact")); assert.ok(!isStateCode(null));
});

test("props with icon in the name get the icon palette, stateIcon the state palette, look-alikes get neither", () => {
  for (const n of ["icon", "iconRight", "iconLeft", "typeIcon", "rightIcon", "leftIcon", "stateIcon", "Icon", "badgeIcon", "actionIcon"]) assert.ok(isIconProp(n), n);
  for (const n of ["iconSize", "iconColorScheme", "iconProps", "iconStyle", "hideIcon", "showIcon", "noIcon", "withIcon", "isIcon", "title", "size", "colorScheme", "onClick"]) assert.ok(!isIconProp(n), n);
  assert.ok(!isIconProp("leftIcon", { type: "bool" }), "a prop documented as another type is not an icon");
  assert.ok(!isIconProp("rightIcon", { type: "func" }));
  assert.ok(isIconProp("anything", { type: "icon" }), "documented as an icon");
  assert.ok(isStateIconProp("stateIcon") && isStateIconProp("leftStateIcon") && !isStateIconProp("icon") && !isStateIconProp("typeIcon"));
});

test("parseIcons lists the uuBml icons by group and leaves the states out", () => {
  const css = `.uubml[class*=uubml-wrench]:before{content:"a"}.uubml[class*=uubml-artifact]:before{}.uubml[class*=uubml-woman]:before{}.uubml[class*=uubml-woman-2]:before{}
    .uubml[class*=uubml-label-]:before{}.uubml[class*=uubml-label-a]:before{}.uubml[class*=uubml-state-s00]:after{}.uubml[class*=uubml-state-]:before{}
    .uubml[class*=uubmlicon-uubem-person]:before{}.uubml[class*=uubml-wrench]:after{content:"b"}`;
  const icons = parseIcons(css);
  assert.deepEqual(icons.map((i) => i.code), ["uubml-artifact", "uubml-woman", "uubml-woman-2", "uubml-wrench", "uubmlicon-uubem-person", "uubml-label-a"]);
  assert.deepEqual(icons.map((i) => i.group), ["uuBml", "uuBml", "uuBml", "uuBml", "App icons", "Labels"]);
  assert.equal(icons[0].name, "artifact"); assert.equal(icons[4].name, "uubem-person");
  assert.deepEqual(parseBml(css).icons, icons, "the icons come with the states");
  assert.ok(isBmlCode("uubml-wrench") && isBmlCode("uubmlicon-x") && isBmlCode("uubml-state-s00-active") && !isBmlCode("uugds-plus") && !isBmlCode(undefined));
});
