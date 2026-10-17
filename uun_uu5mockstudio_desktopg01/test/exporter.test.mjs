import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { exportHtml, exportZip, listMockups, SERVE } from "../src/main/exporter.mjs";
import { makeProject, tmp } from "./helpers.mjs";

test("exportHtml copies the file byte for byte", async () => {
  const root = await makeProject({ "a.html": "<h1>ä</h1>" });
  const dest = path.join(await tmp("out"), "copy.html");
  await exportHtml(root, "a.html", dest);
  assert.equal(await readFile(dest, "utf8"), "<h1>ä</h1>");
});

test("exportHtml rejects non-html names and path tricks", async () => {
  const root = await makeProject();
  const out = await tmp("out");
  await assert.rejects(exportHtml(root, "a.txt", path.join(out, "x")), /Only \.html/);
  await assert.rejects(exportHtml(root, "../.studio/state.json", path.join(out, "x")), /Only \.html/);
  await assert.rejects(exportHtml(root, "../../x.html", path.join(out, "x.html")), /ENOENT/); // basename only, never leaves mockups/
});

test("exportZip contains mockups, README, index and server, but not studio state", async () => {
  const root = await makeProject({ "one.html": "<p>1</p>", "two.html": "<p>2</p>" });
  const dest = path.join(await tmp("out"), "p.zip");
  const r = await exportZip(root, dest);
  assert.equal(r.files, 2);
  const z = unzipSync(new Uint8Array(await readFile(dest)));
  assert.deepEqual(Object.keys(z).sort(), ["README.md", "index.html", "mockups/one.html", "mockups/two.html", "serve.mjs"]);
  assert.equal(strFromU8(z["mockups/two.html"]), "<p>2</p>");
  assert.match(strFromU8(z["index.html"]), /mockups\/one\.html/);
});

test("exportZip carries the business rules and screen notes in docs/", async () => {
  const root = await makeProject({ "one.html": "<p>1</p>", "one.notes.md": "owner: facility", "BUSINESS_RULES.md": "# rules", "PROJECT.md": "# Project description", "notes.txt": "ignored" });
  const dest = path.join(await tmp("out"), "m.zip");
  await exportZip(root, dest);
  const z = unzipSync(new Uint8Array(await readFile(dest)));
  assert.equal(strFromU8(z["docs/BUSINESS_RULES.md"]), "# rules"); assert.equal(strFromU8(z["docs/PROJECT.md"]), "# Project description"); assert.equal(strFromU8(z["docs/one.notes.md"]), "owner: facility");
  assert.ok(!Object.keys(z).some((k) => k.includes("notes.txt")));
});

test("exportZip refuses an empty project", async () => {
  const root = await makeProject({});
  await assert.rejects(exportZip(root, path.join(await tmp("out"), "e.zip")), /no mockup/);
  assert.deepEqual(await listMockups(root), []);
});

test("exported serve.mjs serves files and survives missing ones and traversal", async () => {
  const dir = await tmp("serve");
  await mkdir(path.join(dir, "mockups"));
  await writeFile(path.join(dir, "serve.mjs"), SERVE);
  await writeFile(path.join(dir, "mockups", "a.html"), "<p>a</p>");
  const port = 40000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [path.join(dir, "serve.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "inherit"] });
  try {
    await new Promise((res, rej) => { child.stdout.once("data", res); child.once("exit", () => rej(new Error("server exited early"))); });
    const get = (p) => fetch(`http://127.0.0.1:${port}${p}`);
    assert.equal(await (await get("/mockups/a.html")).text(), "<p>a</p>");
    assert.equal((await get("/mockups/missing.html")).status, 404);
    assert.equal((await get("/%2e%2e/%2e%2e/etc/passwd")).status, 404);
    assert.equal((await get("/mockups/a.html")).status, 200, "still alive after errors");
  } finally { child.kill(); }
});
