import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { slugify, isSlug, parsePlan, serializePlan, planTitle, withStatus, savePlan, listPlans, readPlan, writePlan, removePlan } from "../src/main/plans.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "plans-"));

test("slugify drops accents and punctuation", () => {
  assert.equal(slugify("E-shop portál: úvod!"), "e-shop-portal-uvod");
  assert.equal(slugify("???"), "plan");
  assert.ok(isSlug(slugify("x".repeat(200))));
});

test("slug validation rejects path tricks", () => {
  for (const s of ["../x", "a/b", "A", "", "-a", "a.md"]) assert.equal(isSlug(s), false, s);
  assert.equal(isSlug("e-shop-2"), true);
});

test("front matter round trip", () => {
  const text = serializePlan({ meta: { title: "A: B", status: "draft", created: "2026-11-10" }, body: "# Hi\n\ntext" });
  const p = parsePlan(text);
  assert.deepEqual(p.meta, { title: "A: B", status: "draft", created: "2026-11-10" });
  assert.equal(p.body, "# Hi\n\ntext");
  assert.deepEqual(parsePlan("# only body").meta, {});
  assert.equal(planTitle(parsePlan("# Heading\nx"), "slug"), "Heading");
  assert.equal(planTitle(parsePlan("plain"), "slug"), "slug");
});

test("withStatus keeps the rest and refuses unknown statuses", () => {
  const out = withStatus("---\ntitle: T\n---\nbody", "approved");
  assert.equal(parsePlan(out).meta.status, "approved");
  assert.equal(parsePlan(out).meta.title, "T");
  assert.throws(() => withStatus("x", "weird"));
});

test("savePlan creates unique files, keeps created on update, list and read see them", async () => {
  const dir = tmp();
  const a = await savePlan(dir, { title: "Portál", markdown: "# Cíl\n- a", today: "2026-11-10" });
  const b = await savePlan(dir, { title: "Portál", markdown: "# Jiný", today: "2026-11-11" });
  assert.equal(a.slug, "portal"); assert.equal(b.slug, "portal-2");
  const c = await savePlan(dir, { slug: "portal", markdown: "# Nová verze", status: "approved", today: "2030-01-01" });
  assert.equal(c.created, false);
  const r = await readPlan(dir, "portal");
  assert.equal(r.meta.created, "2026-11-10"); assert.equal(r.status, "approved"); assert.match(r.body, /Nová verze/);
  assert.deepEqual((await listPlans(dir)).map((p) => p.slug), ["portal", "portal-2"]);
  await writePlan(dir, "portal", "---\ntitle: Ruční\n---\nx");
  assert.equal((await readPlan(dir, "portal")).title, "Ruční");
  await assert.rejects(writePlan(dir, "missing", "x"));
  await assert.rejects(savePlan(dir, { slug: "../evil", markdown: "x" }));
  await removePlan(dir, "portal");
  assert.deepEqual((await listPlans(dir)).map((p) => p.slug), ["portal-2"]);
});

test("a project without plans has an empty list", async () => {
  assert.deepEqual(await listPlans(tmp()), []);
});

test("an update without a title keeps the title of the plan; a heading of any level names a new plan", async () => {
  const dir = tmp();
  const a = await savePlan(dir, { markdown: "## Revidovaný plán\n\ntext", today: "2026-11-10" });
  assert.equal(a.slug, "revidovany-plan"); assert.equal((await readPlan(dir, a.slug)).title, "Revidovaný plán");
  await savePlan(dir, { slug: a.slug, markdown: "bez nadpisu\n\nvíc textu" });
  assert.equal((await readPlan(dir, a.slug)).title, "Revidovaný plán");
  await savePlan(dir, { slug: a.slug, title: "Jiný název", markdown: "x" });
  assert.equal((await readPlan(dir, a.slug)).title, "Jiný název");
});

test("the list tells plans of the same title apart and does not show a generic title when there is a heading", async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "plans"));
  fs.writeFileSync(path.join(dir, "plans", "plan.md"), "---\ntitle: Plan\nstatus: approved\ncreated: 2026-11-01\n---\n## Rozcestník programů\n\nx");
  fs.writeFileSync(path.join(dir, "plans", "plan-2.md"), "---\ntitle: Plan\nstatus: approved\ncreated: 2026-11-02\n---\nbez nadpisu");
  fs.writeFileSync(path.join(dir, "plans", "a.md"), "---\ntitle: Stejný\ncreated: 2026-11-03\n---\nx");
  fs.writeFileSync(path.join(dir, "plans", "b.md"), "---\ntitle: Stejný\ncreated: 2026-11-03\n---\nx");
  const titles = Object.fromEntries((await listPlans(dir)).map((p) => [p.slug, p.title]));
  assert.equal(titles.plan, "Rozcestník programů"); assert.equal(titles["plan-2"], "Plan");
  assert.equal(titles.a, "Stejný (a)"); assert.equal(titles.b, "Stejný (b)");
});
