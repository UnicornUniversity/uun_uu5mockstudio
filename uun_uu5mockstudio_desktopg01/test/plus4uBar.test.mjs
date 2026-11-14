import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { viewOf } from "../src/renderer/plus4uBar.js";
import { makeProject } from "./helpers.mjs";
import { linkProject, parseArtifactUrl, readLink, writeLink, projectZipKey } from "../src/main/mkArtifact.mjs";
import { syncState, zipProject, hash } from "../src/main/mkSync.mjs";

const info = { name: "Doc", entity: "document", url: "https://x/document?oid=1", syncedAt: null };

test("viewOf: nothing, not linked, linked with dots, lock and busy", () => {
  assert.equal(viewOf(null).mode, "none");
  assert.equal(viewOf({ error: "No project is open." }).mode, "none");
  assert.equal(viewOf({ linked: false }).mode, "unlinked");
  const fresh = viewOf({ linked: true, info, localChanged: true, uploaded: false, remoteChanged: null });
  assert.equal(fresh.name, "Doc"); assert.match(fresh.sub, /not uploaded yet/);
  assert.ok(fresh.upload.dot); assert.match(fresh.upload.title, /not uploaded yet/);
  assert.ok(!fresh.download.dot); assert.ok(!fresh.download.lock);
  const newer = viewOf({ linked: true, info: { ...info, syncedAt: "2026-11-14T09:00:00Z" }, localChanged: false, uploaded: true, remoteChanged: true });
  assert.ok(!newer.upload.dot); assert.ok(newer.download.dot); assert.match(newer.sub, /synced/);
  const locked = viewOf({ linked: true, info, localChanged: false, remoteChanged: null, needsLogin: true });
  assert.ok(locked.download.lock); assert.match(locked.download.title, /Sign in/);
  assert.equal(fresh.chip.dot, "local"); assert.equal(newer.chip.dot, "remote", "a newer version wins over local changes");
  assert.equal(viewOf({ linked: true, info, localChanged: true, remoteChanged: true }).chip.dot, "remote");
  assert.equal(viewOf({ linked: true, info, localChanged: false, remoteChanged: false }).chip.dot, null);
  assert.equal(locked.download.label, "Sign in to check for a newer version");
  const busy = viewOf({ linked: true, info, localChanged: true }, "upload");
  assert.ok(busy.chip.busy); assert.equal(busy.upload.label, "Uploading…");
  assert.ok(busy.upload.busy); assert.equal(busy.upload.title, "Uploading…");
});

test("syncState: local changes against the last sync; the remote check compares binary codes", async () => {
  const dir = await makeProject();
  assert.deepEqual(await syncState(dir), { linked: false });
  await linkProject(dir, parseArtifactUrl("https://uuapp.plus4u.net/uu-managementkit-maing02/38744216cb324edca986789798259ba9/document?oid=66c81cfafbc8750023876be3"));
  assert.deepEqual(await syncState(dir), { linked: true, localChanged: true, remoteChanged: null, uploaded: false });
  const link = await readLink(dir), key = projectZipKey(link.projectId);
  await writeLink(dir, { ...link, attachments: { [key]: { binaryCode: "b1", local: hash(await zipProject(dir)) } } });
  assert.equal((await syncState(dir)).localChanged, false, "the same project as uploaded");
  await writeFile(path.join(dir, "a.html"), "<h1>changed</h1>");
  assert.equal((await syncState(dir)).localChanged, true);
  const client = (code) => ({ loadArtifact: async () => ({ uuEbcData: { uuBbAttachmentsCollectionOid: "c" } }), listAllFiles: async () => [{ searchKey: key, binaryCode: code, sys: {} }] });
  assert.equal((await syncState(dir, client("b1"))).remoteChanged, false);
  assert.equal((await syncState(dir, client("b2"))).remoteChanged, true);
});
