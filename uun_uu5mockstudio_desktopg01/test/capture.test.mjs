import test from "node:test";
import assert from "node:assert/strict";
import { slices } from "../src/main/capture.mjs";

test("a tall page is taken in strips of one frame: they cover the page exactly, the last one is shorter", () => {
  assert.deepEqual(slices(2000, 900), [{ y: 0, height: 900 }, { y: 900, height: 900 }, { y: 1800, height: 200 }]);
  assert.deepEqual(slices(900, 900), [{ y: 0, height: 900 }]);
  assert.deepEqual(slices(500, 900), [{ y: 0, height: 500 }]);
  const s = slices(6348, 873);
  assert.equal(s.reduce((n, x) => n + x.height, 0), 6348);
  assert.ok(s.every((x, i) => i === 0 || x.y === s[i - 1].y + s[i - 1].height));
});
