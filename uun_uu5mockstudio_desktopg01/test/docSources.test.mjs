import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseDocUrl, parseLink, webSnapshot, findDocUrls, loadArgs, snapshotName, serverUrl, readTerritory, writeTerritory, presetsFor, toSnapshot, uu5Text, extractSections, agentTools, BUILTIN_PRESETS } from "../src/main/docSources.mjs";

const BOOK = "https://uuapp.plus4u.net/uu-bookkit-maing01/0238a88bac124b3ca828835b57144ffa/book/page?code=39741830";
const ECC = "https://uuapp.plus4u.net/uu-managementkit-maing02/091b197154354ec2975b249b5d10831f/document/ecc?oid=6578abcd1234ef5678901234";

test("parseDocUrl recognises a BookKit page and an ECC document", () => {
  assert.deepEqual(parseDocUrl(BOOK), { kind: "bookkit", url: BOOK, awid: "0238a88bac124b3ca828835b57144ffa", code: "39741830" });
  assert.equal(parseDocUrl("https://uuapp.plus4u.net/uu-bookkit-maing01/0238a88bac124b3ca828835b57144ffa/book").code, "home");
  const e = parseDocUrl(`${ECC}&pageOid=6578abcd1234ef5678909999`);
  assert.equal(e.kind, "mkEcc"); assert.equal(e.oid, "6578abcd1234ef5678901234"); assert.equal(e.pageOid, "6578abcd1234ef5678909999");
  assert.deepEqual(loadArgs(e), { documentUrl: e.url, targetAwid: "091b197154354ec2975b249b5d10831f", pageOid: "6578abcd1234ef5678909999" });
  assert.deepEqual(loadArgs(parseDocUrl(BOOK)), { targetAwid: "0238a88bac124b3ca828835b57144ffa", code: "39741830" });
});

test("parseDocUrl refuses other hosts, schemes and malformed ids", () => {
  for (const u of [
    BOOK.replace("https:", "http:"), BOOK.replace("plus4u.net", "evil.net"), "https://plus4u.net.evil.com/uu-bookkit-maing01/0238a88bac124b3ca828835b57144ffa/book",
    "javascript:alert(1)", "https://uuapp.plus4u.net/uu-bookkit-maing01/xyz/book/page?code=1", ECC.replace("oid=6578abcd1234ef5678901234", "oid=1"),
    "https://uuapp.plus4u.net/uu-other-maing01/0238a88bac124b3ca828835b57144ffa/book", "", null,
  ]) assert.equal(parseDocUrl(u), null, String(u));
  assert.equal(parseDocUrl("https://uuapp-dev.plus4u.net/uu-bookkit-maing01/0238a88bac124b3ca828835b57144ffa/book/page?code=x").kind, "bookkit");
});

test("findDocUrls takes the links out of a text, each once, without trailing punctuation", () => {
  const found = findDocUrls(`Redesign ${BOOK}, and also (${ECC}). Again ${BOOK}.`);
  assert.deepEqual(found.map((d) => d.kind), ["bookkit", "mkEcc"]);
  assert.equal(found[0].code, "39741830");
});

test("snapshotName is stable and file-safe", () => {
  assert.equal(snapshotName(parseDocUrl(BOOK)), "bookkit-0238a88b-39741830");
  assert.equal(snapshotName(parseDocUrl(ECC)), "mkEcc-091b1971-6578abcd1234ef5678901234");
});

test("serverUrl: custom value first, then the preset; no choice means territory", () => {
  assert.deepEqual(serverUrl("bookkit", null), { error: "territory" });
  assert.deepEqual(serverUrl("bookkit", { preset: null, values: {} }), { error: "territory" });
  assert.equal(serverUrl("bookkit", { preset: "USY Terri", values: {} }).url, BUILTIN_PRESETS[1].values.uuBookKitMainUrl);
  assert.deepEqual(serverUrl("mkEcc", { preset: "USO Terri", values: { uuManagementKitEccUrl: "https://x.test/mcp" } }), { url: "https://x.test/mcp", source: "custom" });
  assert.match(serverUrl("mkEcc", { preset: "Nope", values: {} }).error, /Nope/);
  assert.match(serverUrl("mkEcc", { preset: null, values: { uuManagementKitEccUrl: "ftp://x" } }).error, /not valid/);
});

test("writeTerritory keeps the format of the plugins and raises the revision", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "terr-"));
  assert.equal(readTerritory({ home }), null);
  writeTerritory("USO Terri", { home });
  const s = writeTerritory("SWF Terri", { home });
  assert.equal(s.revision, 2);
  assert.deepEqual({ ...readTerritory({ home }), updatedAt: 0 }, { formatVersion: 1, revision: 2, preset: "SWF Terri", values: {}, updatedAt: 0, updatedBy: "uu5Mock Studio" });
});

test("presetsFor reads mcp.schema.json of the installed plugin, else the built-in presets", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "plg-"));
  const inst = path.join(dir, "uubookkit");
  await mkdir(inst);
  await writeFile(path.join(inst, "mcp.schema.json"), JSON.stringify({ presets: [{ name: "X", values: { uuBookKitMainUrl: "https://x" } }] }));
  const pluginsFile = path.join(dir, "installed.json");
  await writeFile(pluginsFile, JSON.stringify({ plugins: { "uubookkit@uu-business-products-mp": [{ installPath: inst }] } }));
  assert.equal(presetsFor("uubookkit", { pluginsFile })[0].name, "X");
  assert.equal(presetsFor("uumanagementkit", { pluginsFile }), BUILTIN_PRESETS);
});

test("uu5Text and extractSections read the content whatever the field names", () => {
  assert.equal(uu5Text('<uu5string/><Uu5Bricks.Section header="A">Hi <b>there</b> &amp; you</Uu5Bricks.Section>'), "A\nHi there & you");
  const s = extractSections({ x: [{ title: { en: "One" }, data: "<uu5string/>A" }, { name: "Two", content: "plain" }] });
  assert.deepEqual(s.map((v) => v.title), ["One", "Two"]);
});

test("toSnapshot writes the outline, text and uu5String; unknown output is dumped", () => {
  const doc = parseDocUrl(BOOK);
  const snap = toSnapshot(doc, { page: { name: { cs: "Stránka" } }, sectionList: [{ header: "Úvod", content: "<uu5string/><b>Ahoj</b>" }] }, { fetchedAt: "T", territory: "USO Terri" });
  assert.equal(snap.title, "Stránka");
  assert.deepEqual(snap.sections, [{ title: "Úvod", text: "Ahoj" }]);
  assert.match(snap.markdown, /^# Stránka\n/);
  assert.match(snap.markdown, /Read-only snapshot of a uuBookKit document, read T \(USO Terri\)/);
  assert.match(snap.markdown, /## 1\. Úvod\n\nAhoj\n\n```uu5string\n<uu5string\/><b>Ahoj<\/b>\n```/);
  const raw = toSnapshot(doc, "odd text");
  assert.match(raw.markdown, /```json\nodd text\n```/);
});

test("agentTools are read tools plus the status tool, never login or writes", () => {
  for (const kind of ["bookkit", "mkEcc"]) {
    const t = agentTools(kind);
    assert.ok(t.includes("uuAiChatMcpStatus"));
    assert.ok(!t.includes("uuAiChatMcpLogin"));
    assert.ok(t.every((n) => !/Update|Create|Add|Trash|Delete|Lock|Set|Move|Restore|Copy/.test(n)), t.join());
  }
});

import { docToolVerdict, sourcesPrompt } from "../src/main/docSources.mjs";
import { toolVerdict } from "../src/main/claudeService.mjs";
import { codexArgs } from "../src/main/codexService.mjs";

test("docToolVerdict: reading tools of the document servers pass, writing ones are denied, other servers are not judged", () => {
  assert.deepEqual(docToolVerdict("mcp__uuBookKitMain__toolUuBookKitLoadPage"), { behavior: "allow" });
  assert.deepEqual(docToolVerdict("mcp__plugin_uumanagementkit_uuManagementKitEcc__toolUuManagementkitEccPanelGetContent"), { behavior: "allow" });
  assert.deepEqual(docToolVerdict("mcp__uuBookKitMain__uuAiChatMcpStatus"), { behavior: "allow" });
  assert.equal(docToolVerdict("mcp__uuBookKitMain__toolUuBookKitUpdatePageSection").behavior, "deny");
  assert.equal(docToolVerdict("mcp__uuManagementKitEcc__toolUuManagementkitEccSectionSetContent").behavior, "deny");
  assert.equal(docToolVerdict("mcp__studio-browser__browser_open"), null);
  assert.equal(docToolVerdict("Write"), null);
  // through the verdict of the Claude provider, also outside Plan mode
  assert.equal(toolVerdict({ cwd: "/p", tool: "mcp__uuBookKitMain__toolUuBookKitTrashPage" }).behavior, "deny");
  assert.equal(toolVerdict({ cwd: "/p", tool: "mcp__uuBookKitMain__toolUuBookKitLoadPage" }).behavior, "allow");
});

test("sourcesPrompt names the snapshots and the servers", () => {
  assert.equal(sourcesPrompt([]), "");
  const p = sourcesPrompt([{ file: "/p/.studio/sources/a.md", title: "Rooms", url: BOOK, kind: "bookkit" }], ["uuBookKitMain"]);
  assert.match(p, /READ-ONLY snapshots/);
  assert.match(p, /\/p\/\.studio\/sources\/a\.md — uuBookKit “Rooms”/);
  assert.match(p, /MCP server\(s\) uuBookKitMain/);
});

test("codexArgs adds the document servers with only their reading tools", () => {
  const args = codexArgs({ docServers: { uuBookKitMain: { command: "/bin/npx", args: ["-y", "uu_aichat_mcputilityg01"], env: { SERVER_URL: "https://s/mcp", PATH: "/bin" } } }, docTools: { uuBookKitMain: ["toolUuBookKitLoadPage"] } });
  const c = args.filter((a, i) => args[i - 1] === "-c");
  assert.ok(c.includes('mcp_servers.uuBookKitMain.command="/bin/npx"'));
  assert.ok(c.includes('mcp_servers.uuBookKitMain.args=["-y","uu_aichat_mcputilityg01"]'));
  assert.ok(c.includes('mcp_servers.uuBookKitMain.env={ SERVER_URL = "https://s/mcp", PATH = "/bin" }'));
  assert.ok(c.includes('mcp_servers.uuBookKitMain.enabled_tools=["toolUuBookKitLoadPage"]'));
  assert.ok(!codexArgs({}).some((a) => a.includes("uuBookKitMain")));
});

import { customValues, aichatUrl, parseAichatUrl, checkServerUrl } from "../src/main/docSources.mjs";

test("custom territory: awid of uuAiChat and an instructionSet per kind become the server URLs", () => {
  const v = customValues({ awid: "AB".repeat(16), oids: { uuBookKitMainUrl: "c".repeat(24), uuManagementKitEccUrl: "" } });
  assert.deepEqual(v, { uuBookKitMainUrl: `https://uuapp.plus4u.net/uu-aichat-maing01/${"ab".repeat(16)}/uuAssistant/mcp?instructionSetOid=${"c".repeat(24)}` });
  assert.deepEqual(parseAichatUrl(v.uuBookKitMainUrl), { host: "uuapp.plus4u.net", awid: "ab".repeat(16), oid: "c".repeat(24) });
  assert.throws(() => customValues({ awid: "x", oids: { uuBookKitMainUrl: "c".repeat(24) } }), /32 hexadecimal/);
  assert.throws(() => customValues({ awid: "a".repeat(32), oids: { uuBookKitMainUrl: "123" } }), /uuBookKit: .*24 hexadecimal/);
  assert.throws(() => customValues({ awid: "a".repeat(32), oids: {} }), /at least one/);
  assert.equal(aichatUrl("a".repeat(32), "b".repeat(24), "bad host/"), null);
  assert.equal(checkServerUrl("https://x/uu-aichat-maing01/" + "a".repeat(32) + "/uuAssistant/mcp"), null);
  assert.match(checkServerUrl("http://x/y"), /https/);
});

test("writeTerritory: custom URLs win over the preset, choosing a preset drops them, other inputs stay", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "terr2-"));
  writeTerritory({ preset: "USO Terri" }, { home });
  const url = aichatUrl("a".repeat(32), "b".repeat(24));
  let s = writeTerritory({ custom: { uuManagementKitEccUrl: url } }, { home });
  assert.equal(s.preset, "USO Terri");
  assert.deepEqual(serverUrl("mkEcc", s), { url, source: "custom" });
  assert.equal(serverUrl("bookkit", s).source, "preset:USO Terri");
  s.values.uuComponentCatalogueUrl = "https://keep"; // an input of the plugins the app does not use
  (await import("node:fs")).writeFileSync(path.join(home, ".uu-aichat-plugins", "uu-business-products-mp", "territory.json"), JSON.stringify(s));
  s = writeTerritory("USY Terri", { home });
  assert.deepEqual(s.values, { uuComponentCatalogueUrl: "https://keep" });
  assert.throws(() => writeTerritory({ custom: { uuBookKitMainUrl: "http://evil" } }, { home }), /https/);
});

import { oneLanguage, stripUu5Json } from "../src/main/docSources.mjs";

test("toSnapshot reads the ECC output of uuManagementKit (pageName, contentUu5String, Lsi, nested escaped rich text)", () => {
  const data = {
    entityType: "document", pageName: "Odborné praxe",
    sectionList: [
      { index: 0, contentUu5String: '<Uu5Bricks.Lsi><Uu5Bricks.Lsi.Item language="en"><Uu5Bricks.Link href="x">About</Uu5Bricks.Link></Uu5Bricks.Lsi.Item><Uu5Bricks.Lsi.Item language="cs"><Uu5Bricks.Link href="x">O praxích</Uu5Bricks.Link></Uu5Bricks.Lsi.Item></Uu5Bricks.Lsi>' },
      { index: 1, contentUu5String: '<Uu5Bricks.Lsi><Uu5Bricks.Lsi.Item language="cs"><Uu5Bricks.Block card="none" level=3 header="V kostce"><UU5.RichText.Block uu5string="<uu5string/><Uu5Bricks.Div style=\\"<uu5json/>{\\n \\\\\\"textAlign\\\\\\": \\\\\\"left\\\\\\"\\n}\\">Délka 550 hodin.</Uu5Bricks.Div>"/></Uu5Bricks.Block></Uu5Bricks.Lsi.Item></Uu5Bricks.Lsi>' },
      { index: 2, contentUu5String: '<UU5.RichText.Block uu5string=""/>' },
    ],
  };
  const snap = toSnapshot(parseDocUrl(ECC), data);
  assert.equal(snap.title, "Odborné praxe");
  assert.deepEqual(snap.sections, [{ title: "About", text: "About" }, { title: "V kostce", text: "V kostce\nDélka 550 hodin." }]);
});

test("oneLanguage keeps English (or the asked language), else the first; stripUu5Json removes the data", () => {
  const lsi = (l) => `<Uu5Bricks.Lsi.Item language="${l}">${l}</Uu5Bricks.Lsi.Item>`;
  assert.equal(oneLanguage(`<Uu5Bricks.Lsi>${lsi("en")}${lsi("cs")}</Uu5Bricks.Lsi>`), "<Uu5Bricks.Lsi>en</Uu5Bricks.Lsi>");
  assert.equal(oneLanguage(`<Uu5Bricks.Lsi>${lsi("en")}${lsi("cs")}</Uu5Bricks.Lsi>`, "cs"), "<Uu5Bricks.Lsi>cs</Uu5Bricks.Lsi>");
  assert.equal(oneLanguage(`${lsi("de")}${lsi("en")}`), "en");
  assert.equal(stripUu5Json('a style="<uu5json/>{"x": {"y": [1]}}" b'), 'a style="" b');
});

import { sourcePage } from "../src/main/docSources.mjs";

test("sourcePage puts the sections in as safe JSON with the uu5string prefix", () => {
  const html = sourcePage({ title: 'A <b>"x"', url: "https://u", kind: "mkEcc", raw: ["<Uu5Bricks.Link>a</Uu5Bricks.Link></script><script>alert(1)</script>"] });
  assert.match(html, /<title>A &lt;b&gt;&quot;x&quot; \(uuManagementKit, original\)<\/title>/);
  assert.ok(!html.includes("</script><script>alert(1)"));
  assert.match(html, /window\.__SOURCE_SECTIONS = \["\\u003cuu5string\/>\\u003cUu5Bricks\.Link>/);
});

import { imageRefs, fileLink, localizeImages } from "../src/main/docSources.mjs";

test("imageRefs, fileLink and localizeImages, also inside escaped nested uu5Strings", () => {
  const oid = "66cdbdfefbc8750023912811";
  const raw = [`<UuContentKit.Images.Image src="${oid}" fileName="a.jpg"/>`, `<X uu5string="<uu5string/><Uu5Bricks.Card image=\\"${oid}\\"/>"/>`];
  assert.deepEqual(imageRefs(raw), [oid]);
  assert.equal(fileLink({ contentIntent: { parts: [{ file_url: "https://evil.com/x" }] } }), null);
  assert.deepEqual(fileLink({ name: "a.jpg", contentIntent: { parts: [{ filename: "a.jpg", contentType: "image/jpeg", file_url: "https://uuapp.plus4u.net/b?x=1" }] } }), { url: "https://uuapp.plus4u.net/b?x=1", contentType: "image/jpeg", name: "a.jpg" });
  const out = localizeImages(raw, { [oid]: { path: `assets/${oid}.jpg`, name: "a.jpg" } });
  assert.equal(out[0], `<img src="assets/${oid}.jpg" alt="a.jpg" className="uu5mock-picture"/>`);
  assert.equal(out[1], `<X uu5string="<uu5string/><Uu5Bricks.Card image=\\"assets/${oid}.jpg\\"/>"/>`);
  assert.deepEqual(localizeImages(raw, {}), raw);
});

test("truncatedSections finds the cut sections and completeSection fills them in", async () => {
  const { truncatedSections, completeSection } = await import("../src/main/docSources.mjs");
  const data = { sectionList: [{ sectionOid: "a", truncated: false, contentUu5String: "x" }, { sectionOid: "b", truncated: true, contentUu5String: "<uu5string/><A>cut..." }] };
  const cut = truncatedSections(data);
  assert.deepEqual(cut.map((s) => s.sectionOid), ["b"]);
  assert.equal(completeSection(cut[0], "<uu5string/><A>all</A>"), true);
  assert.deepEqual(data.sectionList[1], { sectionOid: "b", truncated: false, contentUu5String: "<uu5string/><A>all</A>" });
  assert.equal(completeSection(cut[0], ""), false);
});

test("sourcePage renders each section on its own: one that does not parse does not blank the page", async () => {
  const { sourcePage } = await import("../src/main/docSources.mjs");
  const html = sourcePage({ title: "T", url: "https://x.test", kind: "mkEcc", raw: ["<uu5string/><A>"] });
  assert.match(html, /try \{ return <Section>\{Utils\.Uu5String\.toChildren\(local\(uu5String\)\)\}<\/Section>; \}/);
  assert.match(html, /This section could not be shown/);
  assert.match(html, /static getDerivedStateFromError/, "an error boundary per section");
});

test("imageRefs and localizeImages also take links to the document's file store (getDataByOid with a fileOid)", () => {
  const a = "6628cf1833c2250035144bfb", b = "6633153f11ccf00035e0b380";
  const raw = [
    `<Uu5ImagingBricks.Image src="https://uuapp.plus4u.net/uu-managementkit-maing02/x/document/ebc/file/getDataByOid?oid=660d8eb6e75ca600355fe18d&uuEbcData=%7B%22fileOid%22%3A%22${a}%22%7D"/>`,
    `<Uu5ImagingBricks.Image src=\\"https://uuapp.plus4u.net/uu-managementkit-maing02/x/document/ebc/file/getDataByOid?oid=660d8eb6e75ca600355fe18d&uuEbcData.fileOid=${b}\\"/>`,
  ];
  assert.deepEqual(imageRefs(raw), [a, b]);
  const out = localizeImages(raw, { [a]: { path: "/P/.studio/sources/assets/a.png", name: "a.png" }, [b]: { path: "/P/.studio/sources/assets/b.png", name: "b.png" } });
  assert.equal(out[0], '<Uu5ImagingBricks.Image src="/P/.studio/sources/assets/a.png"/>');
  assert.equal(out[1], '<Uu5ImagingBricks.Image src=\\"/P/.studio/sources/assets/b.png\\"/>');
});

import { openAuthorization } from "../src/main/docSources.mjs";
test("openAuthorization: a group of Uu5Bricks.Authorization becomes the content of its first profile item, nested groups too", () => {
  const it = (a, body) => `<Uu5Bricks.Authorization.Item ${a}>${body}</Uu5Bricks.Authorization.Item>`;
  const g = (...items) => `<Uu5Bricks.Authorization>${items.join("")}</Uu5Bricks.Authorization>`;
  assert.equal(openAuthorization("<p>x</p>"), "<p>x</p>");
  assert.equal(openAuthorization(`A${g(it('type="pending"', "<Pending/>"), it('_name="R" type="authorizedProfile" artifactUri="u"', "ONE"), it('type="authorizedProfile"', "TWO"))}B`), "AONEB");
  assert.equal(openAuthorization(g(it('type="pending"', "P"), it('type="authorizedProfile"', `<Tabs>${g(it('type="authorizedProfile"', "IN"))}</Tabs>`))), "<Tabs>IN</Tabs>");
  assert.equal(openAuthorization(`${g(it('type="authorizedProfile"', "a"))}-${g(it('type="authorizedProfile"', "b"))}`), "a-b");
  assert.equal(openAuthorization(g(it('type="pending"', "P"))), "");
});

test("any http(s) link is a web page; passwords, other schemes and fragments are not kept", () => {
  assert.deepEqual(parseLink("https://www.example.com/a/b?x=1#top"), { kind: "web", url: "https://www.example.com/a/b?x=1", host: "example.com" });
  assert.equal(parseLink("http://localhost:3000/").kind, "web");
  assert.equal(parseLink(BOOK).kind, "bookkit"); // a Plus4U document stays a document
  for (const u of ["ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "https://user:pw@example.com/", "not a url"]) assert.equal(parseLink(u), null, u);
  const found = findDocUrls(`See https://example.com/page, ${BOOK} and (http://localhost:8080/x). Again https://example.com/page#a.`);
  assert.deepEqual(found.map((d) => d.kind), ["web", "bookkit", "web"]);
});

test("a web page has a stable file-safe snapshot name and a snapshot of its text", () => {
  const a = parseLink("https://www.example.com/a?x=1"), b = parseLink("https://www.example.com/a?x=2");
  assert.match(snapshotName(a), /^web-example\.com-[0-9a-f]{8}$/);
  assert.equal(snapshotName(a), snapshotName(parseLink("https://www.example.com/a?x=1#frag")));
  assert.notEqual(snapshotName(a), snapshotName(b));
  const snap = webSnapshot(a, { title: "  Hello \n world ", text: "Line\n\n\n\nnext  \n" });
  assert.equal(snap.title, "Hello world");
  assert.match(snap.markdown, /Source: https:\/\/www\.example\.com\/a\?x=1/);
  assert.match(snap.markdown, /Line\n\nnext/);
  assert.equal(webSnapshot(a, { title: "", text: "" }).title, "example.com");
});

test("a book is recognised by the address of the book itself and with the tenant in front of the awid", async () => {
  const { bookToTree } = await import("../src/renderer/siteStructure.js");
  const d = parseDocUrl("https://uuapp.plus4u.net/uu-bookkit-maing01/78462435-ac55fece6a6542c4b987ab6ff51118fa/");
  assert.deepEqual({ kind: d.kind, awid: d.awid, code: d.code }, { kind: "bookkit", awid: "ac55fece6a6542c4b987ab6ff51118fa", code: "home" });
  assert.equal(loadArgs(d).targetAwid, "ac55fece6a6542c4b987ab6ff51118fa");
  assert.equal(parseDocUrl("https://uuapp.plus4u.net/uu-bookkit-maing01/78462435-ac55fece6a6542c4b987ab6ff51118fa/book/page?code=x").code, "x");
  assert.equal(parseDocUrl("https://uuapp.plus4u.net/uu-bookkit-maing01/78462435-ac55fece6a6542c4b987ab6ff51118fa/other"), null);
  assert.equal(bookToTree({ itemMap: { a: { label: "A", indent: 0 } } }, d).children[0].url, "https://uuapp.plus4u.net/uu-bookkit-maing01/78462435-ac55fece6a6542c4b987ab6ff51118fa/book/page?code=a");
});

test("the snapshot of a web page lists the pictures the page showed; the pictures of a book page are found by their address", async () => {
  const { bookImageRefs, contentImage } = await import("../src/main/docSources.mjs");
  const snap = webSnapshot(parseLink("https://example.com/"), { title: "T", text: "x", images: [{ url: "https://example.com/a.jpg", alt: " Team \n photo ", w: 800, h: 600 }, { url: "data:image/png;base64,xx" }, { url: "https://cdn.test/b.png" }] });
  assert.match(snap.markdown, /## Pictures of the page[\s\S]*download_asset[\s\S]*\n- https:\/\/example\.com\/a\.jpg — Team photo \(800×600\)\n- https:\/\/cdn\.test\/b\.png\n/);
  assert.doesNotMatch(snap.markdown, /data:image/);
  assert.doesNotMatch(webSnapshot(parseLink("https://example.com/"), { title: "T", text: "x" }).markdown, /Pictures/);
  const u = "https://uuapp.plus4u.net/uu-bookkit-maing01/78462435-ac55fece6a6542c4b987ab6ff51118fa/getBinaryData?code=77e8d1ee";
  assert.deepEqual(bookImageRefs([`<Uu5ImagingBricks.Image src=\\"${u}\\" thumbnailSrc=\\"${u}_th\\"/>`, `<img src="${u}"/>`]), [{ url: u, awid: "ac55fece6a6542c4b987ab6ff51118fa", code: "77e8d1ee" }, { url: `${u}_th`, awid: "ac55fece6a6542c4b987ab6ff51118fa", code: "77e8d1ee_th" }]);
  assert.equal(contentImage({ content: [{ type: "text", text: "x" }, { type: "resource", resource: { blob: "AAAA", mimeType: "image/jpeg; x" } }] }).mime, "image/jpeg");
  assert.equal(contentImage({ content: [{ type: "image", data: "AAAA", mimeType: "application/pdf" }] }), null);
});

test("a picture is downloaded with the user's access when the plain download is refused; a picture of a document is copied into assets", async () => {
  const { downloadWebImage, copySourcePicture, mergeImages } = await import("../src/main/webImages.mjs");
  const { makeProject } = await import("./helpers.mjs");
  const { mkdir, writeFile, readFile } = await import("node:fs/promises");
  const path = (await import("node:path")).default;
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const dir = await makeProject({}), check = async (u) => new URL(u);
  const plain = async () => new Response("<html>log in</html>", { status: 200, headers: { "content-type": "text/html" } }), denied = async () => new Response("", { status: 403 });
  const access = async () => new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
  assert.equal(await downloadWebImage(dir, "https://a.test/p/photo.png", "team", { fetchImpl: plain, access, check }), "assets/team.png");
  assert.equal(await downloadWebImage(dir, "https://a.test/p/photo.png", "team", { fetchImpl: denied, access, check }), "assets/team-2.png");
  await assert.rejects(downloadWebImage(dir, "https://a.test/p/photo.png", "x", { fetchImpl: denied, check }), /403/);
  const src = path.join(dir, ".studio", "sources", "assets");
  await mkdir(src, { recursive: true }); await writeFile(path.join(src, "pic1.png"), PNG);
  const saved = await copySourcePicture(dir, path.join(src, "pic1.png"), "campus");
  assert.equal(saved, "assets/campus.png");
  assert.deepEqual(await readFile(path.join(dir, saved)), PNG);
  assert.equal(await copySourcePicture(dir, "pic1.png"), "assets/pic1.png");
  await assert.rejects(copySourcePicture(dir, "/etc/hosts"), /Not a picture of a document/);
  await assert.rejects(copySourcePicture(dir, "../../../x.png"), /There is no picture/);
  assert.deepEqual(mergeImages([{ url: "a", alt: "A" }], [{ url: "a" }, { url: "b" }]), [{ url: "a", alt: "A" }, { url: "b", alt: "" }]);
});

test("pictures a web page held only in memory are kept as files and listed in its snapshot", async () => {
  const { saveBlobPictures } = await import("../src/main/webImages.mjs");
  const { makeProject } = await import("./helpers.mjs");
  const { readFile } = await import("node:fs/promises");
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const dir = await makeProject({});
  const files = await saveBlobPictures(dir, [{ alt: " Jan \n Novák ", w: 400, h: 300, data: PNG }, { alt: "again", data: PNG }, { alt: "text", data: Buffer.from("<html>").toString("base64") }]);
  assert.equal(files.length, 1); // the same picture once, what is no picture not at all
  assert.match(files[0].name, /^web-[0-9a-f]{10}\.png$/);
  assert.equal(files[0].alt, "Jan Novák");
  assert.equal((await readFile(files[0].file)).toString("base64"), PNG);
  const snap = webSnapshot(parseLink("https://example.com/"), { title: "T", text: "x", files });
  assert.match(snap.markdown, /## Pictures \(downloaded, in \.studio\/sources\)[\s\S]*document_picture[\s\S]*\n- \S+web-[0-9a-f]{10}\.png — Jan Novák \(400×300\)\n/);
  assert.deepEqual(await saveBlobPictures(dir, undefined), []);
});
