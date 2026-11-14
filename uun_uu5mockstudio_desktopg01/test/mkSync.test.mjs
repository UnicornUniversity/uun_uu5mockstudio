import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { makeProject } from "./helpers.mjs";
import { parseArtifactUrl, projectZipKey, screenKey, validSearchKey, linkProject, readLink } from "../src/main/mkArtifact.mjs";
import { isLocalOnly, zipProject, safeRel, upload, download, BACKUP_DIR, uploadedProjects, createFromArtifact, projectNameOfZip } from "../src/main/mkSync.mjs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import { createEbcClient, multipart, uuError } from "../src/main/ebcClient.mjs";

const BASE = "https://uuapp.plus4u.net/uu-managementkit-maing02/38744216cb324edca986789798259ba9";

test("parseArtifactUrl takes the entity right after the base URI", () => {
  const d = parseArtifactUrl(`${BASE}/document?oid=66c81cfafbc8750023876be3`);
  assert.deepEqual(d, { url: `${BASE}/document?oid=66c81cfafbc8750023876be3`, baseUri: BASE, product: "uu-managementkit-maing02", awid: "38744216cb324edca986789798259ba9", entity: "document", oid: "66c81cfafbc8750023876be3" });
  const p = parseArtifactUrl(`${BASE}/document/permissionSettings?oid=66c81cfafbc8750023876be3&pageOid=66c81cfcfbc8750023876bf1`);
  assert.equal(p.entity, "document"); assert.equal(p.pageOid, "66c81cfcfbc8750023876bf1"); assert.equal(p.url, `${BASE}/document?oid=66c81cfafbc8750023876be3`);
  assert.equal(parseArtifactUrl(`${BASE}/keyTask?oid=67fd06ebee40441857666f4e`).entity, "keyTask");
  assert.equal(parseArtifactUrl(`${BASE}/document`), null, "no oid");
  assert.equal(parseArtifactUrl(`${BASE}?oid=67fd06ebee40441857666f4e`), null, "no entity");
  assert.equal(parseArtifactUrl("https://uuapp.plus4u.net/uu-x/notanawid/document?oid=67fd06ebee40441857666f4e"), null);
  assert.equal(parseArtifactUrl("nonsense"), null);
});

test("search keys are valid and stable", () => {
  assert.ok(validSearchKey(projectZipKey("a1b2c3d4e5")));
  const k = screenKey("a1b2c3d4e5", "Přehled žádostí.html");
  assert.ok(validSearchKey(k), k);
  assert.match(k, /^uu5mock-screen-a1b2c3d4e5-Prehled-zadosti-[0-9a-f]{6}$/);
  assert.equal(k, screenKey("a1b2c3d4e5", "Přehled žádostí.html"));
  assert.notEqual(screenKey("p", "a b.html"), screenKey("p", "a-b.html"), "names that slug alike stay apart");
});

test("local-only paths stay out of the zip and safeRel refuses escapes", async () => {
  for (const p of [".studio/plus4u.json", ".claude/settings.local.json", ".studio/thumb.jpg", ".studio/backups/x.zip", ".git/HEAD", "sub/.DS_Store"]) assert.ok(isLocalOnly(p), p);
  for (const p of ["a.html", ".studio/state.json", "BUSINESS_RULES.md", ".studio/sources/x.md"]) assert.ok(!isLocalOnly(p), p);
  for (const p of ["../x", "/etc/passwd", "a/../../b", "C:/x", "dir/"]) assert.equal(safeRel(p), null, p);
  assert.equal(safeRel("a\\b.html"), "a/b.html");
  const dir = await makeProject();
  await mkdir(path.join(dir, ".claude")); await writeFile(path.join(dir, ".claude", "s.json"), "{}");
  await writeFile(path.join(dir, ".studio", "plus4u.json"), "{}");
  const names = Object.keys(unzipSync(new Uint8Array(await zipProject(dir)))).sort();
  assert.deepEqual(names, [".studio/state.json", "a.html", "b.html"]);
  assert.equal(createHash("sha1").update(await zipProject(dir)).digest("hex"), createHash("sha1").update(await zipProject(dir)).digest("hex"), "the same project zips to the same bytes");
});

test("multipart and uuError follow uuApp conventions", async () => {
  const { body, contentType } = multipart({ oid: "o1", uuEbcData: { searchKey: "k-1", name: "a.zip" } }, { data: Buffer.from("zip"), name: "a.zip", type: "application/zip" }, "B");
  assert.equal(contentType, "multipart/form-data; boundary=B");
  assert.equal(body.toString(), [
    "--B", 'Content-Disposition: form-data; name="oid"', "", "o1",
    "--B", 'Content-Disposition: form-data; name="uuEbcData"', "Content-Type: application/json", "", '{"searchKey":"k-1","name":"a.zip"}',
    "--B", 'Content-Disposition: form-data; name="uuEbcData.data"; filename="a.zip"', "Content-Type: application/zip", "", "zip",
    "--B--", "",
  ].join("\r\n"));
  // the real Request parser reads it back as fields and a file
  const form = await new Request("http://x", { method: "POST", body, headers: { "content-type": contentType } }).formData();
  assert.equal(form.get("oid"), "o1");
  assert.deepEqual(JSON.parse(form.get("uuEbcData")), { searchKey: "k-1", name: "a.zip" });
  assert.equal(form.get("uuEbcData.data").name, "a.zip");
  const e = uuError(400, { uuAppErrorMap: { "x/warn": { type: "warning", message: "w" }, "x/invalidDtoIn": { type: "error", message: "DtoIn is not valid.", paramMap: { a: 1 } } } }, "", "file/get");
  assert.equal(e.message, "file/get: DtoIn is not valid."); assert.equal(e.code, "x/invalidDtoIn"); assert.equal(e.status, 400);
});

/** A fake artifact with an attachments collection, served through the real EBC client (requests go to `fetch`). */
function fakeArtifact() {
  const files = new Map(); let n = 0; const calls = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetch = async (url, { method = "GET", body, headers } = {}) => {
    const u = new URL(url); const cmd = u.pathname.split("/document/")[1];
    calls.push(`${method} ${cmd}`);
    assert.match(headers.authorization, /^Bearer tok$/);
    const q = Object.fromEntries([...u.searchParams].map(([k, v]) => [k, v.startsWith("{") ? JSON.parse(v) : v]));
    if (cmd === "load") return json({ data: { name: "Test document", uuEbcData: { uuBbAttachmentsCollectionOid: "c".repeat(24) } } });
    if (cmd === "ebc/collection/listFiles") return json({ itemList: [...files.values()], pageInfo: { pageIndex: 0, pageSize: 1000, total: files.size } });
    if (cmd === "ebc/file/getData") { const f = [...files.values()].find((x) => x.oid === q.uuEbcData.fileOid); return new Response(f.data, { headers: { "content-type": "application/octet-stream" } }); }
    if (cmd === "ebc/collection/createFile" || cmd === "ebc/file/updateData") {
      const form = await new Request("http://x", { method: "POST", body, headers: { "content-type": headers["content-type"] } }).formData();
      const ebc = JSON.parse(form.get("uuEbcData")); const data = Buffer.from(await form.get("uuEbcData.data").arrayBuffer());
      const old = cmd === "ebc/file/updateData" ? [...files.values()].find((x) => x.oid === ebc.fileOid) : null;
      const f = { oid: old?.oid ?? String(++n).padStart(24, "0"), searchKey: old?.searchKey ?? ebc.searchKey, name: ebc.name, data, binaryCode: createHash("sha1").update(data).digest("hex"), sys: { rev: (old?.sys.rev ?? -1) + 1 } };
      files.set(f.searchKey, f);
      const { data: _d, ...meta } = f;
      return json(old ? meta : { createdFile: meta });
    }
    return json({ uuAppErrorMap: { "x/unknown": { type: "error", message: `unknown ${cmd}` } } }, 404);
  };
  const client = createEbcClient({ baseUri: BASE, entity: "document", token: async () => "tok", fetch });
  return { files, calls, client, someoneUploads: (key) => { const f = files.get(key); f.data = Buffer.from("other"); f.binaryCode = "changed"; } };
}

test("upload creates the zip and the screens, then only what changed; a remote change is a conflict", async () => {
  const dir = await makeProject();
  const link = await linkProject(dir, parseArtifactUrl(`${BASE}/document?oid=66c81cfafbc8750023876be3`));
  const fake = fakeArtifact();
  const r1 = await upload(dir, fake.client);
  assert.ok(r1.ok); assert.equal(r1.artifactName, "Test document");
  assert.deepEqual(r1.uploaded.map((u) => [u.name, u.created]), [[`${path.basename(dir)}.uu5mock.zip`, true], ["a.html", true], ["b.html", true]]);
  assert.ok(fake.files.has(projectZipKey(link.projectId)));
  assert.equal((await readLink(dir)).name, "Test document");

  const r2 = await upload(dir, fake.client);
  assert.deepEqual(r2.uploaded, [], "nothing changed: nothing is sent");
  await writeFile(path.join(dir, "a.html"), "<h1>A2</h1>");
  const r3 = await upload(dir, fake.client);
  assert.deepEqual(r3.uploaded.map((u) => [u.name, u.created]), [[`${path.basename(dir)}.uu5mock.zip`, false], ["a.html", false]]);

  fake.someoneUploads(projectZipKey(link.projectId));
  await writeFile(path.join(dir, "b.html"), "<h1>B2</h1>");
  const r4 = await upload(dir, fake.client);
  assert.ok(r4.conflict, "someone else uploaded since the last sync");
  assert.ok((await upload(dir, fake.client, { force: true })).ok);
});

test("download replaces the project after a backup and keeps the link and local-only files", async () => {
  const dir = await makeProject();
  await linkProject(dir, parseArtifactUrl(`${BASE}/document?oid=66c81cfafbc8750023876be3`));
  const fake = fakeArtifact();
  assert.ok((await download(dir, fake.client)).missing);
  await upload(dir, fake.client);
  // the local project moves on: a new screen, an edit, a local-only file
  await writeFile(path.join(dir, "c.html"), "<h1>c</h1>");
  await writeFile(path.join(dir, "a.html"), "<h1>local edit</h1>");
  await mkdir(path.join(dir, ".claude")); await writeFile(path.join(dir, ".claude", "x.json"), "{}");
  const blocked = await download(dir, fake.client);
  assert.ok(blocked.conflict?.localChanged, "the remote zip is the old one: downloading would only lose local work");
  const r = await download(dir, fake.client, { force: true });
  assert.ok(r.ok);
  assert.equal(await readFile(path.join(dir, "a.html"), "utf8"), "<h1>a</h1>");
  assert.ok(!(await readdir(dir)).includes("c.html"), "a file the zip does not have is removed");
  assert.ok((await readdir(path.join(dir, ".claude"))).includes("x.json"), "local-only files stay");
  assert.ok((await readdir(path.join(dir, BACKUP_DIR))).some((f) => f.startsWith("before-download-")), "a backup was made");
  assert.ok(await readLink(dir), "the link survives");
  const backup = unzipSync(new Uint8Array(await readFile(path.join(dir, r.backup))));
  assert.ok(backup["c.html"], "the backup has the local state");
});

test("a new project from a document: the uploaded project is downloaded and stays the same attachment", async () => {
  const art = parseArtifactUrl(`${BASE}/document?oid=66c81cfafbc8750023876be3`);
  const fake = fakeArtifact();
  assert.deepEqual((await uploadedProjects(fake.client, art)).projects, [], "nothing uploaded yet");
  const src = await makeProject();
  const link = await linkProject(src, art);
  await upload(src, fake.client);
  const found = await uploadedProjects(fake.client, art);
  assert.equal(found.name, "Test document"); assert.ok(found.attachments);
  assert.equal(found.projects.length, 1, "the screens are not projects");
  assert.equal(found.projects[0].projectId, link.projectId); assert.equal(found.projects[0].projectName, path.basename(src));

  const dir = await mkdtemp(path.join(os.tmpdir(), "fromdoc-"));
  const r = await createFromArtifact(dir, fake.client, art, { projectId: link.projectId, name: "Test document" });
  assert.ok(r.ok); assert.equal(await readFile(path.join(dir, "a.html"), "utf8"), "<h1>a</h1>");
  assert.ok(!(await readdir(dir)).includes("backups") && !(await readdir(path.join(dir, ".studio"))).includes("backups"), "nothing to back up in a new project");
  const l2 = await readLink(dir);
  assert.equal(l2.projectId, link.projectId); assert.equal(l2.name, "Test document");
  assert.deepEqual((await upload(dir, fake.client)).uploaded, [], "in step with the document: nothing to upload");
  await assert.rejects(createFromArtifact(dir, fake.client, art, { projectId: link.projectId }), /not empty/);

  const empty = await mkdtemp(path.join(os.tmpdir(), "fromdoc-"));
  const e = await createFromArtifact(empty, fake.client, art, { name: "Test document" });
  assert.ok(e.empty); assert.notEqual((await readLink(empty)).projectId, link.projectId, "an empty project is a project of its own");
  assert.equal(projectNameOfZip("My app.uu5mock.zip"), "My app"); assert.equal(projectNameOfZip("x.zip"), null);
});
