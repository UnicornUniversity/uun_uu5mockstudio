import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHandoff, gatherHandoff, libraryUsage, localComponents } from "../src/main/handoff.mjs";
import { changeComments } from "../src/main/comments.mjs";
import { makeProject } from "./helpers.mjs";

const tree = { name: "Screen: x", kind: "screen", children: [{ name: "Page", kind: "existing", children: [
  { name: "Uu5Elements.Block", kind: "library", children: [{ name: "Uu5Elements.Button", kind: "library" }, { name: "Uu5Elements.Button", kind: "library" }] },
  { name: "Uu5Forms.FormText", kind: "library" }, { name: "RoomRow", kind: "new" }] }] };

test("libraries and the components of the screen itself are collected from the structure", () => {
  assert.deepEqual(libraryUsage(tree), [{ name: "Uu5Elements.Button", count: 2 }, { name: "Uu5Elements.Block", count: 1 }, { name: "Uu5Forms.FormText", count: 1 }]);
  assert.deepEqual(localComponents(tree).sort(), ["Page", "RoomRow"]);
  assert.deepEqual(libraryUsage(null), []);
});

test("the specification holds the overview, rules, structure, notes, comments and the open questions", () => {
  const md = buildHandoff({
    project: "Rooms", date: "2026-11-08", description: "Booking of rooms.", repo: "branch main of rooms-app", rules: "# Business rules\n\n## General\n- R-001 A room has a code.\n",
    screens: [{ file: "room-list.html", description: "The list of rooms.", outline: "Screen: room-list\n  Page", libraries: libraryUsage(tree), locals: ["RoomRow"],
      notes: [{ id: "n1", text: "Ask the office\nabout archived rooms" }],
      comments: [{ id: "c1", author: "Jan", target: { name: "Uu5Elements.Button", text: "Save" }, text: "Make it primary", status: "open", replies: [{ author: "Eva", text: "ok" }] },
        { id: "c2", author: "Eva", target: { name: "Block" }, text: "Rename", status: "resolved", resolvedBy: "Jan", replies: [] }] }],
  });
  assert.match(md, /^# Handoff: Rooms/);
  assert.match(md, /## Overview\n\nBooking of rooms\./);
  assert.match(md, /rooms-app/);
  assert.match(md, /\| room-list \| The list of rooms\. \| Uu5Elements, Uu5Forms \| 1 \|/);
  assert.match(md, /### General\n- R-001/); // the rules are one level deeper
  assert.match(md, /## Screen: room-list/);
  assert.match(md, /```\nScreen: room-list\n {2}Page\n```/);
  assert.match(md, /- `Uu5Elements.Button` ×2/);
  assert.match(md, /- Ask the office about archived rooms/);
  assert.match(md, /### Open comments\n\n- \*\*Uu5Elements.Button\*\* “Save” \(Jan\): Make it primary · 1 reply: Eva: ok/);
  assert.match(md, /### Resolved comments[\s\S]*Rename.*✓ Jan/);
  assert.match(md, /## Components overall[\s\S]*`Uu5Elements.Button` \| 2/);
  assert.match(md, /## Open questions\n\n- room-list \/ Uu5Elements.Button: Make it primary/);
  assert.doesNotMatch(md, /\n{3,}/);
});

test("an empty project still gives a readable document", () => {
  const md = buildHandoff({ project: "Empty", date: "2026-11-08", screens: [] });
  assert.match(md, /There is no screen yet\./); assert.match(md, /No rule has been recorded\./); assert.match(md, /No open comment\./);
});

test("the project folder is read: a real screen gives its structure, the description, notes and comments", async () => {
  const html = await readFile(path.resolve("src/main/templates/builtin/web-home/home.html"), "utf8");
  const dir = await makeProject({ "home.html": html });
  await writeFile(path.join(dir, "PROJECT.md"), "# Project description\n\nA school site.\n\n## Screen: home\n\nThe front page.\n");
  await writeFile(path.join(dir, "BUSINESS_RULES.md"), "# Business rules\n\n## General\n- R-001 Applications close on 31 August.\n");
  await writeFile(path.join(dir, "home.notes.md"), "# Notes: home\n\n<!-- note n1 -->\nCheck the dates\n");
  await changeComments(dir, "home.html", { type: "add", target: { name: "Page" }, text: "Add a map" }, { author: "Eva" });
  const data = await gatherHandoff(dir, { project: "School", date: "2026-11-08" });
  assert.equal(data.description, "A school site."); assert.equal(data.screens[0].description, "The front page.");
  assert.ok(data.screens[0].outline.includes("Page")); assert.ok(data.screens[0].libraries.some((l) => l.name === "Uu5Elements.Icon"));
  const md = buildHandoff(data);
  assert.match(md, /Applications close on 31 August/); assert.match(md, /Check the dates/); assert.match(md, /Add a map/);
});
