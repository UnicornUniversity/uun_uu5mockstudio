import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { readComments, writeComments, changeComments, cleanComment, commentPath, screensWithComments, countOpen } from "../src/main/comments.mjs";
import { makeProject } from "./helpers.mjs";

test("a comment is cleaned: texts clipped, status and replies normalised, empty ones dropped", () => {
  assert.equal(cleanComment({ text: "   " }), null);
  assert.equal(cleanComment(null), null);
  const c = cleanComment({ id: "x", text: " Hi ", status: "weird", target: { name: "Button", text: "Save", ordinal: 3, junk: 1 }, replies: [{ text: "ok", author: "Eva" }, { text: "" }], extra: 1 });
  assert.deepEqual(c.target, { name: "Button", text: "Save", ordinal: 3 });
  assert.equal(c.status, "open"); assert.equal(c.text, "Hi"); assert.equal(c.replies.length, 1); assert.equal(c.replies[0].author, "Eva");
  assert.equal("extra" in c, false);
});

test("comments of a screen are saved beside it and removed with the last one", async () => {
  const dir = await makeProject({ "a.html": "<h1>a</h1>" });
  assert.deepEqual(await readComments(dir, "a.html"), []);
  const l1 = await changeComments(dir, "a.html", { type: "add", target: { name: "Uu5Elements.Button", text: "Save" }, text: "Make it primary" }, { author: "Jan" });
  assert.equal(l1.length, 1); assert.equal(l1[0].author, "Jan"); assert.equal(l1[0].status, "open");
  assert.ok(existsSync(commentPath(dir, "a.html")));
  assert.deepEqual(screensWithComments(dir), ["a.html"]);
  const id = l1[0].id;
  let l = await changeComments(dir, "a.html", { type: "reply", id, text: "Done in the next version" }, { author: "Eva" });
  assert.equal(l[0].replies[0].author, "Eva");
  l = await changeComments(dir, "a.html", { type: "resolve", id }, { author: "Jan" });
  assert.equal(l[0].status, "resolved"); assert.equal(l[0].resolvedBy, "Jan"); assert.equal(countOpen(l), 0);
  l = await changeComments(dir, "a.html", { type: "reopen", id });
  assert.equal(l[0].status, "open"); assert.equal("resolvedBy" in l[0], false);
  l = await changeComments(dir, "a.html", { type: "delete", id });
  assert.deepEqual(l, []); assert.equal(existsSync(commentPath(dir, "a.html")), false);
});

test("a bad operation, an unknown comment or a file that is not a screen is refused", async () => {
  const dir = await makeProject({ "a.html": "<h1>a</h1>" });
  await assert.rejects(changeComments(dir, "a.html", { type: "nope" }), /Unknown/);
  await assert.rejects(changeComments(dir, "a.html", { type: "resolve", id: "zzz" }), /No such/);
  assert.throws(() => commentPath(dir, "../x.txt"), /Not a screen/);
});

test("a damaged file reads as no comments and a written one keeps only valid entries", async () => {
  const dir = await makeProject({ "a.html": "<h1>a</h1>" });
  await writeComments(dir, "a.html", [{ text: "ok" }, { text: "" }, null]);
  assert.equal((await readComments(dir, "a.html")).length, 1);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(dir, "a.comments.json"), "{not json");
  assert.deepEqual(await readComments(dir, "a.html"), []);
});
