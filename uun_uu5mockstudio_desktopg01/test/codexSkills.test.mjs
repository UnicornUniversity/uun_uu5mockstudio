import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmp } from "./helpers.mjs";
import { pluginRoot, requiredFiles, skillsPrompt, readsSkill, writesScreen, reworkPrompt } from "../src/main/codexSkills.mjs";
import { sumUsage } from "../src/main/codexService.mjs";

async function install() {
  const h = await tmp(), base = path.join(h, ".codex", "plugins", "cache", "uu-technical-products-mp");
  const put = async (p, f) => { await mkdir(path.dirname(path.join(base, p)), { recursive: true }); await writeFile(path.join(base, p, ".."), "").catch(() => {}); await mkdir(path.join(base, path.dirname(p)), { recursive: true }); await writeFile(path.join(base, p), f ?? "x"); };
  await put("uu5-mockup/0.2.1/skills/create-mockup/SKILL.md"); await put("uu5-mockup/0.10.0/skills/create-mockup/SKILL.md"); await put("uu5-mockup/0.10.0/skills/mockup-iterate/SKILL.md");
  await put("uu5-mockup/0.10.0/rules/uu5-mockup-coding.mdc"); await put("uugds/1.0.0/skills/uugds-icons/SKILL.md"); await put("uu5-development/1.0.0/skills/uu5-knowledge/SKILL.md");
  return h;
}

test("the newest installed version is read, rules first, then the skills", async () => {
  const h = await install();
  assert.match(pluginRoot("uu5-mockup", { home: h }), /0\.10\.0$/);
  await mkdir(path.join(h, ".codex", "plugins", "cache", "uu-technical-products-mp", "uugds", "1.0.0", "rules"), { recursive: true });
  await writeFile(path.join(h, ".codex", "plugins", "cache", "uu-technical-products-mp", "uugds", "1.0.0", "rules", "uugds-content.mdc"), "x");
  const f = requiredFiles({ home: h }).map((x) => x.split(path.sep).slice(-3).join("/"));
  assert.deepEqual(f, ["0.10.0/rules/uu5-mockup-coding.mdc", "skills/create-mockup/SKILL.md", "skills/mockup-iterate/SKILL.md", "1.0.0/rules/uugds-content.mdc", "skills/uugds-icons/SKILL.md", "skills/uu5-knowledge/SKILL.md"].map((x) => x.split("/").slice(-3).join("/")));
});

test("nothing installed, nothing demanded", async () => {
  const h = await tmp();
  assert.deepEqual(requiredFiles({ home: h }), []);
  assert.equal(skillsPrompt([]), "");
});

test("the instruction is binding and lists the files", () => {
  const p = skillsPrompt(["/a/SKILL.md"]);
  assert.match(p, /MANDATORY/); assert.match(p, /- \/a\/SKILL\.md/); assert.match(p, /Skills read:/);
  assert.match(reworkPrompt(["/a/SKILL.md"]), /- \/a\/SKILL\.md/);
});

test("reading a skill and writing a screen are recognised", () => {
  assert.ok(readsSkill("/bin/zsh -lc 'cat /h/.codex/plugins/cache/x/uugds/1/skills/uugds-icons/SKILL.md'"));
  assert.ok(readsSkill("sed -n 1,80p /p/rules/uu5-mockup-design.mdc"));
  assert.ok(!readsSkill("ls -la"));
  assert.ok(writesScreen({ type: "file_change", changes: [{ path: "/p/a.html" }] }));
  assert.ok(!writesScreen({ type: "file_change", changes: [{ path: "/p/BUSINESS_RULES.md" }] }));
  assert.ok(writesScreen({ type: "command_execution", command: "cat > screen-a.html <<'EOF'\n<html>" }));
  assert.ok(!writesScreen({ type: "command_execution", command: "cat screen-a.html" }));
  assert.ok(!writesScreen({ type: "agent_message" }));
});

test("usage of the first and the second run are added up", () => {
  const a = { in: 10, out: 2, cacheRead: 5, cacheWrite: 0, models: { m: { in: 10, out: 2 } }, perRequest: true }, b = { in: 1, out: 1, cacheRead: 1, cacheWrite: 0, models: { m: { in: 1, out: 1 } }, perRequest: true };
  assert.deepEqual(sumUsage(a, b), { in: 11, out: 3, cacheRead: 6, cacheWrite: 0, models: { m: { in: 11, out: 3 } }, perRequest: true });
  assert.equal(sumUsage(null, b), b);
});
