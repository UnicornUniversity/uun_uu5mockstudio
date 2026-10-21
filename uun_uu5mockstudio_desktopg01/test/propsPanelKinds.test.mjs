import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf } from "../src/renderer/propsPanel.js";

test("a list of plain strings with known items is a multi choice, anything else stays code", () => {
  const prop = { type: "array", listEnum: ["area", "box", "spot"] };
  const attr = (json) => ({ type: "code", code: json, json });
  assert.deepEqual(kindOf(prop, attr('["area"]'), {}, "nestingLevelList"), { kind: "multi", options: ["area", "box", "spot"], value: ["area"] });
  assert.equal(kindOf(prop, attr('[{ "a": 1 }]'), {}, "x").kind, "code", "objects are not a choice");
  assert.equal(kindOf(prop, attr("[1, 2]"), {}, "x").kind, "code");
  assert.equal(kindOf({ type: "array" }, attr('["a"]'), {}, "someList").kind, "code", "no known items");
  assert.equal(kindOf(null, { type: "code", code: '["area"]' }, {}, "nestingLevelList").kind, "code", "not plain data (no json)");
  // the nesting levels are known without a reference page
  const k = kindOf(null, attr('["area", "box"]'), {}, "nestingLevelList");
  assert.equal(k.kind, "multi"); assert.ok(k.options.includes("areaCollection") && k.options.includes("modal"));
});

test("colorScheme and significance are choices even when the component documents them as oneOf without values", async () => {
  const { kindOf } = await import("../src/renderer/propsPanel.js");
  const palettes = { colorScheme: ["primary", "neutral"] };
  assert.deepEqual(kindOf({ type: "oneOf", name: "colorScheme" }, { type: "string", value: "primary" }, palettes, "colorScheme"), { kind: "select", options: ["primary", "neutral"] });
  assert.equal(kindOf({ type: "oneOf" }, { type: "string", value: "common" }, palettes, "significance").kind, "select");
  assert.equal(kindOf({ type: "bool" }, { type: "boolean", value: true }, palettes, "colorScheme").kind, "bool", "a documented type of another kind wins");
});
