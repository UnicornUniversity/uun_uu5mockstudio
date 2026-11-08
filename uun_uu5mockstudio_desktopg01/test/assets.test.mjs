import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { mediaRefs, projectRelative, findAssets, writeUu5Assets } from "../src/main/assets.mjs";
import { exportZip } from "../src/main/exporter.mjs";
import { makeProject, tmp } from "./helpers.mjs";

const withFiles = async (html, files) => {
  const root = await makeProject(html);
  for (const [n, c] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, n)), { recursive: true }); await writeFile(path.join(root, n), c); }
  return root;
};

test("mediaRefs finds local pictures and videos in html, css and uu5String, not remote ones", () => {
  const t = `<img src="assets/logo.png"><div style="background:url(img/bg.jpg?v=2)"></div><video src='clip.mp4'></video>
    <img src="https://x.net/a.png"><img src="data:image/png;base64,AAAA"><img src="//cdn/x.svg"> 'image': "/Proj/.studio/sources/assets/0123.webp"`;
  assert.deepEqual(mediaRefs(t).sort(), ["/Proj/.studio/sources/assets/0123.webp", "assets/logo.png", "clip.mp4", "img/bg.jpg"]);
});

test("projectRelative keeps references inside the project and its private folders out", () => {
  assert.equal(projectRelative("./assets/a%20b.png", "P"), "assets/a b.png");
  assert.equal(projectRelative("/P/assets/a.png", "P"), "assets/a.png");
  assert.equal(projectRelative("/P/.studio/sources/assets/x.png", "P"), ".studio/sources/assets/x.png");
  assert.equal(projectRelative("../x.png", "P"), null);
  assert.equal(projectRelative("assets/../../x.png", "P"), null);
  assert.equal(projectRelative(".studio/attachments/shot.png", "P"), null);
  assert.equal(projectRelative(".studio/state.png", "P"), null);
});

test("findAssets skips missing files and symlink-free paths only", async () => {
  const root = await withFiles({ "a.html": "x" }, { "assets/a.png": "PNG", "pics/b.jpg": "JPG" });
  const r = await findAssets(root, ['<img src="assets/a.png"><img src="pics/b.jpg"><img src="assets/none.png">']);
  assert.deepEqual(r.map((a) => a.zipPath).sort(), ["assets/a.png", "pics/b.jpg"]);
});

test("exportZip adds the pictures a screen uses, wherever they are, and rewrites absolute references", async () => {
  const name = "Proj";
  const base = await tmp("proj"); const root = path.join(base, name); await mkdir(root);
  await mkdir(path.join(root, ".studio/sources/assets"), { recursive: true });
  await writeFile(path.join(root, ".studio/state.json"), "{}");
  await writeFile(path.join(root, ".studio/sources/assets/0123.png"), "DOC");
  await mkdir(path.join(root, "assets")); await writeFile(path.join(root, "assets/logo.png"), "LOGO");
  await mkdir(path.join(root, "pics")); await writeFile(path.join(root, "pics/p.jpg"), "PIC");
  await writeFile(path.join(root, "one.html"), `<img src="assets/logo.png"><img src="pics/p.jpg"><img src="/Proj/.studio/sources/assets/0123.png">`);
  const dest = path.join(await tmp("out"), "p.zip");
  const r = await exportZip(root, dest);
  assert.equal(r.assets, 3);
  const z = unzipSync(new Uint8Array(await readFile(dest)));
  assert.equal(strFromU8(z["mockups/assets/logo.png"]), "LOGO");
  assert.equal(strFromU8(z["mockups/pics/p.jpg"]), "PIC");
  assert.equal(strFromU8(z["mockups/assets/sources/0123.png"]), "DOC");
  assert.match(strFromU8(z["mockups/one.html"]), /<img src="assets\/sources\/0123\.png">/);
  assert.ok(!Object.keys(z).some((k) => k.includes("state.json")));
});

test("writeUu5Assets zips the files a uu5String refers to, and writes nothing when there are none", async () => {
  const root = await withFiles({ "a.html": "x" }, { "assets/logo.png": "LOGO" });
  const out = await tmp("out");
  assert.equal(await writeUu5Assets(root, "<uu5string/><Text>hi</Text>", path.join(out, "n.zip")), 0);
  await assert.rejects(readFile(path.join(out, "n.zip")), /ENOENT/);
  assert.equal(await writeUu5Assets(root, `<uu5string/><Uu5Elements.Image src="assets/logo.png"/>`, path.join(out, "y.zip"), "a"), 1);
  const z = unzipSync(new Uint8Array(await readFile(path.join(out, "y.zip"))));
  assert.equal(strFromU8(z["assets/logo.png"]), "LOGO");
  assert.match(strFromU8(z["README.md"]), /assets\/logo\.png → assets\/logo\.png/);
});
