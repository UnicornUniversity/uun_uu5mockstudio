import test from "node:test";
import assert from "node:assert/strict";
import { flashCode } from "../src/renderer/flashComponent.js";

test("flashCode is a valid page expression for the given ordinal", () => {
  const code = flashCode(7);
  assert.doesNotThrow(() => new Function(`return ${code}`));
  assert.match(code, /\)\(7, null\)$/);
  assert.match(code, /scrollIntoView/);
});

test("flashCode can frame one copy of an element rendered by .map", () => {
  const code = flashCode(7, 2);
  assert.doesNotThrow(() => new Function(`return ${code}`));
  assert.match(code, /\)\(7, 2\)$/);
  assert.match(flashCode(7, "x"), /\)\(7, null\)$/, "only an integer picks a copy");
});
