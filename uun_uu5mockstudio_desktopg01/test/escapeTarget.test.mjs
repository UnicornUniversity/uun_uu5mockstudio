import test from "node:test";
import assert from "node:assert/strict";
import { escapeTarget } from "../src/renderer/dialogChrome.js";

const box = (...inside) => ({ contains: (t) => inside.includes(t) });

test("Escape goes to the topmost dialog when the focus is outside it", () => {
  const top = box("a"), below = box("b");
  assert.equal(escapeTarget([top, below], "body"), top);
  assert.equal(escapeTarget([top, below], "b"), top); // the focus stayed in the dialog below the question
});

test("no redirect when the topmost dialog has the focus or nothing is open", () => {
  const top = box("a");
  assert.equal(escapeTarget([top], "a"), null);
  assert.equal(escapeTarget([], "body"), null);
});
