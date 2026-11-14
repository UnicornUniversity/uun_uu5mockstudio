import test from "node:test";
import assert from "node:assert/strict";
import { makeProject } from "./helpers.mjs";
import { linkProject, parseArtifactUrl, readLink, screenKey } from "../src/main/mkArtifact.mjs";
import { listPages, publish, publishTargets, readStore, sitemapKey, T, pageUrl } from "../src/main/mkEcc.mjs";

const URL_ = "https://uuapp.plus4u.net/uu-managementkit-maing02/38744216cb324edca986789798259ba9/document?oid=66c81cfafbc8750023876be3";

/** Fake MCP tools of uuManagementKit: pages with sections, the calls recorded. */
const OTHER = "https://uuapp.plus4u.net/uu-managementkit-maing02/99999999999999999999999999999999/keyTask?oid=67fd06ebee40441857666f4e";

function fakeTools({ login = false } = {}) {
  const pages = new Map([["p1", { name: "Main", sections: ["s0"] }], ["p2", { name: "Test", sections: [] }]]);
  const calls = []; let n = 0;
  const tool = async (name, args) => {
    calls.push([name, args]);
    if (login) return { error: "login" };
    if (args.documentUrl === OTHER) { assert.equal(args.targetAwid, "99999999999999999999999999999999"); if (name === T.meta) return { data: { documentName: "Other", mainPageOid: "q1", pageList: [{ pageOid: "q1", name: "Main" }] } }; }
    else { assert.equal(args.documentUrl, URL_); assert.equal(args.targetAwid, "38744216cb324edca986789798259ba9"); }
    if (args.documentUrl === OTHER && name === T.sections && !pages.has(args.pageOid)) pages.set(args.pageOid, { name: "Main", sections: [] });
    if (name === T.meta) return { data: { documentName: "Doc", mainPageOid: "p1", pageList: [...pages].map(([pageOid, p]) => ({ pageOid, name: p.name, hidden: false })) } };
    if (name === T.sections) { const p = pages.get(args.pageOid); return { data: { pageName: p.name, sectionList: p.sections.map((sectionOid, index) => ({ sectionOid, index })) } }; }
    if (name === T.createPage) { const pageOid = `p${++n + 10}`; pages.set(pageOid, { name: args.name, sections: [`empty${n}`] }); return { data: { createdPage: { pageOid, name: args.name } } }; }
    if (name === T.section) return { data: { sectionOid: args.sectionOid, content: args.sectionOid.startsWith("empty") ? "" : "<uu5string/>x" } };
    if (name === T.createSection && !pages.has(args.pageOid)) pages.set(args.pageOid, { name: "Main", sections: [] });
    if (name === T.createSection) {
      assert.ok(args.content.startsWith("<uu5string/>")); assert.match(args.searchKey, /^[0-9a-zA-Z_-]{3,256}$/);
      const sectionOid = `s${++n}`; pages.get(args.pageOid).sections.push(sectionOid); return { data: { createdSection: { sectionOid } } };
    }
    if (name === T.setContent) { if (args.content.includes("BROKEN")) return { error: "uu5String is not valid" }; return { data: { sectionOid: args.sectionOid } }; }
    return { error: `unknown ${name}` };
  };
  return { tool, calls, pages };
}

async function linked() {
  const dir = await makeProject();
  await linkProject(dir, parseArtifactUrl(URL_), { name: "Doc" });
  return dir;
}

test("listPages gives the pages of the linked or of another document", async () => {
  const dir = await linked(); const f = fakeTools();
  const r = await listPages(dir, f.tool);
  assert.equal(r.documentName, "Doc"); assert.equal(r.mainPageOid, "p1"); assert.equal(r.documentUrl, URL_);
  assert.deepEqual(r.pages.map((p) => p.name), ["Main", "Test"]);
  const o = await listPages(dir, f.tool, OTHER.replace("keyTask?", "keyTask/permissionSettings?"));
  assert.equal(o.documentName, "Other"); assert.equal(o.documentUrl, OTHER);
  await assert.rejects(listPages(dir, f.tool, "nonsense"), /not the address/);
});

test("a screen is created as a section once, then overwritten after a dry run", async () => {
  const dir = await linked(); const f = fakeTools();
  const r1 = await publish(dir, f.tool, { screen: "a.html", content: "<Uu5Elements.Text>A</Uu5Elements.Text>", pageOid: "p2" });
  assert.equal(r1.created, "section");
  assert.deepEqual(f.pages.get("p2").sections, [r1.sectionOid]);
  const link = await readLink(dir), store = await readStore(dir);
  assert.deepEqual({ ...store.targets[screenKey(link.projectId, "a.html")], publishedAt: 0 }, { documentUrl: URL_, documentName: "Doc", pageOid: "p2", pageName: null, sectionOid: r1.sectionOid, what: "a.html", publishedAt: 0 });
  assert.equal(f.calls.find(([n]) => n === T.createSection)[1].content, "<uu5string/><Uu5Elements.Text>A</Uu5Elements.Text>", "the prefix is added");

  f.calls.length = 0;
  const r2 = await publish(dir, f.tool, { screen: "a.html", content: "<uu5string/>B", pageOid: "p2" });
  assert.equal(r2.created, false); assert.equal(r2.sectionOid, r1.sectionOid);
  assert.deepEqual(f.calls.map(([n, a]) => [n, a.validateOnly ?? null]), [[T.sections, null], [T.setContent, true], [T.setContent, null]]);
  assert.deepEqual(f.pages.get("p2").sections, [r1.sectionOid], "no second section");
});

test("an invalid uu5string stops at the dry run; a gone section is created anew", async () => {
  const dir = await linked(); const f = fakeTools();
  const r1 = await publish(dir, f.tool, { screen: "a.html", content: "<uu5string/>A", pageOid: "p2" });
  await assert.rejects(publish(dir, f.tool, { screen: "a.html", content: "<uu5string/>BROKEN", pageOid: "p2" }), /not valid/);
  assert.equal(f.calls.filter(([n, a]) => n === T.setContent && !a.validateOnly).length, 0, "nothing was written");
  f.pages.get("p2").sections = []; // someone trashed the section
  const r2 = await publish(dir, f.tool, { screen: "a.html", content: "<uu5string/>C", pageOid: "p2" });
  assert.equal(r2.created, "section"); assert.notEqual(r2.sectionOid, r1.sectionOid);
});

test("the sitemap goes onto a new page under its own key", async () => {
  const dir = await linked(); const f = fakeTools();
  const r = await publish(dir, f.tool, { sitemap: true, content: "<uu5string/><Uu5TreeBricks.Tree/>", newPageName: " Sitemap " });
  assert.equal(r.created, "page"); assert.equal(r.pageName, "Sitemap");
  assert.deepEqual(f.pages.get(r.pageOid).sections, [r.sectionOid], "the empty section of the new page is used, not a second one");
  assert.match(r.sectionOid, /^empty/);
  assert.ok(!f.calls.some(([n]) => n === T.createSection));
  assert.equal(f.calls.find(([n]) => n === T.createPage)[1].name, "Sitemap");
  const link = await readLink(dir);
  assert.equal((await readStore(dir)).targets[sitemapKey(link.projectId)].pageOid, r.pageOid);
  assert.equal(pageUrl(URL_, r.pageOid), `${URL_}&pageOid=${r.pageOid}`);
});

test("another document: remembered with its page, offered again, quick publish goes there", async () => {
  const dir = await linked(); const f = fakeTools();
  const r = await publish(dir, f.tool, { screen: "a.html", content: "<uu5string/>A", documentUrl: OTHER, documentName: "Other", pageOid: "q1" });
  assert.equal(r.documentUrl, OTHER); assert.equal(r.created, "section");
  const t = await publishTargets(dir, { screen: "a.html" });
  assert.equal(t.linked.url, URL_);
  assert.deepEqual(t.recent, [{ url: OTHER, name: "Other" }]);
  assert.equal(t.target.documentUrl, OTHER); assert.equal(t.target.pageOid, "q1");
  f.calls.length = 0;
  const q = await publish(dir, f.tool, { screen: "a.html", content: "<uu5string/>B", quick: true });
  assert.equal(q.created, false, "quick publish overwrites the same section"); assert.equal(q.documentUrl, OTHER);
  assert.ok(f.calls.every(([, a]) => a.documentUrl === OTHER));
  // back to the linked document: a new section there, the target moves
  const back = await publish(dir, f.tool, { screen: "a.html", content: "<uu5string/>C", pageOid: "p2" });
  assert.equal(back.documentUrl, URL_); assert.equal(back.created, "section");
  assert.equal((await publishTargets(dir, { screen: "a.html" })).target.documentUrl, URL_);
  await assert.rejects(publish(dir, f.tool, { screen: "b.html", content: "<uu5string/>x", quick: true }), /not published yet/);
});

test("an unlinked project can publish to a document by its address", async () => {
  const bare = await makeProject(); const f = fakeTools();
  await assert.rejects(publish(bare, f.tool, { screen: "a.html", content: "x", pageOid: "p1" }), /Choose a document/);
  const r = await publish(bare, f.tool, { screen: "a.html", content: "<uu5string/>x", documentUrl: OTHER, pageOid: "q1" });
  assert.ok(r.ok);
  const t = await publishTargets(bare, { screen: "a.html" });
  assert.equal(t.linked, null); assert.equal(t.target.documentUrl, OTHER);
});

test("errors: nothing to publish, sign-in needed", async () => {
  const dir = await linked();
  await assert.rejects(publish(dir, fakeTools().tool, { screen: "a.html", content: "  ", pageOid: "p1" }), /nothing to publish/);
  await assert.rejects(listPages(dir, fakeTools({ login: true }).tool), (e) => e.code === "login");
});
