import { test } from "node:test";
import assert from "node:assert/strict";
import { commentsOf, groupComments, updateNodes, reviseMessage, normalizeSitemap, extractSitemap, replaceSitemapBlock, serializeSitemap, countPages, countNodes, countSections, getNode, updateNode, addChild, addSibling, removeNode, moveNode, indentNode, outdentNode, fileFor, pathTitles } from "../src/renderer/sitemap.js";

const sample = () => normalizeSitemap({ root: { title: "Portal", children: [{ title: "Study", type: "group", children: [{ title: "Theses", file: "theses.html" }, { title: "Exams" }] }, { title: "Library", file: "library.html" }, { title: "Moodle", type: "external" }] } });

test("normalize fills ids and types, drops junk and bad file names", () => {
  const sm = normalizeSitemap({ root: { title: "A", file: "../evil.html", type: "weird", extra: 1, children: [{ title: "A" }, { title: "A" }, null, 5] } });
  assert.equal(sm.root.type, "page"); assert.equal(sm.root.file, undefined); assert.equal("extra" in sm.root, false);
  assert.deepEqual(sm.root.children.map((c) => c.id), ["A-2", "A-3"]); // unique, and the root keeps A
  assert.equal(normalizeSitemap(null), null); assert.equal(normalizeSitemap({ foo: 1 }), null);
  assert.equal(normalizeSitemap({ title: "Bare node" }).root.title, "Bare node");
});

test("normalize limits the size", () => {
  const wide = { title: "r", children: Array.from({ length: 500 }, (_, i) => ({ title: `p${i}` })) };
  assert.equal(countNodes(normalizeSitemap(wide)), 200);
  let deep = { title: "x" }; for (let i = 0; i < 20; i++) deep = { title: "x", children: [deep] };
  let d = 0, n = normalizeSitemap(deep).root; while (n.children.length) { n = n.children[0]; d++; } assert.ok(d <= 8);
});

test("extract cuts the block and keeps the text; invalid JSON stays text", () => {
  const text = "Intro\n\n```uu5-sitemap\n{\"root\":{\"title\":\"P\",\"children\":[{\"title\":\"Q\"}]}}\n```\n\nOutro";
  const r = extractSitemap(text);
  assert.equal(r.text, "Intro\n\nOutro"); assert.equal(countNodes(r.sitemap), 2);
  const bad = extractSitemap("```uu5-sitemap\n{nope\n```");
  assert.equal(bad.sitemap, null); assert.match(bad.text, /uu5-sitemap/);
});

test("replaceSitemapBlock replaces in place or appends; round trip", () => {
  const sm = sample(), body = replaceSitemapBlock("Text", sm);
  assert.deepEqual(extractSitemap(body).sitemap, sm);
  const sm2 = updateNode(sm, [], { title: "New" });
  const body2 = replaceSitemapBlock(body, sm2);
  assert.equal(body2.match(/uu5-sitemap/g).length, 1); assert.equal(extractSitemap(body2).sitemap.root.title, "New");
  assert.match(serializeSitemap(sm), /"root"/);
});

test("edits by path return new sitemaps and select the right node", () => {
  const sm = sample();
  assert.equal(getNode(sm, [0, 1]).title, "Exams");
  const a = addChild(sm, [0], "Registration"); assert.deepEqual(a.path, [0, 2]); assert.equal(getNode(a.sitemap, a.path).title, "Registration"); assert.equal(countNodes(sm), 6);
  const b = addSibling(sm, [0, 0], "Between"); assert.deepEqual(b.path, [0, 1]); assert.equal(getNode(b.sitemap, [0, 2]).title, "Exams");
  assert.deepEqual(addSibling(sm, [], "x").path, [3]); // a sibling of the root is a child of it
  const r = removeNode(sm, [0, 0]); assert.equal(countNodes(r.sitemap), 5); assert.deepEqual(r.path, [0, 0]);
  assert.equal(removeNode(sm, []).sitemap, sm); // the root stays
  const m = moveNode(sm, [1], -1); assert.deepEqual(m.path, [0]); assert.equal(getNode(m.sitemap, [0]).title, "Library");
  assert.equal(moveNode(sm, [0], -1).sitemap, sm);
  const ind = indentNode(sm, [1]); assert.deepEqual(ind.path, [0, 2]); assert.equal(getNode(ind.sitemap, [0, 2]).title, "Library");
  const out = outdentNode(sm, [0, 0]); assert.deepEqual(out.path, [1]); assert.equal(getNode(out.sitemap, [1]).title, "Theses");
});

test("updateNode validates, and unique ids survive new nodes", () => {
  const sm = sample();
  assert.equal(updateNode(sm, [1], { file: "../x.html" }).root.children[1].file, "library.html");
  assert.equal(updateNode(sm, [1], { file: "" }).root.children[1].file, undefined);
  assert.equal(updateNode(sm, [1], { type: "nope" }).root.children[1].type, "page");
  const a = addChild(addChild(sm, [], "New page").sitemap, [], "New page");
  const ids = []; const walk = (n) => { ids.push(n.id); n.children.forEach(walk); }; walk(a.sitemap.root);
  assert.equal(new Set(ids).size, ids.length);
});

test("file names and titles of a path", () => {
  const sm = sample();
  assert.equal(fileFor(sm, { title: "Final State Exams" }), "final-state-exams.html");
  assert.equal(fileFor(sm, { title: "Library" }), "library-2.html"); // library.html belongs to another node
});
test("pathTitles names where a page is", () => {
  assert.equal(pathTitles(sample(), [0, 1]), "Portal > Study > Exams");
});

import { extractPlan, approvalMessage } from "../src/renderer/planTree.js";
import { planPrompt } from "../src/main/claudeService.mjs";

test("a plan answer carries the sitemap next to the tree and the questions", () => {
  const answer = "Summary\n\n```uu5-sitemap\n{\"root\":{\"title\":\"Portal\",\"children\":[{\"title\":\"A\"}]}}\n```\n\n```uu5-tree\n{\"name\":\"Screen: a\",\"kind\":\"screen\"}\n```\n\nBuild?";
  const p = extractPlan(answer);
  assert.equal(countNodes(p.sitemap), 2); assert.equal(p.tree.name, "Screen: a"); assert.equal(p.text, "Summary\n\nBuild?");
  assert.equal(extractPlan("no blocks").sitemap, null);
});

test("approval: an edited sitemap goes to the agent, an untouched one does not", () => {
  const sm = sample(), same = approvalMessage({ text: "t", tree: null, sitemap: sm, original: { text: "t", tree: null, sitemap: sm } });
  assert.match(same, /build it exactly as planned/); assert.match(same, /not an order to build its pages/);
  const edited = approvalMessage({ text: "t", tree: null, sitemap: updateNode(sm, [], { title: "X" }), original: { text: "t", tree: null, sitemap: sm } });
  assert.match(edited, /uu5-sitemap/); assert.match(edited, /sitemap was edited/);
});

test("the planning prompt asks for a sitemap for portals and web sites", () => {
  assert.match(planPrompt(), /uu5-sitemap/); assert.match(planPrompt(), /a sitemap, a site map/); assert.match(planPrompt(), /NOT a screen/); assert.match(planPrompt(), /only when the plan builds or changes one particular screen/); assert.match(planPrompt(), /NOT an order to build it/);
});

import { replaceTreeBlock } from "../src/renderer/planTree.js";
test("replaceTreeBlock replaces the tree block in place or appends one", () => {
  const t = { name: "Screen: a", kind: "screen" }, t2 = { name: "Screen: b", kind: "screen" };
  const body = `Text\n\n\`\`\`uu5-tree\n${JSON.stringify(t)}\n\`\`\`\n\nMore`;
  const out = replaceTreeBlock(body, t2);
  assert.equal(out.match(/uu5-tree/g).length, 1); assert.equal(extractPlan(out).tree.name, "Screen: b"); assert.match(out, /^Text/); assert.match(out, /More$/);
  assert.equal(extractPlan(replaceTreeBlock("Only text", t)).tree.name, "Screen: a");
});

import { removeTreeBlock } from "../src/renderer/planTree.js";
test("removeTreeBlock takes the tree out and keeps the rest", () => {
  const body = "Text\n\n```uu5-tree\n{\"name\":\"a\",\"kind\":\"screen\"}\n```\n\nMore";
  const out = removeTreeBlock(body);
  assert.equal(extractPlan(out).tree, null); assert.match(out, /^Text/); assert.match(out, /More\n$/);
  assert.equal(removeTreeBlock("No tree"), "No tree");
});

test("sections are parts of a page: they are not counted as pages", () => {
  const sm = normalizeSitemap({ root: { title: "Portal", children: [{ title: "Contacts", children: [{ title: "Office hours", type: "section" }, { title: "Forms", type: "section" }] }, { title: "Menu", type: "group" }, { title: "Out", type: "external" }] } });
  assert.equal(countNodes(sm), 6); assert.equal(countPages(sm), 2); assert.equal(countSections(sm), 2);
  assert.equal(getNode(sm, [0, 0]).type, "section");
  assert.equal(updateNode(sm, [1], { type: "section" }).root.children[1].type, "section");
});

test("comments on pages are kept, listed and turned into the request for a revision", () => {
  let sm = sample();
  sm = updateNode(sm, [0, 1], { comment: "Merge with Theses" });
  sm = updateNode(sm, [2], { comment: "  Is it a page?  " });
  assert.deepEqual(commentsOf(sm).map((c) => [c.where, c.comment]), [["Portal > Study > Exams", "Merge with Theses"], ["Portal > Moodle", "Is it a page?"]]);
  assert.deepEqual(extractSitemap(replaceSitemapBlock("x", sm)).sitemap, sm); // they survive the file
  const msg = reviseMessage({ slug: "p", sm, extra: "Fewer groups", body: "BODY" });
  assert.match(msg, /plans\/p\.md/); assert.match(msg, /- Portal > Study > Exams: Merge with Theses/); assert.match(msg, /as a whole: Fewer groups/); assert.match(msg, /BODY$/);
  assert.equal(commentsOf(updateNode(sm, [0, 1], { comment: "" })).length, 1);
  assert.doesNotMatch(reviseMessage({ slug: "p", sm: sample(), extra: "x", body: "" }), /commented on these pages/);
});

test("one comment on several pages is shared and sent as one together", () => {
  let sm = updateNodes(sample(), [[0, 0], [0, 1]], { comment: "Make them sections" });
  assert.equal(commentsOf(sm).length, 2); assert.equal(groupComments(sm).length, 1);
  assert.deepEqual(groupComments(sm)[0].wheres, ["Portal > Study > Theses", "Portal > Study > Exams"]);
  assert.match(reviseMessage({ slug: "p", sm, body: "" }), /- Portal > Study > Theses; Portal > Study > Exams \(together\): Make them sections/);
  assert.equal(updateNodes(sm, [[0, 0], [0, 1]], { type: "section" }).root.children[0].children[1].type, "section");
});

import { countBuilt, foldable, defaultCollapsed, descendants, fileNodes, linkDiff, sitemapFromScreens, addScreenPage, titleFromFile } from "../src/renderer/sitemap.js";

test("titles from file names", () => {
  assert.equal(titleFromFile("room-list.html"), "Room list"); assert.equal(titleFromFile("index.html"), "Index");
});

test("a first map from the screens: the root, the content links as a hierarchy, the rest under the root", () => {
  const screens = ["index.html", "rooms.html", "room-detail.html", "about.html", "lonely.html"];
  const edges = [
    { from: "index.html", to: "rooms.html", nav: false }, { from: "rooms.html", to: "room-detail.html", nav: false }, { from: "room-detail.html", to: "rooms.html", nav: false },
    { from: "index.html", to: "about.html", nav: true }, { from: "rooms.html", to: "about.html", nav: true }, // menu links: not a hierarchy
  ];
  const sm = sitemapFromScreens({ screens, edges });
  assert.equal(sm.root.file, "index.html");
  assert.deepEqual(sm.root.children.map((c) => c.file), ["rooms.html", "about.html", "lonely.html"]);
  assert.deepEqual(sm.root.children[0].children.map((c) => c.file), ["room-detail.html"]);
  assert.equal(countNodes(sm), 5); assert.equal(sm.root.title, "Index");
  assert.equal(sitemapFromScreens({ screens: [] }), null);
  assert.equal(sitemapFromScreens({ screens: ["a.html", "b.html"], edges: [{ from: "b.html", to: "a.html" }] }).root.file, "b.html"); // no index: the screen that links most
});

test("what the screens do that the map does not say", () => {
  const sm = normalizeSitemap({ root: { title: "P", file: "index.html", children: [{ title: "A", type: "group", children: [{ title: "A1", file: "a1.html" }, { title: "A2", file: "a2.html" }] }, { title: "B", file: "b.html" }, { title: "Gone", file: "gone.html" }] } });
  const edges = [{ from: "a1.html", to: "a2.html" }, { from: "index.html", to: "a1.html" }, { from: "a1.html", to: "b.html" }, { from: "b.html", to: "x.html" }];
  const d = linkDiff(sm, edges, ["index.html", "a1.html", "a2.html", "b.html", "x.html"]);
  assert.deepEqual(d.extra, [{ from: "a1.html", to: "b.html" }]); // siblings and ancestors are in the map, a1 -> b is not
  assert.deepEqual(d.unmapped, ["x.html"]); assert.deepEqual(d.missing, ["gone.html"]);
  assert.equal(fileNodes(sm).get("a2.html").join("."), "0.1");
});

test("a screen is added to the map as a page", () => {
  const sm = addScreenPage(sample(), "new-page.html", [0]);
  assert.equal(getNode(sm, [0, 2]).file, "new-page.html"); assert.equal(getNode(sm, [0, 2]).title, "New page");
});

test("progress of the map and folding", () => {
  const sm = sample();
  assert.equal(countBuilt(sm, (f) => f === "theses.html"), 1); assert.equal(countBuilt(sm, () => true), 2); // Theses and Library have files; Moodle is external
  assert.deepEqual(foldable(sm, 1), [sm.root.children[0].id]); assert.deepEqual(foldable(sm, 0)[0], sm.root.id);
  assert.deepEqual(defaultCollapsed(sm), []); // small: open
  const big = normalizeSitemap({ root: { title: "R", children: Array.from({ length: 6 }, (_, i) => ({ title: `G${i}`, children: Array.from({ length: 6 }, (_, j) => ({ title: `P${i}${j}`, children: [{ title: "x" }] })) })) } });
  assert.equal(defaultCollapsed(big).length, 36); // the pages of the second level that have children
  assert.equal(descendants(sm.root.children[0]), 2);
});

test("the revision of the map of the project carries the map itself and says that the user approves it", () => {
  const sm = updateNode(sample(), [1], { comment: "Rename" });
  const msg = reviseMessage({ slug: null, sm, extra: "" });
  assert.match(msg, /sitemap\.json/); assert.match(msg, /```uu5-sitemap/); assert.match(msg, /Library: Rename|Portal > Library: Rename/); assert.match(msg, /only then it replaces/);
  assert.doesNotMatch(msg, /plans\//);
});

import { relocateNode } from "../src/renderer/sitemap.js";
const tree = () => normalizeSitemap({ root: { title: "R", children: [{ title: "A", children: [{ title: "A1" }] }, { title: "B" }, { title: "C", type: "stub" }] } });
const names = (sm) => sm.root.children.map((c) => `${c.title}${c.children.length ? `(${c.children.map((x) => x.title)})` : ""}`).join(",");

test("an old stub becomes a page with the flag notSolved, kept in the map and not counted", () => {
  const sm = tree();
  assert.equal(sm.root.children[2].type, "page");
  assert.equal(sm.root.children[2].notSolved, true);
  assert.equal(countPages(sm), 4); // R, A, A1, B (C is not solved here)
});
import { canFlag, isOutside } from "../src/renderer/sitemap.js";
test("notSolved is a flag of a page, a sheet or a section; an external link is always outside", () => {
  const sm = normalizeSitemap({ kind: "portal", root: { title: "P", children: [{ title: "S", type: "sheet", notSolved: true, file: "s.html" }, { title: "Sec", type: "section", notSolved: true }, { title: "G", type: "group", notSolved: true }, { title: "X", type: "external" }] } });
  const [sh, sec, g, x] = sm.root.children;
  assert.ok(sh.notSolved && sec.notSolved && !("notSolved" in g));
  assert.ok(isOutside(sh) && isOutside(sec) && !isOutside(g) && isOutside(x));
  assert.ok(canFlag("page") && canFlag("sheet") && canFlag("section") && !canFlag("group") && !canFlag("external"));
  assert.equal(countSections(sm), 0); assert.equal(countBuilt(sm, () => true), 0);
  assert.match(sitemapOutline(sm), /S \[sheet\] \[not solved here/);
});
test("updateNode sets and clears the flag; a type that cannot have it drops it; a duplicate keeps it", () => {
  let sm = normalizeSitemap({ root: { title: "R", children: [{ title: "A" }] } });
  sm = updateNode(sm, [0], { notSolved: true }); assert.equal(getNode(sm, [0]).notSolved, true);
  assert.equal(duplicateNode(sm, [0]).sitemap.root.children[1].notSolved, true);
  assert.equal("notSolved" in updateNode(sm, [0], { notSolved: false }).root.children[0], false);
  assert.equal("notSolved" in updateNode(sm, [0], { type: "group" }).root.children[0], false);
  assert.equal("notSolved" in updateNode(updateNode(sm, [0], { type: "group" }), [0], { notSolved: true }).root.children[0], false);
});
test("relocateNode: before, after and inside", () => {
  assert.equal(names(relocateNode(tree(), [1], [0], "before").sitemap), "B,A(A1),C");
  assert.equal(names(relocateNode(tree(), [0], [1], "after").sitemap), "B,A(A1),C");
  assert.equal(names(relocateNode(tree(), [1], [0], "inside").sitemap), "A(A1,B),C");
  assert.deepEqual(relocateNode(tree(), [2], [0], "inside").path, [0, 1]);
  assert.deepEqual(relocateNode(tree(), [0, 0], [2], "before").path, [2]);
});
test("relocateNode: root, itself and its own subtree stay as they are", () => {
  const sm = tree();
  assert.equal(relocateNode(sm, [], [1], "inside").sitemap, sm);
  assert.equal(relocateNode(sm, [0], [0], "after").sitemap, sm);
  assert.equal(relocateNode(sm, [0], [0, 0], "inside").sitemap, sm);
});

import { sitemapSvg } from "../src/renderer/sitemap.js";
test("sitemapSvg draws every page once, escapes titles and leaves the comments out", () => {
  const sm = normalizeSitemap({ root: { title: "Portal <A&B>", children: [{ title: "One", file: "one.html", comment: "secret review" }, { title: "Two", notSolved: true }, { title: "Out", type: "external" }] } });
  const { svg, width, height } = sitemapSvg(sm, { isScreen: (f) => f === "one.html" });
  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>") && width > 0 && height > 0);
  assert.ok(svg.includes("Portal &lt;A&amp;B&gt;"));
  assert.equal((svg.split('<g class="legend">')[0].match(/<rect x=/g) ?? []).length, 8); // 4 nodes: a box and an accent bar each
  assert.ok(svg.includes("✔") && !svg.includes("secret review"));
  assert.equal(sitemapSvg(null).svg, "");
});

test("sitemapSvg keeps the folded branches folded, with the number of pages below", () => {
  const sm = tree();
  const all = sitemapSvg(sm).svg, folded = sitemapSvg(sm, { collapsed: new Set([sm.root.children[0].id]) }).svg;
  assert.ok(all.includes("A1") && !folded.includes(">A1<"));
  assert.ok(folded.includes("▸ 1") && !all.includes("▸ 1"));
  assert.ok(sitemapSvg(sm, { collapsed: new Set([sm.root.children[1].id]) }).svg.includes(">B<")); // a page without children is not folded
});

test("sitemapSvg explains in a legend only the kinds of nodes the map uses", () => {
  const sm = normalizeSitemap({ root: { title: "Portal", children: [{ title: "One", file: "one.html" }, { title: "Out", type: "external" }, { title: "Box", type: "group", children: [{ title: "Deep", file: "deep.html" }] }] } });
  const { svg, height } = sitemapSvg(sm, { isScreen: (f) => f === "one.html" });
  const legend = svg.split('<g class="legend">')[1] ?? "";
  for (const t of ["Page, its screen is built", "Page, no screen yet", "Link out of the site", "Group, only a menu item"]) assert.ok(legend.includes(t), t);
  for (const t of ["Section", "not solved here", "Folded branch"]) assert.ok(!legend.includes(t), t);
  assert.ok(sitemapSvg(sm, { collapsed: new Set([sm.root.children[2].id]) }).svg.includes("Folded branch"));
  const bare = sitemapSvg(sm, { legend: false });
  assert.ok(!bare.svg.includes("legend") && bare.height < height);
});

import { duplicateNode } from "../src/renderer/sitemap.js";
test("duplicateNode copies a leaf right after it, without its file and comments", () => {
  const sm = normalizeSitemap({ title: "Portal", children: [{ title: "Council", children: [{ title: "Documents", type: "section", file: "documents.html", note: "Files", comment: "check" }, { title: "Members" }] }] });
  const r = duplicateNode(sm, [0, 0]), n = getNode(r.sitemap, r.path);
  assert.deepEqual(r.path, [0, 1]);
  assert.deepEqual(n, { id: "documents-copy", title: "Documents (copy)", type: "section", note: "Files", children: [] });
  assert.equal(getNode(r.sitemap, [0, 2]).title, "Members"); assert.equal(countNodes(sm), 4); // the original map is untouched
  assert.equal(getNode(duplicateNode(r.sitemap, [0, 0]).sitemap, [0, 1]).id, "documents-copy-2"); // ids stay unique
  assert.equal(duplicateNode(sm, []).sitemap, sm); assert.equal(duplicateNode(sm, [0]).sitemap, sm); // not the root, not a page with sub-pages
  assert.equal(getNode(duplicateNode(normalizeSitemap({ title: "R", children: [{ title: "x".repeat(80) }] }), [0]).sitemap, [1]).title.length, 80);
});

test("the sitemap is offered where it exists or where a whole web site or portal is designed", async () => {
  const { sitemapOffered, hasScope } = await import("../src/renderer/sitemap.js");
  assert.equal(sitemapOffered({ hasSitemap: true, scope: "single", level: "component" }), true); // what exists is never hidden
  assert.equal(sitemapOffered({ scope: "site", level: "web" }), true);
  assert.equal(sitemapOffered({ scope: "single", level: "web" }), false);
  assert.equal(sitemapOffered({ scope: "single", level: "page" }), false);
  for (const level of ["app", "route", "component", null]) assert.equal(sitemapOffered({ level }), false);
  for (const level of ["web", "page"]) assert.equal(sitemapOffered({ level }), true); // a project from before the scope was stored
  assert.equal(sitemapOffered(), false);
  assert.deepEqual(["app", "route", "component", "web", "page"].filter(hasScope), ["web", "page"]);
});

test("a page keeps the address it was taken from (source), only when it is a link the app can read", async () => {
  const { normalizeSitemap, updateNode, sitemapOutline } = await import("../src/renderer/sitemap.js");
  const sm = normalizeSitemap({ root: { title: "Home", children: [{ title: "A", source: "https://example.com/a#x" }, { title: "B", source: "javascript:alert(1)" }, { title: "C", source: `https://example.com/${"x".repeat(600)}` }] } });
  assert.deepEqual(sm.root.children.map((c) => c.source), ["https://example.com/a", undefined, undefined]);
  assert.match(sitemapOutline(sm), /- A \[source: https:\/\/example\.com\/a\]/);
  const set = updateNode(sm, [1], { source: "https://uuapp.plus4u.net/uu-bookkit-maing01/0238a88bac124b3ca828835b57144ffa/book/page?code=b" });
  assert.match(set.root.children[1].source, /code=b$/);
  assert.equal(updateNode(set, [1], { source: "" }).root.children[1].source, undefined);
});

import { kindOf, setKind, mapSummary, typesFor, typeLabels, countScreens, isScreenType, svgLegend, sitemapOutline } from "../src/renderer/sitemap.js";
test("a map of portals keeps its kind; portals are made of sheets and sheets of sections", () => {
  const sm = normalizeSitemap({ kind: "portal", root: { title: "Doc", type: "portal", children: [{ title: "A", type: "list", file: "a.html", children: [{ title: "S", type: "section" }] }, { title: "B", type: "sheet" }] } });
  assert.equal(kindOf(sm), "portal");
  assert.equal(serializeSitemap(sm).indexOf('"kind"') < serializeSitemap(sm).indexOf('"root"'), true);
  assert.deepEqual([sm.root.type, sm.root.children[0].type], ["page", "sheet"]); // the aliases of the agent
  assert.equal(mapSummary(sm), "1 portal, 2 sheets, 1 section");
  assert.equal(countScreens(sm), 3); assert.equal(countBuilt(sm, () => true), 1); // only the sheet has a file
  assert.ok(isScreenType("sheet") && !isScreenType("section"));
  assert.equal(getNode(addChild(sm, []).sitemap, [2]).type, "sheet");
  assert.equal(getNode(addChild(sm, [0]).sitemap, [0, 1]).type, "section");
  assert.equal(getNode(addSibling(sm, [1]).sitemap, [2]).type, "sheet");
  assert.equal(typeLabels("portal").page, "Portal (document)");
  assert.ok(typesFor(sm).includes("sheet"));
  assert.ok(sitemapOutline(sm).includes("[sheet]") && sitemapOutline(sm).includes("map of portals"));
  assert.ok(reviseMessage({ sm }).includes("map of PORTALS"));
  assert.ok(sitemapSvg(sm, { isScreen: () => true }).svg.includes("Sheet of the portal, its screen is built"));
  assert.ok(sitemapSvg(sm).svg.includes("Portal, no screen yet"));
  assert.equal(svgLegend("web")[0].label, "Page, its screen is built");
});
test("a map of a web site has no kind in its file, no sheets offered, and new nodes are pages", () => {
  const sm = normalizeSitemap({ kind: "nonsense", root: { title: "Home", children: [{ title: "A" }] } });
  assert.equal(sm.kind, undefined); assert.equal(kindOf(sm), "web");
  assert.ok(!typesFor(sm).includes("sheet"));
  assert.equal(getNode(addChild(sm, [0]).sitemap, [0, 0]).type, "page");
  assert.equal(getNode(addChild(sm, [0]).sitemap, [0, 0]).title, "New page");
  assert.equal(mapSummary(sm), "2 pages");
  const p = setKind(sm, "portal"); assert.equal(p.kind, "portal"); assert.equal(setKind(p, "web").kind, undefined);
  assert.equal(normalizeSitemap(p).kind, "portal");
  assert.equal(extractSitemap(replaceSitemapBlock("Plan", p)).sitemap.kind, "portal"); // the block of a plan keeps the kind
});

import { sitemapUu5String } from "../src/renderer/sitemap.js";
const u5parse = (s) => { const m = s.match(/^<Uu5TreeBricks\.Tree itemList="<uu5json\/>(.*)" itemSignificance="distinct"\/>$/s); return JSON.parse(m[1].replace(/\\(["\\])/g, "$1")); };
test("sitemapUu5String makes a Uu5Tree whose JSON survives the escaping, titles included", () => {
  const sm = normalizeSitemap({ root: { title: 'A & <B> "x"', children: [{ title: "Sec", type: "section" }, { title: "Out", type: "external" }, { title: "NS", notSolved: true }] } });
  const s = sitemapUu5String(sm);
  assert.ok(s.startsWith('<Uu5TreeBricks.Tree itemList="<uu5json/>[{') && s.endsWith('/>'));
  const [root] = u5parse(s);
  assert.equal(root.header, '<uu5string />A &amp; &lt;B&gt; "x" <Uu5Bricks.Badge colorScheme="primary">PAGE</Uu5Bricks.Badge>');
  assert.equal(root.expanded, true); assert.equal(root.itemList.length, 3);
  assert.equal(root.itemList[1].significance, "subdued"); assert.ok(root.itemList[2].header.includes("NOT SOLVED"));
  assert.equal(root.itemList[0].itemList, undefined);
  assert.equal(sitemapUu5String(null), "");
});
test("sitemapUu5String keeps folded branches folded and names portal kinds", () => {
  const sm = normalizeSitemap({ kind: "portal", root: { title: "P", children: [{ title: "S", type: "sheet", children: [{ title: "C", type: "section" }] }] } });
  const [root] = u5parse(sitemapUu5String(sm, { collapsed: new Set([sm.root.children[0].id]) }));
  assert.ok(root.header.includes(">PORTAL<")); assert.equal(root.itemList[0].expanded, false); assert.ok(root.itemList[0].header.includes(">SHEET<"));
});

import { searchNodes as _searchNodes } from "../src/renderer/sitemap.js";
test("searchNodes finds pages by title, file, note and comment, ignores case and diacritics, lists the pages to unfold", () => {
  const sm = { root: { id: "r", title: "Home", type: "page", children: [
    { id: "a", title: "Přehled služeb", type: "page", file: "services.html", children: [{ id: "b", title: "Ceník", type: "page", note: "Price list", children: [] }] },
    { id: "c", title: "Contact", type: "page", comment: "add a map", children: [] },
  ] } };
  assert.deepEqual(_searchNodes(sm, "prehled").hits.map((h) => h.id), ["a"]);
  assert.deepEqual(_searchNodes(sm, "PRICE list").hits, [{ path: [0, 0], id: "b" }]);
  assert.deepEqual(_searchNodes(sm, "price").open.sort(), ["a", "r"]);
  assert.deepEqual(_searchNodes(sm, "services.html").hits.map((h) => h.id), ["a"]);
  assert.deepEqual(_searchNodes(sm, "map").hits.map((h) => h.id), ["c"]);
  assert.deepEqual(_searchNodes(sm, "  "), { hits: [], open: [] });
});
