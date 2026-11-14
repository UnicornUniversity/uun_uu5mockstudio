/**
 * Writing a screen or the sitemap of a project as a uu5string onto a page of a uuManagementKit document (ECC), through the MCP tools of
 * uuManagementKit (`docFetcher.tool("mkEcc", …)`): they validate the uu5string on the server and lock / unlock the section.
 *
 * The document is the one linked to the project or any other (its address). Each published item has its own section; the project remembers
 * where each item went last (`.studio/plus4u-publish.json`: `targets[key] = { documentUrl, documentName, pageOid, pageName, sectionOid }`,
 * the tools do not return search keys), so publishing again (also "quick publish", without a dialog) overwrites that section instead of
 * adding another one. A section that is gone (trashed, moved) is created anew. `documents` lists the documents used before.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { readLink, screenKey, newProjectId, parseArtifactUrl } from "./mkArtifact.mjs";

export const PUBLISH_FILE = path.join(".studio", "plus4u-publish.json");
const MAX_DOCUMENTS = 8;

export const sitemapKey = (projectId) => `uu5mock-sitemap-${projectId}`;
export const T = {
  meta: "toolUuManagementkitEccDocumentGetMetadata",
  sections: "toolUuManagementkitEccPanelListSections",
  createPage: "toolUuManagementkitEccDocumentCreatePage",
  createSection: "toolUuManagementkitEccPanelCreateSection",
  setContent: "toolUuManagementkitEccSectionSetContent",
  section: "toolUuManagementkitEccSectionGet",
};

const withPrefix = (s) => (String(s).trimStart().startsWith("<uu5string/>") ? String(s).trim() : `<uu5string/>${String(s).trim()}`);

/** The MCP target of a document address: { documentUrl, targetAwid } (any page, permission page … of it), or throws. */
export function docTarget(url) {
  const a = parseArtifactUrl(url);
  if (!a) throw new Error("This is not the address of a uuManagementKit document (it needs …/<entity>?oid=…).");
  return { documentUrl: a.url, targetAwid: a.awid };
}

/** `tool(name, args)` → { data } | { error }; an error becomes a thrown Error with `code: "login"` when the MCP server needs a sign-in. */
async function run(tool, name, args) {
  const r = await tool(name, args);
  if (r?.error) throw Object.assign(new Error(r.error === "login" ? "Sign in to Plus4U for the documents first." : r.error), { code: ["login", "territory", "npx"].includes(r.error) ? r.error : undefined });
  return r?.data ?? {};
}

/** The publish memory of a project: { projectId, targets, documents }. Targets of an older version (in the link, `pages`) are taken over. */
export async function readStore(dir) {
  let s = null;
  try { s = JSON.parse(await readFile(path.join(dir, PUBLISH_FILE), "utf8")); } catch { /* none yet */ }
  const link = await readLink(dir);
  const store = { projectId: s?.projectId ?? link?.projectId ?? null, targets: s?.targets ?? {}, documents: Array.isArray(s?.documents) ? s.documents : [] };
  if (!s && link?.pages) for (const [k, p] of Object.entries(link.pages)) store.targets[k] = { documentUrl: link.url, documentName: link.name ?? null, ...p };
  return store;
}
async function writeStore(dir, store) {
  await mkdir(path.join(dir, ".studio"), { recursive: true });
  await writeFile(path.join(dir, PUBLISH_FILE), JSON.stringify(store, null, 2));
}

/** The key of what is published: a screen (`screen: "a.html"`) or the sitemap (`sitemap: true`). */
export function itemKey(projectId, { screen, sitemap }) {
  if (sitemap) return sitemapKey(projectId);
  if (screen) return screenKey(projectId, screen);
  throw new Error("Nothing to publish.");
}

/** The documents to offer: { linked: { url, name } | null, recent: [{ url, name }], target: (where this item went last) | null }. */
export async function publishTargets(dir, item = {}) {
  const store = await readStore(dir), link = await readLink(dir);
  const linked = link ? { url: link.url, name: link.name ?? null } : null;
  const recent = store.documents.filter((d) => d.url !== linked?.url).slice(0, MAX_DOCUMENTS).map(({ url, name }) => ({ url, name }));
  const projectId = store.projectId ?? link?.projectId;
  const target = projectId && (item.screen || item.sitemap) ? store.targets[itemKey(projectId, item)] ?? null : null;
  return { linked, recent, target };
}

/** The pages of a document (`documentUrl`, else the linked one): { documentUrl, documentName, mainPageOid, pages: [{ pageOid, name, hidden }] }. */
export async function listPages(dir, tool, documentUrl = null) {
  const url = documentUrl || (await readLink(dir))?.url;
  if (!url) throw new Error("Choose a document.");
  const base = docTarget(url);
  const d = await run(tool, T.meta, base);
  return { documentUrl: base.documentUrl, documentName: d.documentName ?? null, mainPageOid: d.mainPageOid ?? null, pages: d.pageList ?? [] };
}

/** The section of the created one, wherever the tool puts it. */
export const sectionOidOf = (d) => d?.createdSection?.sectionOid ?? d?.section?.sectionOid ?? d?.sectionOid ?? d?.createdSectionOid ?? null;
export const pageOidOf = (d) => d?.createdPage?.pageOid ?? d?.page?.pageOid ?? d?.pageOid ?? null;

/**
 * Publishes `content` (a uu5string) onto a page of a document (`documentUrl`, else the linked one): `pageOid` of an existing page, or
 * `newPageName` for a new one. `quick`: to where this item went last (no page given). Returns
 * { ok, documentUrl, documentName, pageOid, pageName, sectionOid, created: "section" | "page" | false (overwritten) }.
 */
export async function publish(dir, tool, { screen, sitemap, content, documentUrl, documentName, pageOid, newPageName, quick = false }) {
  const text = withPrefix(content ?? "");
  if (text === "<uu5string/>") throw new Error("There is nothing to publish.");
  const store = await readStore(dir), link = await readLink(dir);
  const projectId = store.projectId ?? link?.projectId ?? newProjectId();
  const key = itemKey(projectId, { screen, sitemap });
  const known = store.targets[key];
  if (quick) {
    if (!known?.documentUrl || !known.pageOid) throw new Error("This was not published yet: choose a document and a page.");
    documentUrl = known.documentUrl; documentName = documentName ?? known.documentName; pageOid = known.pageOid; newPageName = null;
  }
  documentUrl = documentUrl || link?.url;
  if (!documentUrl) throw new Error("Choose a document.");
  const base = docTarget(documentUrl);
  let created = false, pageName = null, sectionOid0 = null;

  if (newPageName) {
    const d = await run(tool, T.createPage, { ...base, name: String(newPageName).trim() });
    pageOid = pageOidOf(d);
    if (!pageOid) throw new Error("The page was not created.");
    pageName = d?.createdPage?.name ?? String(newPageName).trim();
    created = "page";
    // a new page comes with one empty section: the content goes there instead of a second section below it
    const s = await run(tool, T.sections, { ...base, pageOid });
    const only = (s.sectionList ?? []).length === 1 ? s.sectionList[0].sectionOid : null;
    if (only && !String((await run(tool, T.section, { ...base, sectionOid: only })).content ?? "").replace(/<uu5string\s*\/>/g, "").trim()) sectionOid0 = only;
  }
  if (!pageOid) throw new Error("Choose a page of the document.");

  // the section published before, if it is still on this page of this document
  let sectionOid = sectionOid0;
  if (!sectionOid && known?.sectionOid && known.pageOid === pageOid && known.documentUrl === base.documentUrl && created !== "page") {
    const s = await run(tool, T.sections, { ...base, pageOid });
    pageName = s.pageName ?? pageName;
    if ((s.sectionList ?? []).some((x) => x.sectionOid === known.sectionOid)) sectionOid = known.sectionOid;
  }

  if (sectionOid) {
    await run(tool, T.setContent, { ...base, sectionOid, content: text, validateOnly: true }); // the tool asks for a dry run first: an invalid uu5string stops here
    await run(tool, T.setContent, { ...base, sectionOid, content: text });
  } else {
    const d = await run(tool, T.createSection, { ...base, pageOid, content: text, searchKey: key });
    sectionOid = sectionOidOf(d);
    if (!sectionOid) { // older answers: find the new section as the one that was not there
      const s = await run(tool, T.sections, { ...base, pageOid });
      sectionOid = (s.sectionList ?? []).map((x) => x.sectionOid).pop() ?? null;
    }
    created = created || "section";
  }

  pageName = pageName ?? (known?.pageOid === pageOid ? known.pageName : null);
  const name = documentName ?? (base.documentUrl === link?.url ? link?.name : null) ?? store.documents.find((d) => d.url === base.documentUrl)?.name ?? known?.documentName ?? null;
  const fresh = await readStore(dir);
  await writeStore(dir, {
    projectId,
    targets: { ...fresh.targets, [key]: { documentUrl: base.documentUrl, documentName: name, pageOid, pageName, sectionOid, what: sitemap ? "sitemap" : screen, publishedAt: new Date().toISOString() } },
    documents: [{ url: base.documentUrl, name, usedAt: new Date().toISOString() }, ...fresh.documents.filter((d) => d.url !== base.documentUrl)].slice(0, MAX_DOCUMENTS),
  });
  return { ok: true, documentUrl: base.documentUrl, documentName: name, pageOid, pageName, sectionOid, created };
}

/** The address of a page of a document (opens the page in the browser). */
export const pageUrl = (documentUrl, pageOid) => `${documentUrl}${documentUrl.includes("?") ? "&" : "?"}pageOid=${encodeURIComponent(pageOid)}`;
