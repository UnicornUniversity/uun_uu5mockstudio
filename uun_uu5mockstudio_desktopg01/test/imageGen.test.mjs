import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createKeyStore, generateImage, createImageGenerator, DEFAULT_MODEL, MODEL_RE } from "../src/main/imageGen.mjs";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("0000000000000000", "utf8")]);
const KEY = "sk-test-0123456789abcdefghij";
// a "safeStorage" that only reverses the bytes: enough to prove the key is not stored as it is
const fakeSafe = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(s, "utf8").reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString("utf8"),
});
const okFetch = (calls = []) => async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
  return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG.toString("base64") }] }) };
};
const tmp = () => mkdtemp(path.join(tmpdir(), "imagegen-"));

test("key store: the stored key wins over the environment and is not written in plain text", async () => {
  const dir = await tmp();
  try {
    const file = path.join(dir, "key.bin");
    const ks = createKeyStore({ file, safeStorage: fakeSafe(), env: { OPENAI_API_KEY: "sk-from-env-0123456789abcdef" } });
    assert.deepEqual(await ks.get(), { key: "sk-from-env-0123456789abcdef", source: "env" });
    await ks.set(KEY);
    assert.deepEqual(await ks.get(), { key: KEY, source: "app" });
    assert.ok(!(await readFile(file, "utf8")).includes(KEY));
    await ks.clear();
    assert.equal((await ks.get()).source, "env");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("key store: refuses a junk key and refuses to store without OS encryption", async () => {
  const dir = await tmp();
  try {
    const file = path.join(dir, "key.bin");
    await assert.rejects(createKeyStore({ file, safeStorage: fakeSafe(), env: {} }).set("short"), /does not look like/);
    const ks = createKeyStore({ file, safeStorage: fakeSafe(false), env: {} });
    await assert.rejects(ks.set(KEY), /cannot encrypt/);
    assert.deepEqual(await ks.status(), { hasKey: false, source: null, canStore: false });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("generateImage: sends the request, decodes the picture, asks for transparency only when wanted", async () => {
  const calls = [];
  const r = await generateImage({ prompt: " a red fox ", size: "1536x1024", quality: "low", transparent: true }, { key: KEY, model: "m1", fetchImpl: okFetch(calls) });
  assert.equal(r.mime, "image/png");
  assert.ok(r.buf.equals(PNG));
  assert.equal(calls[0].url, "https://api.openai.com/v1/images/generations");
  assert.equal(calls[0].headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(calls[0].body, { model: "m1", prompt: "a red fox", n: 1, size: "1536x1024", quality: "low", background: "transparent", output_format: "png" });
  const plain = [];
  await generateImage({ prompt: "x" }, { key: KEY, fetchImpl: okFetch(plain) });
  assert.equal(plain[0].body.background, undefined);
  assert.equal(plain[0].body.size, "1024x1024");
});

test("generateImage: API errors become readable messages", async () => {
  const bad = (status, error) => async () => ({ ok: false, status, json: async () => ({ error }) });
  await assert.rejects(generateImage({ prompt: "x" }, { key: KEY, fetchImpl: bad(401, { message: "no" }) }), /rejected the API key/);
  await assert.rejects(generateImage({ prompt: "x" }, { key: KEY, fetchImpl: bad(429, { message: "quota" }) }), /limit or credit/);
  await assert.rejects(generateImage({ prompt: "x" }, { key: KEY, fetchImpl: bad(400, { code: "moderation_blocked", message: "m" }) }), /content policy/);
  await assert.rejects(generateImage({ prompt: "x" }, { key: KEY, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [{ b64_json: Buffer.from("not an image at all").toString("base64") }] }) }) }), /not a picture/);
  await assert.rejects(generateImage({ prompt: "  " }, { key: KEY, fetchImpl: okFetch() }), /empty/);
  await assert.rejects(generateImage({ prompt: "x" }, { fetchImpl: okFetch() }), /no OpenAI API key/);
});

test("generator: off or without key it explains instead of calling the API", async () => {
  const dir = await tmp();
  try {
    const calls = [];
    const off = createImageGenerator({ keyStore: { get: async () => ({ key: KEY }) }, isEnabled: async () => false, fetchImpl: okFetch(calls) });
    assert.match(await off.generate(dir, { prompt: "x" }), /switched off/);
    const nokey = createImageGenerator({ keyStore: { get: async () => null }, isEnabled: async () => true, fetchImpl: okFetch(calls) });
    assert.match(await nokey.generate(dir, { prompt: "x" }), /no OpenAI API key/);
    assert.equal(calls.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("generator: saves into assets, reuses the same description, limits one run, reset starts a new run", async () => {
  const dir = await tmp();
  try {
    const calls = [];
    const g = createImageGenerator({ keyStore: { get: async () => ({ key: KEY }) }, isEnabled: async () => true, fetchImpl: okFetch(calls), maxPerRun: 2 });
    assert.equal(await g.generate(dir, { prompt: "a fox", name: "Fox Hero" }), "Saved: assets/fox-hero.png");
    assert.ok((await readFile(path.join(dir, "assets", "fox-hero.png"))).equals(PNG));
    assert.match(await g.generate(dir, { prompt: "a fox", name: "other" }), /reused: assets\/fox-hero\.png/);
    assert.equal(calls.length, 1, "the same description is not paid twice");
    assert.equal(await g.generate(dir, { prompt: "a cat", name: "cat" }), "Saved: assets/cat.png");
    assert.match(await g.generate(dir, { prompt: "a dog", name: "dog" }), /At most 2 pictures/);
    assert.equal(calls.length, 2);
    g.reset();
    assert.equal(await g.generate(dir, { prompt: "a dog", name: "dog" }), "Saved: assets/dog.png");
    // a deleted asset is generated again instead of pointing to a missing file
    await rm(path.join(dir, "assets", "fox-hero.png"));
    g.reset();
    assert.equal(await g.generate(dir, { prompt: "a fox", name: "Fox Hero" }), "Saved: assets/fox-hero.png");
    assert.deepEqual((await readdir(path.join(dir, "assets"))).sort(), ["cat.png", "dog.png", "fox-hero.png"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the model: gpt-image-2 by default, the one from Settings when set, and only sane names are accepted", async () => {
  assert.equal(DEFAULT_MODEL, "gpt-image-2");
  for (const ok of ["gpt-image-2", "gpt-image-1.5", "gpt-image-1-mini", "gpt-image-2-2026-04-21"]) assert.match(ok, MODEL_RE);
  for (const bad of ["", " gpt", "a b", "x/y", "../x", "a".repeat(90)]) assert.doesNotMatch(bad, MODEL_RE);
  const dir = await tmp();
  try {
    const calls = [];
    let model = null;
    const g = createImageGenerator({ keyStore: { get: async () => ({ key: KEY }) }, isEnabled: async () => true, fetchImpl: okFetch(calls), getModel: async () => model });
    await g.generate(dir, { prompt: "a fox", name: "a" });
    assert.equal(calls[0].body.model, "gpt-image-2", "an empty setting falls back to the default");
    model = "gpt-image-1.5";
    await g.generate(dir, { prompt: "a fox", name: "b" });
    assert.equal(calls[1].body.model, "gpt-image-1.5");
    assert.equal(calls.length, 2, "another model is another picture, not the cached one");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
