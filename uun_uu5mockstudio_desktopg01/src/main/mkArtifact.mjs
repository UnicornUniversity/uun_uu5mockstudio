/**
 * An artifact of uuManagementKit (a document, keyTask, portal …) linked to a project: what its address says, and the link kept in
 * `<project>/.studio/plus4u.json`. Pure helpers apart from reading and writing that file.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

export const LINK_FILE = path.join(".studio", "plus4u.json");

/**
 * `https://uuapp.plus4u.net/uu-managementkit-maing02/<awid>/document/permissionSettings?oid=…&pageOid=…` →
 * { url, baseUri, product, awid, entity: "document", oid, pageOid }: the first segment after the base URI is always the entity. Null when the
 * address is not one of an artifact (no entity or no oid).
 */
export function parseArtifactUrl(raw) {
  let u;
  try { u = new URL(String(raw ?? "").trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const seg = u.pathname.split("/").filter(Boolean);
  if (seg.length < 3 || !/^[0-9a-f]{32}$/i.test(seg[1]) || !/^[A-Za-z][\w-]*$/.test(seg[2])) return null;
  const oid = u.searchParams.get("oid");
  if (!oid || !/^[0-9a-f]{24}$/i.test(oid)) return null;
  const pageOid = u.searchParams.get("pageOid");
  const baseUri = `${u.origin}/${seg[0]}/${seg[1]}`;
  return {
    url: `${baseUri}/${seg[2]}?oid=${oid}`, baseUri, product: seg[0], awid: seg[1].toLowerCase(), entity: seg[2], oid,
    ...(pageOid && /^[0-9a-f]{24}$/i.test(pageOid) ? { pageOid } : {}),
  };
}

/** A short stable id of a project for the search keys of its attachments (kept in the link, so a rename does not change it). */
export const newProjectId = () => randomBytes(5).toString("hex");

/** Search keys: they must match /^[0-9a-zA-Z_-]{3,256}$/. */
export const projectZipKey = (projectId) => `uu5mock-project-${projectId}`;
export function screenKey(projectId, screen) {
  const slug = String(screen ?? "").replace(/\.html?$/i, "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^0-9a-zA-Z_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  const tail = createHash("sha1").update(String(screen)).digest("hex").slice(0, 6); // two names that slug alike stay apart
  return `uu5mock-screen-${projectId}-${slug || "screen"}-${tail}`;
}
export const validSearchKey = (k) => /^[0-9a-zA-Z_-]{3,256}$/.test(String(k));

/** The link of a project, or null. */
export async function readLink(projectDir) {
  try {
    const l = JSON.parse(await readFile(path.join(projectDir, LINK_FILE), "utf8"));
    return l && typeof l === "object" && l.baseUri && l.entity && l.oid ? l : null;
  } catch { return null; }
}

export async function writeLink(projectDir, link) {
  await mkdir(path.join(projectDir, ".studio"), { recursive: true });
  await writeFile(path.join(projectDir, LINK_FILE), JSON.stringify(link, null, 2));
  return link;
}

/** Links a project to an artifact (keeps the project id and the sync state when it is the same artifact again). */
export async function linkProject(projectDir, artifact, { name, projectId } = {}) {
  const old = await readLink(projectDir);
  const same = old && old.baseUri === artifact.baseUri && old.entity === artifact.entity && old.oid === artifact.oid;
  return writeLink(projectDir, {
    url: artifact.url, baseUri: artifact.baseUri, entity: artifact.entity, oid: artifact.oid, name: name ?? (same ? old.name : null),
    projectId: old?.projectId ?? projectId ?? newProjectId(), linkedAt: same ? old.linkedAt : new Date().toISOString(), attachments: same ? old.attachments ?? {} : {},
  });
}
