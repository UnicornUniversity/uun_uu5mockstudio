import test from "node:test";
import assert from "node:assert/strict";
import { captureWithFallback } from "../src/main/screenshot.mjs";

const img = (empty = false) => ({ isEmpty: () => empty, tag: "img" });
const nativeImage = { createFromBuffer: (b) => ({ isEmpty: () => b.length === 0, fromBuffer: b.length }) };
const dbg = (data, attached = false) => ({ isAttached: () => attached, attach() { this.attached = true; }, detach() { this.detached = true; }, sendCommand: async () => ({ data }) });

test("capturePage is used when it answers", async () => {
  const wc = { capturePage: async () => img(), debugger: dbg("") };
  assert.equal((await captureWithFallback(wc, { nativeImage, timeout: 50 })).tag, "img");
});

test("a capturePage that never settles falls back to the DevTools screenshot (and detaches again)", async () => {
  const d = dbg(Buffer.from("png-bytes").toString("base64"));
  const wc = { capturePage: () => new Promise(() => {}), debugger: d };
  const got = await captureWithFallback(wc, { nativeImage, timeout: 50 });
  assert.equal(got.fromBuffer, "png-bytes".length); assert.equal(d.detached, true);
});

test("no screenshot at all gives null instead of waiting forever", async () => {
  const wc = { capturePage: () => new Promise(() => {}), debugger: { isAttached: () => true, sendCommand: () => new Promise(() => {}) } };
  const t0 = Date.now();
  assert.equal(await captureWithFallback(wc, { nativeImage, timeout: 40 }), null);
  assert.ok(Date.now() - t0 < 1000);
});

test("an empty capture counts as a failure", async () => {
  const wc = { capturePage: async () => img(true), debugger: dbg("") };
  assert.equal(await captureWithFallback(wc, { nativeImage, timeout: 40 }), null);
});
