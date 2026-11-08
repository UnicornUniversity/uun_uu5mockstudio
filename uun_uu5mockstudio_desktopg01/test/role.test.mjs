import test from "node:test";
import assert from "node:assert/strict";
import { ROLES, ROLE_IDS, DEFAULT_ROLE, isRole, roleOf, rolePrompt, planFirst } from "../src/renderer/role.js";

const LEVELS = ["app", "route", "component", "web", "page"];
const SHARE = ["png", "html", "uu5", "zip"];

test("every role has a complete, valid preset", () => {
  assert.deepEqual(ROLE_IDS, ["uiux", "mkt", "architect", "other"]);
  for (const id of ROLE_IDS) {
    const r = ROLES[id];
    assert.ok(r.label && r.hint && r.ideas && r.prompt, id);
    assert.ok(LEVELS.includes(r.level), id);
    assert.ok(SHARE.includes(r.share), id);
    assert.equal(typeof r.eco, "boolean"); assert.equal(typeof r.plan, "boolean"); assert.equal(typeof r.simple, "boolean");
  }
});

test("the simple view is for the roles that are not designers or developers", () => {
  assert.deepEqual(ROLE_IDS.filter((id) => ROLES[id].simple), ["mkt", "other"]);
});

test("an unknown or missing role falls back to the simplest one", () => {
  assert.equal(DEFAULT_ROLE, "other");
  assert.equal(isRole("mkt"), true); assert.equal(isRole("admin"), false); assert.equal(isRole(undefined), false);
  assert.equal(roleOf("nope"), ROLES.other); assert.equal(roleOf(undefined), ROLES.other);
});

test("the agent gets a sentence about the role, nothing without one", () => {
  assert.match(rolePrompt("mkt"), /marketing/i);
  assert.equal(rolePrompt(undefined), ""); assert.equal(rolePrompt("x"), "");
});

test("only the architect plans first, and only for an application or a route", () => {
  assert.equal(planFirst("architect", "app"), true);
  assert.equal(planFirst("architect", "route"), true);
  assert.equal(planFirst("architect", "component"), false);
  assert.equal(planFirst("uiux", "app"), false);
});
