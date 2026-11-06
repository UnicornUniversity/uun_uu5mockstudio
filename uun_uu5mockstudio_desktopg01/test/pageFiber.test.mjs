import test from "node:test";
import assert from "node:assert/strict";
import { FIBER } from "../src/renderer/pageFiber.js";

class Element { constructor(r) { this.r = r; } getBoundingClientRect() { const { left, top, width, height } = this.r; return { left, top, width, height, right: left + width, bottom: top + height }; } }
const { rectOf } = new Function("Element", `${FIBER}; return { rectOf };`)(Element);
const host = (r, child = null, sibling = null) => ({ tag: 5, stateNode: new Element(r), child, sibling });

test("the box of a plain element is the element itself, not the union of its children that stick out of it", () => {
  const orb = host({ left: -80, top: 600, width: 300, height: 300 });
  const inner = host({ left: 100, top: 200, width: 800, height: 300 }, null, orb);
  const hero = host({ left: 0, top: 100, width: 1000, height: 600 }, inner);
  assert.deepEqual(rectOf(hero), { left: 0, top: 100, width: 1000, height: 600 });
});

test("the box of a component without a DOM node of its own is the union of its host nodes", () => {
  const b = host({ left: 50, top: 10, width: 100, height: 40 });
  const a = host({ left: 0, top: 0, width: 60, height: 20 }, null, b);
  assert.deepEqual(rectOf({ tag: 0, child: a }), { left: 0, top: 0, width: 150, height: 50 });
});
