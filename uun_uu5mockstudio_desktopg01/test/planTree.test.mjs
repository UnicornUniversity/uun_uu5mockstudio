import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTree, extractTree, getNode, updateNode, addChild, addSibling, removeNode, duplicateNode, moveNode, indentNode, outdentNode, moveTo, describeEdits, approvalMessage, countNodes, serializeTree } from "../src/renderer/planTree.js";

const T = () => ({ name: "Screen: rooms", kind: "screen", children: [
  { name: "Plus4U5Elements.ContentContainer", kind: "library", children: [{ name: "RoomList", kind: "new", children: [{ name: "Uu5Elements.Table", kind: "library" }] }, { name: "RoomForm", kind: "new" }] },
  { name: "Uu5Elements.Block", kind: "library", note: "footer" },
] });
const names = (t) => [t.name, ...(t.children ?? []).flatMap(names)];

test("a tree is read from the answer of the agent, cleaned, and the answer keeps its text", () => {
  const raw = { name: " Screen ", kind: "weird", change: "nope", note: " n ", extra: 1, children: [{ name: "A", kind: "library", change: "add" }, { name: "" }, 7] };
  assert.deepEqual(normalizeTree(raw), { name: "Screen", kind: "new", note: "n", children: [{ name: "A", kind: "library", change: "add" }] });
  assert.equal(normalizeTree({ kind: "screen" }), null); assert.equal(normalizeTree(null), null);
  const answer = `Plan\n\nSummary here.\n\n\`\`\`uu5-tree\n${JSON.stringify(T())}\n\`\`\`\n\nOpen question: x?`;
  const r = extractTree(answer);
  assert.equal(r.tree.children.length, 2); assert.equal(r.text, "Plan\n\nSummary here.\n\nOpen question: x?");
  assert.deepEqual(extractTree("no block here"), { text: "no block here", tree: null });
  assert.equal(extractTree("```uu5-tree\n{ not json\n```").tree, null);
  // the size is limited
  let deep = { name: "x" }; for (let i = 0; i < 40; i++) deep = { name: "x", children: [deep] };
  assert.ok(countNodes(normalizeTree(deep)) <= 13, "the depth is limited");
  assert.ok(countNodes(normalizeTree({ name: "r", children: Array.from({ length: 500 }, (_, i) => ({ name: `n${i}` })) })) <= 300);
});

test("editing nodes by path never changes the tree it was given", () => {
  const t = T(), frozen = serializeTree(t);
  assert.equal(getNode(t, [0, 0, 0]).name, "Uu5Elements.Table"); assert.equal(getNode(t, [5]), null);
  const u = updateNode(t, [1], { name: "  Uu5Elements.Tile ", kind: "library", change: "modify", note: "" });
  assert.deepEqual(getNode(u, [1]), { name: "Uu5Elements.Tile", kind: "library", change: "modify" });
  assert.equal(getNode(updateNode(u, [1], { change: "" }), [1]).change, undefined);
  const a = addChild(t, [0, 1], { name: "Uu5Forms.FormText", kind: "library" });
  assert.deepEqual(a.path, [0, 1, 0]); assert.equal(getNode(a.tree, a.path).name, "Uu5Forms.FormText");
  const s = addSibling(t, [0, 0]); assert.deepEqual(s.path, [0, 1]); assert.equal(getNode(s.tree, [0, 2]).name, "RoomForm");
  assert.deepEqual(addSibling(t, []).path, [], "the root has no siblings");
  assert.deepEqual(names(removeNode(t, [0, 0])), ["Screen: rooms", "Plus4U5Elements.ContentContainer", "RoomForm", "Uu5Elements.Block"]);
  assert.equal(removeNode(t, []), t);
  assert.equal(getNode(removeNode(removeNode(t, [0, 1]), [0, 0]), [0]).children, undefined, "an empty branch loses its children list");
  const d = duplicateNode(t, [0, 0]); assert.deepEqual(d.path, [0, 1]); assert.equal(countNodes(d.tree), countNodes(t) + 2);
  assert.equal(serializeTree(t), frozen);
});

test("move up and down, indent and outdent", () => {
  const t = T();
  assert.deepEqual(moveNode(t, [0], 1).path, [1]); assert.deepEqual(names(moveNode(t, [0], 1).tree).slice(1, 2), ["Uu5Elements.Block"]);
  assert.deepEqual(moveNode(t, [0], -1).path, [0], "already first"); assert.deepEqual(moveNode(t, [], 1).path, []);
  const i = indentNode(t, [1]);
  assert.deepEqual(i.path, [0, 2]); assert.equal(getNode(i.tree, [0, 2]).name, "Uu5Elements.Block"); assert.equal(getNode(i.tree, [1]), null);
  assert.deepEqual(indentNode(t, [0]).path, [0], "nothing in front to go into");
  const o = outdentNode(t, [0, 1]);
  assert.deepEqual(o.path, [1]); assert.equal(getNode(o.tree, [1]).name, "RoomForm"); assert.equal(getNode(o.tree, [2]).name, "Uu5Elements.Block");
  assert.deepEqual(outdentNode(t, [0]).path, [0], "a child of the root has no grandparent to go to");
});

test("drag and drop: before, after, inside; never into itself", () => {
  const t = T();
  const before = moveTo(t, [1], [0, 0], "before");
  assert.deepEqual(before.path, [0, 0]); assert.deepEqual(names(before.tree), ["Screen: rooms", "Plus4U5Elements.ContentContainer", "Uu5Elements.Block", "RoomList", "Uu5Elements.Table", "RoomForm"]);
  const after = moveTo(t, [0, 0], [1], "after");
  assert.deepEqual(after.path, [2]); assert.deepEqual(names(after.tree), ["Screen: rooms", "Plus4U5Elements.ContentContainer", "RoomForm", "Uu5Elements.Block", "RoomList", "Uu5Elements.Table"]);
  const inside = moveTo(t, [0, 1], [1], "inside");
  assert.deepEqual(inside.path, [1, 0]); assert.equal(getNode(inside.tree, [1, 0]).name, "RoomForm"); assert.equal(getNode(inside.tree, [0]).children.length, 1);
  // the target path shifts when the node is taken from in front of it: the node still lands at the right place
  const shifted = moveTo(t, [0, 0], [0, 1], "after"); assert.deepEqual(shifted.path, [0, 1]); assert.equal(getNode(shifted.tree, [0, 0]).name, "RoomForm");
  assert.equal(moveTo(t, [0], [0, 0], "inside").tree, t, "into its own subtree"); assert.equal(moveTo(t, [0], [0], "after").tree, t, "onto itself");
  assert.equal(moveTo(t, [], [1], "after").tree, t, "the root cannot move"); assert.equal(moveTo(t, [0], [], "before").tree, t, "the root has no siblings");
  assert.deepEqual(names(moveTo(t, [1], [], "inside").tree), names(t), "inside the root: it stays among its children (the last one)");
  assert.equal(serializeTree(t), serializeTree(T()), "the original is untouched");
});

test("what the user changed is told to the agent", () => {
  const original = { text: "Plan A", tree: T() };
  assert.equal(approvalMessage({ text: "Plan A", tree: T(), original }), "Plan approved: build it exactly as planned.");
  const edited = removeNode(T(), [1]), added = addChild(edited, [0], { name: "Uu5Elements.Tile", kind: "library", change: "add" }).tree;
  const lines = describeEdits(original.tree, added);
  assert.ok(lines.some((l) => /removed or changed: \(root\)|removed or changed: Screen: rooms > Uu5Elements.Block/.test(l)) || lines.some((l) => /Uu5Elements.Block/.test(l)));
  assert.ok(lines.some((l) => /added or changed: Plus4U5Elements.ContentContainer > Uu5Elements.Tile \[library, add\]/.test(l)));
  const msg = approvalMessage({ text: "Plan A, edited", tree: added, original });
  assert.match(msg, /^Plan approved\. The user edited the plan/); assert.match(msg, /Plan A, edited/); assert.match(msg, /```uu5-tree[\s\S]*Uu5Elements\.Tile/); assert.match(msg, /What the user changed in the tree:\n- /); assert.match(msg, /text of the plan was edited too/);
  assert.match(approvalMessage({ text: "Plan A edited text", tree: T(), original }), /edited too/, "a text edit alone counts");
  assert.deepEqual(describeEdits(null, T()), []);
  const withNote = updateNode(T(), [1], { note: "other" }); assert.deepEqual(describeEdits(T(), withNote), ["notes of components changed"]);
});

// ---------------------------------------------------------------- questions, drawn trees, layout, notation fields
import { extractPlan, parseAsciiTree, normalizeQuestions, answersText, unanswered, layoutTree, dropTarget, BOX } from "../src/renderer/planTree.js";

const ASCII = `Page  (AlertBus)
├─ SimulatedTop                          ← stejný pruh
│  ├─ Button (avatar)
│  ├─ Text ×2 (organizace, aplikace)
│  └─ Plus4U5App.Plus4UButton  (v obalu)
│
├─ RouteHeader (ručně složená hlavička)
│  └─ Text (title/major) "Závěrečné práce"
│
└─ SideDetailLayout  (position="right")
   │
   ├─ [hlavní část]
   │  └─ Uu5Tiles.ControllerProvider  (data)
   │     └─ SummaryTile ×6
   └─ [detail]`;

test("a tree drawn with branches becomes a tree", () => {
  const t = parseAsciiTree(ASCII);
  assert.equal(t.name, "Page"); assert.equal(t.kind, "screen");
  assert.deepEqual(t.children.map((c) => c.name), ["SimulatedTop", "RouteHeader", "SideDetailLayout"]);
  assert.deepEqual(t.children[0].children.map((c) => c.name), ["Button", "Text", "Plus4U5App.Plus4UButton"]);
  assert.equal(t.children[0].children[1].relation, "1:N");
  assert.equal(t.children[0].children[2].kind, "library");
  const side = t.children[2];
  assert.deepEqual(side.children.map((c) => c.name), ["hlavní část", "detail"]);
  assert.equal(side.children[0].children[0].children[0].name, "SummaryTile");
  assert.equal(side.children[0].children[0].children[0].relation, "1:N");
});

test("extractPlan reads questions, the uu5-tree block, and falls back to a drawn tree", () => {
  const q = { questions: [{ question: "Modal or page?", header: "Form", options: [{ label: "Modal (Recommended)", description: "x" }, { label: "Page" }] }, { question: "bad", options: [{ label: "only one" }] }] };
  const a = extractPlan("Summary\n\n```uu5-questions\n" + JSON.stringify(q) + "\n```\n\n```uu5-tree\n{\"name\":\"S\",\"kind\":\"screen\"}\n```\nBuild?");
  assert.equal(a.questions.length, 1); assert.equal(a.questions[0].id, "q1"); assert.equal(a.tree.name, "S");
  assert.ok(!a.text.includes("uu5-"));
  const b = extractPlan("Plan\n\n```\n" + ASCII + "\n```\nOK?");
  assert.equal(b.tree.children.length, 3); assert.ok(!b.text.includes("├"));
  assert.equal(extractPlan("just text").tree, null);
});

test("answers: text, what is open, and the approval message carries them", () => {
  const qs = normalizeQuestions([{ id: "a", header: "H", question: "Q1?", options: [{ label: "x" }, { label: "y" }] }, { id: "b", question: "Q2?", options: ["m", "n"] }]);
  const ans = { a: { choices: ["x"] }, b: { choices: [], other: " own " } };
  assert.equal(unanswered(qs, ans).length, 0);
  assert.match(answersText(qs, ans), /H: Q1\? → x\n- Q2\? → other: own/);
  assert.equal(unanswered(qs, { a: { choices: ["x"] } })[0].id, "b");
  const msg = approvalMessage({ text: "t", tree: { name: "S", kind: "screen" }, original: { text: "t", tree: { name: "S", kind: "screen" } }, questions: qs, answers: { a: { choices: ["x"] } } });
  assert.match(msg, /^Plan approved: build it exactly as planned\./); assert.match(msg, /Q1\? → x/); assert.match(msg, /Not answered[\s\S]*Q2\?/);
});

test("notation fields are kept, clipped and editable", () => {
  const n = normalizeTree({ name: "Tile", relation: "1:N", render: "item.visible", disabled: "!canEdit", label: "header", low: true, data: "one joke", junk: 1 });
  assert.deepEqual(n, { name: "Tile", kind: "new", relation: "1:N", low: true, render: "item.visible", disabled: "!canEdit", label: "header", data: "one joke" });
  const u = updateNode(n, [], { relation: "", low: false, render: "" });
  assert.equal(u.relation, undefined); assert.equal(u.low, undefined); assert.equal(u.render, undefined); assert.equal(u.label, "header");
});

test("layout: siblings left to right, depth top-down, no overlap; collapse hides children", () => {
  const t = { name: "R", kind: "screen", children: [{ name: "A", kind: "new", children: [{ name: "A1", kind: "new" }, { name: "A2", kind: "new" }] }, { name: "B", kind: "new" }] };
  const L = layoutTree(t), by = (k) => L.nodes.find((b) => b.key === k);
  assert.ok(by("0.0").x < by("0.1").x && by("0.1").x + BOX.w <= by("1").x, "order and no overlap");
  assert.ok(by("").y < by("0").y && by("0").y < by("0.0").y);
  assert.equal(L.edges.length, 4);
  const C = layoutTree(t, { collapsed: new Set(["0"]) });
  assert.equal(C.nodes.length, 3); assert.equal(C.nodes.find((b) => b.key === "0").hidden, 2);
  const a = by("0"), mid = { x: a.x + a.w / 2, y: a.y + 5 };
  assert.deepEqual(dropTarget(L, mid.x, mid.y), { path: [0], position: "inside" });
  assert.equal(dropTarget(L, a.x + 3, a.y + 5).position, "before");
  assert.equal(dropTarget(L, by("1").x + BOX.w - 3, by("1").y + 5).position, "after");
  assert.equal(dropTarget(L, by("0.0").x + 40, by("0.0").y + 5, [0]), null, "not into its own subtree");
  assert.equal(dropTarget(L, -50, -50), null);
});
