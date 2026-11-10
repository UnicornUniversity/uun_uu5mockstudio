import test from "node:test";
import assert from "node:assert/strict";
import { parseLink } from "../src/renderer/docLinks.js";
import { bookToTree, eccToTree, webToTree, uu5Links, sitemapLocs, titleOfUrl, linkKey, mergeChildren, defaultChecked, pickToSitemap, pickOutline, structureContext, findNode, idsBelow, countTree } from "../src/renderer/siteStructure.js";
import { listSitemapUrls } from "../src/main/webImages.mjs";

const BOOK = parseLink("https://uuapp.plus4u.net/uu-bookkit-maing01/0238a88bac124b3ca828835b57144ffa/book/page?code=rooms");
const ECC = parseLink("https://uuapp.plus4u.net/uu-managementkit-maing02/38744216cb324edca986789798259ba9/document?oid=660d8eb6e75ca600355fe18d");
const WEB = parseLink("https://www.example.com/");
const titles = (n) => [n.title, ...n.children.map(titles)];
const page = (code) => `https://uuapp.plus4u.net/uu-bookkit-maing01/0238a88bac124b3ca828835b57144ffa/book/page?code=${code}`;

test("bookToTree reads a menu given as an item map with indents, with parents, as a list or as nested lists", () => {
  const want = ["Book", ["A", ["A1"], ["A2"]], ["B"]];
  assert.deepEqual(titles(bookToTree({ itemMap: { a: { label: "A", indent: 0 }, a1: { label: { en: "A1" }, indent: 1 }, a2: { label: "A2", indent: 1 }, b: { label: "B", indent: 0 } } }, BOOK)), want);
  assert.deepEqual(titles(bookToTree({ itemMap: { a1: { label: "A1", parent: "a" }, a: { label: "A" }, a2: { label: "A2", parent: "a" }, b: { label: "B" } } }, BOOK)), ["Book", ["A", ["A1"], ["A2"]], ["B"]]);
  assert.deepEqual(titles(bookToTree({ menu: [{ page: "a", label: "A", indent: 0 }, { page: "a1", label: "A1", indent: 1 }, { page: "a2", label: "A2", indent: 1 }, { page: "b", label: "B", indent: 0 }] }, BOOK)), want);
  assert.deepEqual(titles(bookToTree([{ code: "a", name: "A", children: [{ code: "a1", name: "A1" }, { code: "a2", name: "A2" }] }, { code: "b", name: "B" }], BOOK)), want);
  // as uuBookKit answers: the order is the chain of `next`, not the order of the keys (numeric keys come first in a JSON object); hidden items are not in the menu
  const real = { itemMap: { 20: { previous: "a", next: "b", label: { en: "A1" }, indent: 1, visible: true }, 10: { previous: "20", next: null, label: { en: "B" }, indent: 0, visible: true }, a: { previous: null, next: "20", label: { en: "A" }, indent: 0, visible: true }, b: { previous: "20", next: "10", label: { en: "Hidden" }, indent: 1, visible: false } } };
  real.itemMap.b.next = "10"; real.itemMap[10].previous = "b";
  assert.deepEqual(titles(bookToTree(real, BOOK)), ["Book", ["A", ["A1"]], ["B"]]);
  const t = bookToTree({ itemList: [{ code: "home", name: "Home" }, { code: "x", name: "X" }, { code: "x", name: "X again" }] }, BOOK, { title: "My book" });
  assert.deepEqual(titles(t), ["My book", ["X"]]); // the home page is the root, a page listed twice is there once
  assert.equal(t.url, page("home"));
  assert.equal(t.children[0].url, page("x"));
  assert.equal(t.children[0].expandable, undefined);
  assert.equal(bookToTree({ uuAppErrorMap: {} }, BOOK), null);
  assert.equal(new Set(idsBelow(t)).size, countTree(t));
});

test("uu5Links finds the links of a uu5String, marks those of navigation and reads nested and JSON data", () => {
  const menu = '<uu5string/><UuContentKit.Bricks.Menu><Uu5Bricks.Ul><Uu5Bricks.Li><Uu5Bricks.Link href="https://a.test/one">One</Uu5Bricks.Link><Uu5Bricks.Ul><Uu5Bricks.Li><Uu5Bricks.Link href="/two" label="Two"/></Uu5Bricks.Li></Uu5Bricks.Ul></Uu5Bricks.Li></Uu5Bricks.Ul></UuContentKit.Bricks.Menu><Uu5Bricks.P>See <Uu5Bricks.Link href="#top">top</Uu5Bricks.Link>, <Uu5Bricks.Link href="mailto:x@y.z">mail</Uu5Bricks.Link> and <Uu5Bricks.Link href="https://b.test/three?x=1"><b>Three</b> &amp; more</Uu5Bricks.Link>.</Uu5Bricks.P>';
  assert.deepEqual(uu5Links(menu, "https://a.test/doc").map((l) => [l.title, l.url, l.nav, l.level]), [["One", "https://a.test/one", true, 0], ["Two", "https://a.test/two", true, 1], ["Three & more", "https://b.test/three?x=1", false, 0]]);
  const tiles = `<uu5string/><UuApp.Tiles itemList='<uu5json/>[{"label":{"en":"Offers","cs":"Nabídky"},"href":"https://a.test/offers","itemList":[{"label":"Detail","href":"https://a.test/offers/1"}]}]'/>`;
  assert.deepEqual(uu5Links(tiles, "https://a.test/").filter((l, i, a) => a.findIndex((x) => x.url === l.url) === i).map((l) => [l.title, l.nav, l.level]), [["Offers", true, 0], ["Detail", true, 1]]);
  const rich = '<UU5.RichText.Block uu5string="<uu5string/><Uu5Bricks.Link href=\\"https://a.test/in\\">Inside</Uu5Bricks.Link>"/>';
  assert.deepEqual(uu5Links(rich, "https://a.test/").map((l) => l.title), ["Inside"]);
  const lsi = '<Uu5Bricks.Lsi><Uu5Bricks.Lsi.Item language="cs"><Uu5Bricks.Link href="https://a.test/x">Česky</Uu5Bricks.Link></Uu5Bricks.Lsi.Item><Uu5Bricks.Lsi.Item language="en"><Uu5Bricks.Link href="https://a.test/x">English</Uu5Bricks.Link></Uu5Bricks.Lsi.Item></Uu5Bricks.Lsi>';
  assert.deepEqual(uu5Links(lsi, "https://a.test/").map((l) => l.title), ["English"]);
});

test("eccToTree: the pages of the document, then the navigation (nested), then the links of the content", () => {
  const other = "https://uuapp.plus4u.net/uu-managementkit-maing02/38744216cb324edca986789798259ba9/document?oid=aaaaaaaaaaaaaaaaaaaaaaaa";
  const meta = { name: "Portal", mainPageOid: "660d8eb8e75ca600355fe19d", pageList: [{ pageOid: "660d8eb8e75ca600355fe19d", name: "Home", hidden: false }, { pageOid: "660d8eb8e75ca600355fe1aa", name: "Offers", hidden: false }, { pageOid: "660d8eb8e75ca600355fe1bb", name: "Draft", hidden: true }] };
  const sections = [
    `<uu5string/><UuContentKit.Bricks.Menu><Uu5Bricks.Link href="${other}">Students</Uu5Bricks.Link><Uu5Bricks.Link href="${page("rooms")}">Handbook</Uu5Bricks.Link></UuContentKit.Bricks.Menu>`,
    `<uu5string/><Uu5Bricks.P>A long paragraph of the content with a single link to <Uu5Bricks.Link href="https://unicorn.com/">Unicorn</Uu5Bricks.Link> and to <Uu5Bricks.Link href="${other}">the students again</Uu5Bricks.Link>.</Uu5Bricks.P>`,
  ];
  const t = eccToTree({ meta, sections }, ECC);
  assert.equal(t.title, "Portal");
  assert.deepEqual(t.children.map((c) => [c.title, c.group, c.kind, Boolean(c.expandable)]), [["Offers", "pages", "mkEcc", true], ["Students", "nav", "mkEcc", true], ["Handbook", "nav", "bookkit", false], ["Unicorn", "content", "web", true]]);
  // a section that is nothing but links is navigation, whatever its component is called
  const list = eccToTree({ sections: ['<uu5string/><Uu5Bricks.Div><Uu5Bricks.Link href="https://a.test/1">One</Uu5Bricks.Link> <Uu5Bricks.Link href="https://a.test/2">Two</Uu5Bricks.Link> <Uu5Bricks.Link href="https://a.test/3">Three</Uu5Bricks.Link></Uu5Bricks.Div>'], title: "Links" }, ECC);
  assert.deepEqual(list.children.map((c) => c.group), ["nav", "nav", "nav"]);
  assert.deepEqual(titles(eccToTree({}, ECC)), ["Document"]);
});

test("webToTree keeps the pages of the same host: the menu nested, then content, footer and what only the sitemap.xml knows", () => {
  const links = [
    { href: "https://www.example.com/", text: "Home", area: "header", depth: 0 },
    { href: "https://example.com/products", text: "Products", area: "nav", depth: 1 },
    { href: "https://example.com/products/phones/", text: "Phones", area: "nav", depth: 2 },
    { href: "https://example.com/about#team", text: "About", area: "nav", depth: 1 },
    { href: "https://example.com/blog/hello", text: "", area: "content", depth: 0 },
    { href: "https://example.com/about", text: "About us", area: "footer", depth: 1 },
    { href: "https://example.com/terms", text: "Terms", area: "footer", depth: 1 },
    { href: "https://shop.example.com/", text: "Shop", area: "nav", depth: 1 },
    { href: "https://example.com/price-list.pdf", text: "Prices", area: "content", depth: 0 },
    { href: "mailto:info@example.com", text: "Mail", area: "footer", depth: 0 },
  ];
  const t = webToTree({ title: "Example", links, sitemapUrls: ["https://example.com/products/phones/x1", "https://example.com/careers", "https://example.com/about", "https://elsewhere.test/x", "https://example.com/en/history", "https://example.com/en/mission"] }, WEB);
  assert.deepEqual(titles(t), ["Example", ["Products", ["Phones", ["X1"]]], ["About"], ["Hello"], ["Terms"], ["Careers"], ["En", ["History"], ["Mission"]]]);
  assert.deepEqual(t.children.map((c) => c.group), ["nav", "nav", "content", "footer", "sitemap", "sitemap"]);
  assert.equal(t.children[5].expandable, undefined); // a folder of the paths, not a page the sitemap.xml names
  assert.equal(t.children[0].children[0].children[0].group, "sitemap");
  // a heading of the menu that leads to a page shown already keeps its items together, without an address of its own
  const dup = webToTree({ title: "Example", links: [{ href: "https://example.com/study", text: "Study", area: "nav", depth: 0 }, { href: "https://example.com/study", text: "Bachelor", area: "nav", depth: 1 }, { href: "https://example.com/ai", text: "AI", area: "nav", depth: 2 }, { href: "https://example.com/study", text: "Again", area: "nav", depth: 1 }] }, WEB);
  assert.deepEqual(titles(dup), ["Example", ["Study", ["Bachelor", ["AI"]]]]);
  assert.equal(dup.children[0].children[0].url, undefined);
  assert.equal(pickToSitemap(dup, idsBelow(dup)).root.children[0].children[0].source, undefined);
  // an item of the menu without an address: one page with the item of the same name below it, else a group; alone it is dropped
  const head = webToTree({ title: "Example", links: [{ href: "", text: "Study", area: "nav", depth: 0 }, { href: "https://example.com/study", text: "study", area: "nav", depth: 1 }, { href: "https://example.com/ai", text: "AI", area: "nav", depth: 2 }, { href: "https://example.com/dd", text: "Double", area: "nav", depth: 1 }, { href: "", text: "Courses", area: "nav", depth: 0 }, { href: "https://example.com/c1", text: "C1", area: "nav", depth: 1 }, { href: "", text: "Empty", area: "nav", depth: 0 }, { href: "", text: "Not a menu", area: "content", depth: 0 }] }, WEB);
  assert.deepEqual(titles(head), ["Example", ["Study", ["AI"], ["Double"]], ["Courses", ["C1"]]]);
  assert.deepEqual([head.children[0].url, head.children[1].url], ["https://example.com/study", undefined]);
  // a level skipped on the way down (2 after 0) does not make the next item of level 2 a child of the first one
  const skip = webToTree({ links: [{ href: "https://example.com/a", text: "A", area: "nav", depth: 0 }, { href: "https://example.com/b", text: "B", area: "nav", depth: 2 }, { href: "https://example.com/b1", text: "B1", area: "nav", depth: 3 }, { href: "https://example.com/c", text: "C", area: "nav", depth: 2 }] }, WEB);
  assert.deepEqual(titles(skip), ["example.com", ["A", ["B", ["B1"]], ["C"]]]);
  assert.equal(titleOfUrl("https://example.com/about-us/our_team.html"), "Our team");
  assert.equal(linkKey("https://www.example.com/a/#x"), linkKey("https://example.com/a"));
  assert.deepEqual(titles(webToTree({}, WEB)), ["example.com"]);
});

test("sitemapLocs reads a sitemap.xml; listSitemapUrls follows an index one level and gives up quietly", async () => {
  assert.deepEqual(sitemapLocs("<urlset><url><loc> https://a.test/x?a=1&amp;b=2 </loc></url><url><loc><![CDATA[https://a.test/y]]></loc></url></urlset>"), { index: false, urls: ["https://a.test/x?a=1&b=2", "https://a.test/y"] });
  const files = { "https://a.test/sitemap.xml": "<sitemapindex><sitemap><loc>https://a.test/s1.xml</loc></sitemap><sitemap><loc>https://a.test/s2.xml</loc></sitemap></sitemapindex>", "https://a.test/s1.xml": "<urlset><url><loc>https://a.test/1</loc></url></urlset>" };
  const fetchImpl = async (url) => (files[url] ? new Response(files[url], { status: 200 }) : new Response("", { status: 404 }));
  const check = async (u) => new URL(u);
  assert.deepEqual(await listSitemapUrls("https://a.test/some/page", { fetchImpl, check }), ["https://a.test/1"]);
  assert.deepEqual(await listSitemapUrls("https://b.test/", { fetchImpl, check }), []);
});

test("mergeChildren puts the pages of an unfolded node below it and leaves out what the tree already shows", () => {
  const t = webToTree({ title: "Example", links: [{ href: "https://example.com/a", text: "A", area: "nav" }, { href: "https://example.com/b", text: "B", area: "nav" }] }, WEB);
  const a = t.children[0];
  const sub = webToTree({ title: "A", links: [{ href: "https://example.com/b", text: "B", area: "nav" }, { href: "https://example.com/", text: "Home", area: "nav" }, { href: "https://example.com/a/1", text: "A1", area: "content" }] }, parseLink(a.url));
  const { tree, added } = mergeChildren(t, a.id, sub);
  assert.deepEqual(titles(tree), ["Example", ["A", ["A1"]], ["B"]]);
  assert.equal(findNode(tree, a.id).expandable, undefined);
  assert.equal(findNode(tree, a.id).loaded, true);
  assert.equal(added.length, 1);
  assert.equal(new Set(idsBelow(tree)).size, countTree(tree));
  assert.equal(t.children[0].children.length, 0); // the tree given is not changed
  assert.deepEqual(mergeChildren(t, "nope", sub).added, []);
});

test("the picked pages become a sitemap with their sources, or an outline for the agent", () => {
  const t = bookToTree({ itemMap: { a: { label: "A", indent: 0 }, a1: { label: "A1", indent: 1 }, a2: { label: "A2", indent: 1 }, b: { label: "B", indent: 0 } } }, BOOK, { title: "Book" });
  const id = (title) => idsBelow(t).find((i) => findNode(t, i).title === title);
  assert.deepEqual(defaultChecked(t), idsBelow(t));
  assert.deepEqual(defaultChecked(t, { limit: 4 }), [t.id, ...t.children.map((c) => c.id)]); // too large for a sitemap: the first level only
  const sm = pickToSitemap(t, [id("A1"), id("B")]);
  assert.deepEqual(sm.root.children.map((c) => [c.title, c.type, c.source]), [["A", "group", undefined], ["B", "page", page("b")]]);
  assert.deepEqual(sm.root.children[0].children.map((c) => [c.title, c.type, c.source]), [["A1", "page", page("a1")]]);
  assert.equal(sm.root.source, undefined); // the book itself was not ticked
  assert.equal(pickToSitemap(t, [t.id], { title: "My portal" }).root.title, "My portal");
  assert.equal(pickToSitemap(t, []), null);
  const out = pickOutline(t, [id("A1"), id("B")]);
  assert.match(out, /^- Book \(not picked[^)]*\) — /);
  assert.match(out, /\n {4}- A1 — https:\/\/\S+code=a1\n/);
  assert.doesNotMatch(out, /A2/);
  assert.match(structureContext({ url: BOOK.url, title: "Book", outline: out, count: 2 }), /2 pages picked[\s\S]*`source`[\s\S]*- A1/);
  const ext = structureContext({ url: BOOK.url, title: "Book", outline: out, count: 2, existing: true });
  assert.match(ext, /ALREADY HAS a sitemap[\s\S]*do not replace it[\s\S]*WHOLE revised map[\s\S]*- A1/);
  assert.doesNotMatch(ext, /Start the sitemap from it/);
  // a web page a portal links to leads out of it; what the content links to waits for the user
  const portal = eccToTree({ sections: ['<uu5string/><Uu5Bricks.P>Some longer text of the page, and then a link to <Uu5Bricks.Link href="https://unicorn.com/">Unicorn</Uu5Bricks.Link> in it.</Uu5Bricks.P>'], title: "Portal" }, ECC);
  assert.deepEqual(defaultChecked(portal), [portal.id]);
  assert.equal(pickToSitemap(portal, idsBelow(portal)).root.children[0].type, "external");
});
