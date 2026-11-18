import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sitemapTools, SITEMAP_WRITE_TOOLS } from "../src/main/sitemapMcp.mjs";
import { PLAN_DENIED, toolVerdict, memoryPrompt } from "../src/main/claudeService.mjs";

const map = { kind: "portal", root: { id: "r", title: "R", children: [
  { id: "vp", title: "Vnitřní předpisy", children: [{ id: "s1", title: "Směrnice BOZP", type: "sheet" }] },
  { id: "hr", title: "HR", children: [{ id: "c1", title: "BOZP", type: "sheet" }] },
] } };
const run = (tools, name, args = {}) => tools.find((t) => t.name === name).handler(args).then((r) => r.content[0].text);

test("the agent reads the sitemap with ids and makes a copy a link; the previous map is kept", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "smmcp-"));
  await fs.writeFile(path.join(dir, "sitemap.json"), JSON.stringify(map));
  const tools = sitemapTools({ projectDir: () => dir });
  assert.match(await run(tools, "sitemap_read"), /- BOZP \{id: c1\} \[sheet\]/);
  const out = await run(tools, "sitemap_links", { replace: [{ node: "c1", original: "s1" }] });
  assert.match(out, /Done \(1\):\n- R > HR > BOZP -> link to R > Vnitřní předpisy > Směrnice BOZP/);
  const saved = JSON.parse(await fs.readFile(path.join(dir, "sitemap.json"), "utf8"));
  assert.deepEqual(saved.root.children[1].children[0], { id: "c1", ref: "s1", title: "Směrnice BOZP", type: "sheet", children: [] });
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, ".studio", "sitemap.prev.json"), "utf8")).root.children[1].children[0].title, "BOZP");
  assert.match(await run(tools, "sitemap_links", { replace: [{ node: "c1", original: "s1" }] }), /already a link to it[\s\S]*Nothing was changed/);
  assert.equal(await run(sitemapTools({ projectDir: () => path.join(dir, "none") }), "sitemap_read"), "This project has no sitemap.");
});

test("the tool that changes the map is not available while planning, and the agent is told to use it", () => {
  for (const t of SITEMAP_WRITE_TOOLS) { assert.ok(PLAN_DENIED.has(t)); assert.equal(toolVerdict({ plan: true, cwd: "/p", tool: t }).behavior, "deny"); }
  const prompt = memoryPrompt({ cwd: "/p", rules: "", sitemapBlock: "- R" });
  assert.match(prompt, /sitemap_read \(the map with the ids\) and sitemap_links/);
});
