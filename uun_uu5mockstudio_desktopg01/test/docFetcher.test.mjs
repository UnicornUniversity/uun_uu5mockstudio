import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDocFetcher, hasSources, serverSpec } from "../src/main/docFetcher.mjs";
import { makeProject } from "./helpers.mjs";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fakeDocMcp.mjs");
const BOOK = "https://uuapp.plus4u.net/uu-bookkit-maing01/0238a88bac124b3ca828835b57144ffa/book/page?code=rooms";
const spec = (signedIn) => async () => ({ command: process.execPath, args: [FAKE], env: { SERVER_URL: "https://fake.test/mcp", FAKE_SIGNED_IN: signedIn ? "1" : "0" }, source: "preset:USO Terri" });

test("fetchDoc loads a page through the proxy and saves its snapshot", async (t) => {
  const f = createDocFetcher({ spec: spec(true) });
  t.after(() => f.close());
  const dir = await makeProject({});
  assert.equal(await hasSources(dir), false);
  const r = await f.fetchDoc(dir, BOOK);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.title, "Správa místností");
  assert.deepEqual(r.sections.map((s) => s.title), ["Úvod", "Role"]);
  assert.equal(r.file, path.join(dir, ".studio", "sources", "bookkit-0238a88b-rooms.md"));
  const md = await readFile(r.file, "utf8");
  assert.match(md, /Seznam místností & kapacit\./);
  assert.match(md, /\(USO Terri\)/);
  const meta = JSON.parse(await readFile(r.file.replace(/\.md$/, ".json"), "utf8"));
  assert.equal(meta.url, BOOK);
  assert.equal(await hasSources(dir), true);
});

test("without a token the fetch reports login, and login then lets it through", async (t) => {
  const f = createDocFetcher({ spec: spec(false) });
  t.after(() => f.close());
  const dir = await makeProject({});
  assert.deepEqual(await f.fetchDoc(dir, BOOK), { error: "login", kind: "bookkit" });
  assert.deepEqual(await f.login("bookkit"), { ok: true });
  assert.equal((await f.fetchDoc(dir, BOOK)).ok, true);
});

test("a missing territory and a foreign link are reported", async () => {
  const f = createDocFetcher({ spec: async () => ({ error: "territory" }) });
  assert.deepEqual(await f.fetchDoc("/nowhere", BOOK), { error: "territory", kind: "bookkit" });
  assert.match((await f.fetchDoc("/nowhere", "https://example.com/x")).error, /not a link/);
});

test("serverSpec builds the npx command with SERVER_URL from the preset", async () => {
  const s = await serverSpec("mkEcc", { store: { preset: "SWF Terri", values: {} }, npx: "/opt/x/bin/npx" });
  assert.equal(s.command, "/opt/x/bin/npx");
  assert.deepEqual(s.args, ["-y", "uu_aichat_mcputilityg01"]);
  assert.match(s.env.SERVER_URL, /a19555770e087ec88d38cdb8682d9726/);
  assert.ok(s.env.PATH.startsWith("/opt/x/bin"));
  assert.deepEqual(await serverSpec("bookkit", { store: null, npx: "/x/npx" }), { error: "territory" });
});

import { listSources, docAgentSetup } from "../src/main/docFetcher.mjs";

test("docAgentSetup: nothing without snapshots; with one, the server of its kind and the prompt", async (t) => {
  const dir = await makeProject({});
  assert.deepEqual(await docAgentSetup(dir), { prompt: "", servers: {}, readTools: {} });
  const f = createDocFetcher({ spec: spec(true) });
  t.after(() => f.close());
  await f.fetchDoc(dir, BOOK);
  const list = await listSources(dir);
  assert.deepEqual(list.map((s) => [s.kind, s.title]), [["bookkit", "Správa místností"]]);
  const setup = await docAgentSetup(dir, { spec: async () => ({ command: "/x/npx", args: ["-y", "p"], env: { SERVER_URL: "u" } }) });
  assert.deepEqual(Object.keys(setup.servers), ["uuBookKitMain"]);
  assert.ok(setup.readTools.uuBookKitMain.includes("toolUuBookKitLoadPage"));
  assert.match(setup.prompt, /Správa místností/);
});

import { explain } from "../src/main/docFetcher.mjs";

test("explain turns a closed connection into the reason the proxy gave", () => {
  const e = explain(new Error("MCP error -32000: Connection closed"), { stderr: "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/uu_aichat_mcputilityg01\nnpm notice x" });
  assert.match(e.message, /npm could not find uu_aichat_mcputilityg01/);
  const other = new Error("boom");
  assert.equal(explain(other, {}), other);
});

test("fetchDoc renders the document in .studio/sources (not a screen), pictures it and keeps an old screen of it away", async (t) => {
  const f = createDocFetcher({ spec: spec(true) });
  t.after(() => f.close());
  const dir = await makeProject({ "source-old.html": "<h1>made by an older version</h1>", "a.html": "<h1>a</h1>" });
  const base = path.join(dir, ".studio", "sources");
  await (await import("node:fs/promises")).mkdir(base, { recursive: true });
  await (await import("node:fs/promises")).writeFile(path.join(base, "bookkit-0238a88b-rooms.json"), JSON.stringify({ screen: "source-old" }));
  const captured = [];
  const capture = async (rel) => { captured.push(rel); return { full: Buffer.from("jpg"), thumb: "data:image/jpeg;base64,AA" }; };
  const r = await f.fetchDoc(dir, BOOK, { capture });
  assert.deepEqual(captured, [path.join(".studio", "sources", "bookkit-0238a88b-rooms.html")]);
  assert.equal(r.page, path.join(base, "bookkit-0238a88b-rooms.html"));
  assert.equal(r.shot, path.join(base, "bookkit-0238a88b-rooms.jpg"));
  assert.equal(r.thumb, "data:image/jpeg;base64,AA");
  const html = await readFile(r.page, "utf8");
  assert.match(html, /<title>Správa místností \(uuBookKit, original\)<\/title>/);
  assert.match(html, /Utils\.Uu5String\.toChildren/);
  assert.match(html, /\\u003cuu5string\/>\\u003cUu5Bricks\.Section/);
  const files = await (await import("node:fs/promises")).readdir(dir);
  assert.deepEqual(files.filter((x) => x.endsWith(".html")), ["a.html"], "no screen on the canvas, the old one is gone");
  assert.equal((await listSources(dir))[0].shot, r.shot);
  assert.equal((await f.fetchDoc(dir, BOOK)).shot, null, "without a capture there is no picture");
});

const ECC = "https://uuapp.plus4u.net/uu-managementkit-maing02/38744216cb324edca986789798259ba9/document?oid=660d8eb6e75ca600355fe18d&pageOid=660d8eb8e75ca600355fe19d";

test("fetchDoc downloads the pictures of an ECC document and shows them in the rendered screen", async (t) => {
  const f = createDocFetcher({ spec: spec(true) });
  t.after(() => f.close());
  const dir = await makeProject({});
  const asked = [];
  const download = async (url) => { asked.push(url); return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])); };
  const r = await f.fetchDoc(dir, ECC, { download });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.images, 1);
  assert.deepEqual(asked, ["https://uuapp.plus4u.net/uu-appbinarystore-maing02/x/binary/getData?code=66cdbdfefbc8750023912811"]);
  assert.equal((await readFile(path.join(dir, ".studio", "sources", "assets", "66cdbdfefbc8750023912811.jpg"))).length, 7);
  const html = await readFile(r.page, "utf8");
  assert.ok(html.includes(`\\u003cimg src=\\"/${encodeURIComponent(path.basename(dir))}/.studio/sources/assets/66cdbdfefbc8750023912811.jpg\\" alt=\\"corp2.jpg\\"`), "absolute path on the preview server");
  assert.ok(!html.includes("UuContentKit.Images.Image"));
  assert.match(await readFile(r.file, "utf8"), /## Pictures[\s\S]*assets\/66cdbdfefbc8750023912811\.jpg \(corp2\.jpg\)/);
});

test("fetchDoc loads the whole content of a section the load tool cut short", async (t) => {
  const f = createDocFetcher({ spec: spec(true) });
  t.after(() => f.close());
  const dir = await makeProject({});
  const r = await f.fetchDoc(dir, ECC, { download: async () => new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) });
  assert.equal(r.ok, true, JSON.stringify(r));
  const md = await readFile(r.file, "utf8");
  assert.match(md, /Hardwario<\/Uu5Bricks\.Link><\/Uu5Bricks\.Section>/);
  assert.ok(!md.includes("getDa..."), "the cut content is replaced");
  assert.ok(!md.includes("(truncated by the server)"));
  assert.ok((await readFile(r.page, "utf8")).includes("Hardwario"));
});

test("loginFor signs in for the kind of the link", async (t) => {
  const f = createDocFetcher({ spec: spec(false) });
  t.after(() => f.close());
  assert.deepEqual(await f.loginFor(ECC), { ok: true });
  assert.match((await f.loginFor("https://example.com/x")).error, /not a link/);
});
