import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSitemap, addRef, detachRef, resolveNode, refsTo, pathOfId, updateNode, removeNode, relocateNode, indentNode, addChild, duplicateNode, getNode, countPages, countSheets, countApproved, countBuilt, linkDiff, searchNodes, sitemapOutline, sitemapSvg, sitemapUu5String, dropScreen, applyLinks } from "../src/renderer/sitemap.js";

// two portals; an external document belongs to portal A and is linked from portal B
const portals = () => normalizeSitemap({ kind: "portal", root: { id: "r", title: "Portals", children: [
  { id: "a", title: "Portal A", children: [{ id: "doc", title: "Rules", type: "sheet", file: "rules.html", approved: true, note: "shared", source: "https://example.com/rules" }, { id: "a2", title: "News", type: "sheet", file: "news.html" }] },
  { id: "b", title: "Portal B", children: [{ id: "b1", title: "Home", type: "sheet", file: "home.html" }, { id: "lnk", ref: "doc", title: "stale name", file: "x.html", note: "x", children: [{ id: "z", title: "Child" }] }] },
] } });

test("a link keeps only its id and ref; its title and type follow the original, its children and own keys are dropped", () => {
  const sm = portals(), l = getNode(sm, [1, 1]);
  assert.deepEqual(l, { id: "lnk", ref: "doc", title: "Rules", type: "sheet", children: [] });
  assert.equal(resolveNode(sm, l).file, "rules.html");
  assert.deepEqual(refsTo(sm, "doc"), [[1, 1]]);
  assert.deepEqual(pathOfId(sm, "doc"), [0, 0]);
});

test("a link to nothing, to a link, to the root or to a node above it stays as a page of its own", () => {
  const sm = normalizeSitemap({ root: { id: "r", title: "R", children: [
    { id: "p", title: "P", children: [{ id: "up", ref: "p", title: "Above" }] },
    { id: "gone", ref: "nope", title: "Gone" }, { id: "root", ref: "r", title: "Root" },
    { id: "l1", ref: "q", title: "L1" }, { id: "q", title: "Q" }, { id: "l2", ref: "l1", title: "L2" },
  ] } });
  const byId = (id) => getNode(sm, pathOfId(sm, id));
  for (const id of ["up", "gone", "root", "l2"]) assert.equal(byId(id).ref, undefined, id);
  assert.equal(byId("l1").ref, "q");
  assert.equal(byId("up").title, "Above");
});

test("a link follows its original when the ids are cleaned or made unique", () => {
  const sm = normalizeSitemap({ root: { id: "r", title: "R", children: [{ id: "Doc 1!", title: "Doc" }, { id: "l", ref: "Doc 1!", title: "?" }] } });
  const l = getNode(sm, [1]);
  assert.equal(getNode(sm, [0]).id, "Doc-1"); assert.equal(l.ref, "Doc-1"); assert.equal(l.title, "Doc");
});

test("a page shown at two places is counted once", () => {
  const sm = portals();
  assert.equal(countSheets(sm), 3); assert.equal(countPages(sm), 3);
  assert.deepEqual(countApproved(sm), { approved: 1, all: 6 });
  assert.equal(countBuilt(sm, () => true), 3);
});

test("a change of a link changes its original, and every link shows it", () => {
  const sm = updateNode(portals(), [1, 1], { title: "House rules", note: "for all" });
  assert.equal(getNode(sm, [0, 0]).title, "House rules"); assert.equal(getNode(sm, [0, 0]).note, "for all");
  assert.equal(getNode(sm, [1, 1]).title, "House rules"); assert.equal(getNode(sm, [1, 1]).note, undefined);
  assert.equal(updateNode(portals(), [0, 0], { type: "page" }).root.children[1].children[1].type, "page");
});

test("addRef shows a page once more: not inside itself, not under a link, not twice under one parent", () => {
  const sm = portals();
  const r = addRef(sm, [0, 1], [1]); // News also under portal B
  assert.deepEqual(r.path, [1, 2]); assert.deepEqual(getNode(r.sitemap, r.path), { id: "a2-link", ref: "a2", title: "News", type: "sheet", children: [] });
  assert.equal(addRef(sm, [0, 1], [0]).sitemap, sm); // its own parent shows it already
  assert.equal(addRef(sm, [0], [0, 1]).sitemap, sm); // inside itself
  assert.equal(addRef(sm, [0, 0], [1, 1]).sitemap, sm); // under a link
  assert.equal(addRef(sm, [0, 0], [1]).sitemap, sm); // portal B shows it already
  assert.equal(addRef(sm, [], [1]).sitemap, sm); // the root
  const viaLink = addRef(sm, [1, 1], [0, 1]); assert.equal(getNode(viaLink.sitemap, viaLink.path).ref, "doc"); // a link to a link links the original
  const at = addRef(sm, [0, 1], [1], 0); assert.deepEqual(at.path, [1, 0]); // at an index (⌥ + drag before / after a page)
});

test("a link has no sub-pages, is not duplicated, and may not be moved inside its own page", () => {
  const sm = portals();
  assert.equal(addChild(sm, [1, 1]).sitemap, sm);
  assert.equal(duplicateNode(sm, [1, 1]).sitemap, sm);
  assert.equal(relocateNode(sm, [0, 1], [1, 1], "inside").sitemap, sm);
  assert.equal(indentNode(sm, [1, 2]).sitemap, sm); // nothing after the link: no change either way
  const inside = addRef(sm, [0, 1], [1]).sitemap; // News under B; now move the link into News itself? (it is a sibling of B's link) -> not allowed under its original
  assert.equal(relocateNode(inside, [1, 2], [0, 1], "inside").sitemap, inside);
  assert.notEqual(relocateNode(sm, [1, 1], [1, 0], "before").sitemap, sm); // a link moves like a page
});

test("deleting a page takes the links to it along; deleting a link leaves the page", () => {
  const sm = portals();
  const gone = removeNode(sm, [0, 0]).sitemap;
  assert.deepEqual(refsTo(gone, "doc"), []); assert.equal(getNode(gone, [1]).children.length, 1);
  const branch = removeNode(sm, [0]).sitemap; assert.deepEqual(branch.root.children.map((c) => c.children.length), [1]);
  const link = removeNode(sm, [1, 1]); assert.equal(getNode(link.sitemap, [0, 0]).title, "Rules"); assert.deepEqual(link.path, [1, 0]);
  assert.deepEqual(refsTo(dropScreen(sm, "rules.html").sitemap, "doc"), []);
});

test("a link can become a page of its own: a copy without the screen", () => {
  const { sitemap } = detachRef(portals(), [1, 1]), n = getNode(sitemap, [1, 1]);
  assert.equal(n.ref, undefined); assert.equal(n.title, "Rules"); assert.equal(n.note, "shared"); assert.equal(n.source, "https://example.com/rules"); assert.equal(n.file, undefined);
  assert.equal(n.approved, undefined); assert.equal(countSheets(sitemap), 4);
});

test("the agent reads a link as the same page shown at one more place; search finds the original once", () => {
  const out = sitemapOutline(portals());
  assert.match(out, /- Rules \[link: the same page as Portals > Portal A > Rules, shown here too\]/);
  assert.equal(out.match(/rules\.html/g).length, 1);
  assert.deepEqual(searchNodes(portals(), "rules").hits.map((h) => h.id), ["doc"]);
});

test("the real links of a screen count from any place where its page is shown", () => {
  const sm = portals(); // home (B) -> rules: covered, rules is a sibling of home through its link in B
  assert.deepEqual(linkDiff(sm, [{ from: "home.html", to: "rules.html" }], ["home.html", "rules.html"]).extra, []);
  assert.deepEqual(linkDiff(sm, [{ from: "home.html", to: "news.html" }], []).extra, [{ from: "home.html", to: "news.html" }]);
});

test("the picture and the uu5string mark a link", () => {
  const { svg } = sitemapSvg(portals());
  assert.match(svg, /↪/); assert.match(svg, /stroke-dasharray="5 3"/); assert.match(svg, /The same sheet or document as elsewhere in the map/);
  const u5 = sitemapUu5String(portals());
  assert.match(u5, /ALSO ELSEWHERE/); assert.equal(u5.match(/Rules/g).length, 2);
});

test("the agent turns copies of a page into links to its primary place, and is told what it could not change", () => {
  const sm = normalizeSitemap({ kind: "portal", root: { id: "r", title: "R", children: [
    { id: "vp", title: "Vnitřní předpisy", children: [{ id: "s1", title: "Směrnice BOZP", type: "sheet", children: [{ id: "s1a", title: "Rozsah", type: "section" }] }] },
    { id: "hr", title: "HR", children: [{ id: "c1", title: "BOZP (kopie)", type: "sheet", note: "x", children: [{ id: "c1a", title: "Rozsah", type: "section" }] }, { id: "c2", title: "BOZP", type: "sheet", approved: true }] },
    { id: "it", title: "IT", children: [] },
  ] } });
  const r = applyLinks(sm, { replace: [{ node: "c1", original: "s1" }, { node: "c2", original: "s1" }, { node: "nope", original: "s1" }], add: [{ original: "s1", under: "it" }, { original: "s1", under: "s1a" }] });
  assert.deepEqual(r.done, ["R > Vnitřní předpisy > Směrnice BOZP -> also shown under R > IT"]);
  assert.match(r.skipped.join("\n"), /BOZP \(kopie\): it has 1 sub-page\(s\): pass dropSubPages/);
  assert.match(r.skipped.join("\n"), /approved by the user/); assert.match(r.skipped.join("\n"), /no node with the id "nope"/); assert.match(r.skipped.join("\n"), /Rozsah: not possible/);
  const d = applyLinks(sm, { replace: [{ node: "c1", original: "s1a", dropSubPages: true }, { node: "c1", original: "s1" }] });
  assert.equal(d.done.length, 2); // a link may be pointed elsewhere
  assert.deepEqual(getNode(d.sitemap, [1, 0]), { id: "c1", ref: "s1", title: "Směrnice BOZP", type: "sheet", children: [] });
  assert.equal(applyLinks(sm, {}).done.length, 0);
});

test("the outline for the tools names every node by its id", () => {
  const out = sitemapOutline(portals(), { ids: true });
  assert.match(out, /- Rules \{id: doc\} \[sheet\]/); assert.match(out, /- Rules \{id: lnk\} \[link: the same page as Portals > Portal A > Rules \{id: doc\}/);
  assert.doesNotMatch(sitemapOutline(portals()), /\{id:/);
});

test("a page that is only at a secondary place moves to its primary place and leaves a link behind", () => {
  const sm = normalizeSitemap({ kind: "portal", root: { id: "r", title: "R", children: [
    { id: "st", title: "Studium", children: [{ id: "a", title: "Aktuality", type: "sheet" }, { id: "d", title: "Studijní řád", type: "external", source: "https://x.cz/sr" }, { id: "z", title: "Zápis", type: "sheet" }] },
    { id: "vp", title: "Vnitřní předpisy", children: [] },
  ] } });
  const r = applyLinks(sm, { primary: [{ node: "d", under: "vp" }, { node: "d-link", under: "vp" }, { node: "st", under: "a" }], add: [{ original: "d", under: "r" }] });
  assert.deepEqual(r.done, ["R > Studium > Studijní řád -> moved to R > Vnitřní předpisy > Studijní řád, a link to it stays at its old place", "R > Vnitřní předpisy > Studijní řád -> also shown under R"]);
  assert.match(r.skipped.join("\n"), /it is a link: move its original instead/); assert.match(r.skipped.join("\n"), /Studium into R > Studium > Aktuality: it cannot go inside itself/);
  assert.deepEqual(getNode(r.sitemap, [0, 1]), { id: "d-link", ref: "d", title: "Studijní řád", type: "external", children: [] }); // in its old place, between its siblings
  assert.equal(getNode(r.sitemap, [1, 0]).source, "https://x.cz/sr");
  const again = applyLinks(r.sitemap, { primary: [{ node: "d", under: "vp" }] }); assert.match(again.skipped[0], /it is there already/);
});

test("links do not count to the 200 pages of a map: a full map keeps every page when links are added", () => {
  const kids = Array.from({ length: 199 }, (_, i) => ({ id: `p${i}`, title: `P${i}` }));
  const sm = normalizeSitemap({ root: { id: "r", title: "R", children: [...kids, { id: "l1", ref: "p0", title: "x" }, { id: "l2", ref: "p1", title: "x" }] } });
  assert.equal(countPages(sm), 200); assert.equal(sm.root.children.length, 201);
  const r = applyLinks(sm, { primary: [{ node: "p5", under: "p6" }], add: [{ original: "p7", under: "p8" }] });
  assert.equal(r.done.length, 2);
  const again = normalizeSitemap(JSON.parse(JSON.stringify(r.sitemap)));
  assert.equal(countPages(again), 200); assert.ok(pathOfId(again, "p198")); // the last page is still there
  assert.equal(addChild(sm, [0]).sitemap, sm); // but no 201st page
});
