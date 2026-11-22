import { test } from "node:test";
import assert from "node:assert/strict";
import { splitNextStep } from "../src/renderer/nextStep.js";

test("the tag is taken out of the answer", () => {
  assert.deepEqual(splitNextStep("Done, the table is there.\n\n<next-step>Add a filter by date</next-step>"), { body: "Done, the table is there.", next: "Add a filter by date" });
});

test("an answer without the tag stays as it is", () => {
  assert.deepEqual(splitNextStep("Hello **world**\n"), { body: "Hello **world**", next: null });
  assert.deepEqual(splitNextStep(""), { body: "", next: null });
  assert.deepEqual(splitNextStep(undefined), { body: "", next: null });
});

test("an unfinished tag is hidden while the answer streams", () => {
  assert.equal(splitNextStep("Done.\n<next-st").body, "Done.");
  assert.equal(splitNextStep("Done.\n<").body, "Done.");
  assert.equal(splitNextStep("Done.\n<next-step>Add a fil").body, "Done.");
  assert.equal(splitNextStep("Done.\n<next-step>Add a fil").next, null);
  assert.equal(splitNextStep("a <b> tag").body, "a <b> tag"); // other markup is left alone
  assert.equal(splitNextStep("x < y").body, "x < y");
});

test("the suggestion is one clean line, not too long", () => {
  assert.equal(splitNextStep("ok <next-step> „Přidej\n detail“ </next-step>").next, "Přidej detail");
  assert.equal(splitNextStep("ok <next-step>   </next-step>").next, null);
  const long = splitNextStep(`ok <next-step>${"word ".repeat(60)}</next-step>`).next;
  assert.ok(long.length <= 140 && long.endsWith("…"));
});

test("the last tag wins and the text around it is kept", () => {
  assert.deepEqual(splitNextStep("A <next-step>one</next-step> B\n<next-step>two</next-step>"), { body: "A  B", next: "two" });
});
