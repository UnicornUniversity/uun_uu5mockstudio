import test from "node:test";
import assert from "node:assert/strict";
import { TOUR_VERSION, tourSeenNow } from "../src/main/tourVersion.mjs";

test("the tour opens until its current version was seen; an old `true` counts as version 1", () => {
  assert.equal(tourSeenNow(undefined), false); // a new user
  assert.equal(tourSeenNow(true, 2), false); // closed the tour of an older app: sees the new one once
  assert.equal(tourSeenNow(true, 1), true);
  assert.equal(tourSeenNow(2, 2), true);
  assert.equal(tourSeenNow(TOUR_VERSION), true);
  assert.equal(tourSeenNow(TOUR_VERSION - 1), false);
  assert.equal(tourSeenNow("x"), false);
});
