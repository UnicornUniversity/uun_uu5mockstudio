/**
 * Synchronization of a project with the attachments (EBC) of its linked uuManagementKit artifact:
 *  - `uu5mock-project-<projectId>`: a zip of the whole project folder (the round trip: upload and download);
 *  - `uu5mock-screen-<projectId>-<screen>-<hash>`: the HTML of each screen, for people reading the document (upload only).
 * A remote file that changed since the last sync of this project (its binaryCode differs from the one kept in the link) is a conflict: it is
 * reported, and replaced only with `force`. A download first zips the current project into .studio/backups/.
 */
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { zipSync, unzipSync } from "fflate";
import { readLink, writeLink, linkProject, projectZipKey, screenKey, LINK_FILE } from "./mkArtifact.mjs";

export const BACKUP_DIR = path.join(".studio", "backups");
const MAX_ZIP = 100 * 1024 * 1024;

/** Paths (relative, with /) that stay local: not in the zip, and kept as they are on a download. */
export function isLocalOnly(rel) {
  const p = rel.split(path.sep).join("/");
  return p === LINK_FILE.split(path.sep).join("/") || /^\.claude(\/|$)/.test(p) || /^\.git(\/|$)/.test(p) || /(^|\/)\.DS_Store$/.test(p)
    || /^\.studio\/(thumb\.(jpg|json)|backups|frames-draft|repo-views)(\/|$)/.test(p);
}

/** Every file of the project folder that belongs to the zip: [rel]. */
export async function projectFiles(dir, rel = "") {
  const out = [];
  for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (isLocalOnly(r)) continue;
    if (e.isDirectory()) out.push(...await projectFiles(dir, r));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

export async function zipProject(dir) {
  const entries = {};
  for (const rel of await projectFiles(dir)) entries[rel] = new Uint8Array(await readFile(path.join(dir, rel)));
  const zip = zipSync(entries, { level: 6, mtime: new Date("2020-01-01T00:00:00Z") }); // a fixed time: the same project gives the same bytes
  if (zip.length > MAX_ZIP) throw new Error(`The project zip has ${Math.round(zip.length / 1048576)} MB, more than ${MAX_ZIP / 1048576} MB.`);
  return Buffer.from(zip);
}

/** A file name inside a zip that cannot leave the project folder. */
export function safeRel(name) {
  const p = String(name).replace(/\\/g, "/");
  if (!p || p.endsWith("/") || p.startsWith("/") || /^[a-zA-Z]:/.test(p) || p.split("/").some((s) => s === ".." || s === "")) return null;
  return p;
}

/** Writes a downloaded zip over the project: its files replace the local ones, local files it does not have are removed (local-only ones stay). */
export async function applyZip(dir, buf) {
  const files = unzipSync(new Uint8Array(buf));
  const wanted = new Set();
  for (const [name, data] of Object.entries(files)) {
    const rel = safeRel(name);
    if (!rel || isLocalOnly(rel)) continue;
    wanted.add(rel);
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), data);
  }
  for (const rel of await projectFiles(dir)) if (!wanted.has(rel)) await rm(path.join(dir, rel), { force: true });
  return [...wanted];
}

export const hash = (buf) => createHash("sha1").update(buf).digest("hex");
const screenNames = async (dir) => (await readdir(dir)).filter((f) => f.endsWith(".html")).sort();
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/**
 * `client` = createEbcClient(...) of the artifact; `link` = readLink(dir). Returns the attachments of the project found in the artifact
 * ({ collectionOid, zip, screens: { key: file } }) and the artifact itself.
 */
export async function remoteState(client, link) {
  const artifact = await client.loadArtifact(link.oid);
  const collectionOid = artifact?.uuEbcData?.uuBbAttachmentsCollectionOid;
  if (!collectionOid) throw new Error("This artifact has no attachments (no EBC collection).");
  const files = await client.listAllFiles(link.oid, collectionOid);
  const byKey = new Map(files.filter((f) => f.searchKey && !f.sys?.trashed).map((f) => [f.searchKey, f]));
  return { artifact, collectionOid, byKey };
}

/** What a remote file was at the last sync, and whether it changed since (someone else uploaded). */
export function changedSince(remote, kept) {
  if (!remote) return false;
  if (!kept) return true; // there is a file with this key the project never synced: not ours to overwrite blindly
  return remote.binaryCode !== kept.binaryCode;
}

const record = (f) => ({ fileOid: f.oid, binaryCode: f.binaryCode ?? null, rev: f.sys?.rev ?? null, mts: f.binaryMts ?? f.sys?.mts ?? null, syncedAt: new Date().toISOString() });
const who = (f) => ({ name: f.name, mts: f.binaryMts ?? f.sys?.mts, uuIdentity: f.sys?.uuIdentity });

/**
 * Uploads the zip of the project and the HTML of its screens. { ok, uploaded: [{ key, name, created }], artifactName } or
 * { conflict: { key, name, mts, uuIdentity } } when the zip in the artifact changed since the last sync and `force` is not set.
 */
export async function upload(dir, client, { force = false, screens = true } = {}) {
  const link = await readLink(dir);
  if (!link) throw new Error("The project is not linked to a Plus4U artifact.");
  const { artifact, collectionOid, byKey } = await remoteState(client, link);
  const zipKey = projectZipKey(link.projectId);
  const kept = link.attachments ?? {};
  if (!force && changedSince(byKey.get(zipKey), kept[zipKey])) return { conflict: { key: zipKey, ...who(byKey.get(zipKey)) } };

  const items = [{ key: zipKey, name: `${path.basename(dir)}.uu5mock.zip`, type: "application/zip", data: await zipProject(dir) }];
  if (screens) for (const f of await screenNames(dir)) items.push({ key: screenKey(link.projectId, f), name: f, type: "text/html", data: await readFile(path.join(dir, f)) });

  const uploaded = [], attachments = { ...kept };
  for (const it of items) {
    const remote = byKey.get(it.key);
    if (remote && kept[it.key]?.binaryCode === remote.binaryCode && kept[it.key]?.local === hash(it.data)) continue; // the same on both sides since the last sync
    const binary = { data: it.data, name: it.name, type: it.type };
    const out = remote
      ? await client.updateFileData(link.oid, { fileOid: remote.oid, name: it.name }, binary)
      : await client.createFile(link.oid, { collectionOid, searchKey: it.key, name: it.name }, binary);
    const file = out?.createdFile ?? out?.updatedFile ?? out?.file ?? out;
    attachments[it.key] = { ...record({ ...remote, ...file }), size: it.data.length, local: hash(it.data) };
    uploaded.push({ key: it.key, name: it.name, created: !remote });
  }
  await writeLink(dir, { ...link, name: artifact?.name ?? link.name, attachments });
  return { ok: true, uploaded, artifactName: artifact?.name ?? link.name };
}

/**
 * Where the project stands against its artifact, cheaply: { linked: false } or { linked, localChanged, remoteChanged, uploaded }.
 * `localChanged`: the project zips to other bytes than at the last sync (or was never uploaded). `remoteChanged`: the zip in the artifact
 * changed since the last sync (someone uploaded); null when `client` is not given (the remote check needs a token).
 */
export async function syncState(dir, client = null) {
  const link = await readLink(dir);
  if (!link) return { linked: false };
  const key = projectZipKey(link.projectId), kept = link.attachments?.[key];
  const localChanged = !kept?.local || kept.local !== hash(await zipProject(dir));
  let remoteChanged = null;
  if (client) {
    const { byKey } = await remoteState(client, link);
    const remote = byKey.get(key);
    remoteChanged = Boolean(remote && (!kept || remote.binaryCode !== kept.binaryCode));
  }
  return { linked: true, localChanged, remoteChanged, uploaded: Boolean(kept) };
}

/** Downloads the zip of the project from the artifact over the project (after a backup). { ok, files, backup } or { missing } / { conflict }. */
export async function download(dir, client, { force = false } = {}) {
  const link = await readLink(dir);
  if (!link) throw new Error("The project is not linked to a Plus4U artifact.");
  const { artifact, byKey } = await remoteState(client, link);
  const zipKey = projectZipKey(link.projectId);
  const remote = byKey.get(zipKey);
  if (!remote) return { missing: true, artifactName: artifact?.name };
  const kept = link.attachments?.[zipKey];
  // the local project changed since the last sync and the remote one is the same as then: a download would only lose local work
  if (!force && kept && kept.binaryCode === remote.binaryCode && kept.local && kept.local !== hash(await zipProject(dir))) return { conflict: { key: zipKey, localChanged: true, ...who(remote) } };
  const { data } = await client.getFileData(link.oid, remote.oid);
  if (!data?.length) throw new Error("The attachment is empty.");
  let backup = null;
  if ((await projectFiles(dir)).length) { // an empty (new) project has nothing to keep
    await mkdir(path.join(dir, BACKUP_DIR), { recursive: true });
    backup = path.join(BACKUP_DIR, `before-download-${stamp()}.zip`);
    await writeFile(path.join(dir, backup), await zipProject(dir));
  }
  const files = await applyZip(dir, data);
  const fresh = await readLink(dir) ?? link; // the zip never carries the link, so it is still the local one
  await writeLink(dir, { ...fresh, name: artifact?.name ?? fresh.name, attachments: { ...fresh.attachments, [zipKey]: { ...record(remote), size: data.length, local: hash(await zipProject(dir)) } } });
  return { ok: true, files, backup, artifactName: artifact?.name };
}

const ZIP_KEY = /^uu5mock-project-([0-9a-zA-Z_-]+)$/;
/** The project name an uploaded zip was made from (`<project>.uu5mock.zip`), or null. */
export const projectNameOfZip = (fileName) => String(fileName ?? "").match(/^(.+)\.uu5mock\.zip$/i)?.[1]?.trim() || null;

/**
 * The projects uploaded to an artifact (`artifact` = parseArtifactUrl of it), newest first:
 * { name (of the artifact), attachments: Boolean, projects: [{ projectId, key, projectName, fileName, mts, uuIdentity, size }] }.
 */
export async function uploadedProjects(client, artifact) {
  const doc = await client.loadArtifact(artifact.oid);
  if (!doc?.uuEbcData?.uuBbAttachmentsCollectionOid) return { name: doc?.name ?? null, attachments: false, projects: [] };
  const { byKey } = await remoteState(client, { oid: artifact.oid });
  const projects = [...byKey].map(([key, f]) => [key.match(ZIP_KEY)?.[1], key, f]).filter(([id]) => id)
    .map(([projectId, key, f]) => ({ projectId, key, projectName: projectNameOfZip(f.name), fileName: f.name ?? null, mts: f.binaryMts ?? f.sys?.mts ?? null, uuIdentity: f.sys?.uuIdentity ?? null, size: f.size ?? null }))
    .sort((a, b) => String(b.mts ?? "").localeCompare(String(a.mts ?? "")));
  return { name: doc.name ?? null, attachments: true, projects };
}

/**
 * Fills a new, empty project folder from an artifact: links it (with the project id of the uploaded project, so Upload later updates the same
 * attachment) and downloads that project into it. Without `projectId` the project stays empty, only linked. { ok, files, artifactName }.
 */
export async function createFromArtifact(dir, client, artifact, { projectId = null, name = null } = {}) {
  if ((await projectFiles(dir)).length) throw new Error("The project folder is not empty.");
  await linkProject(dir, artifact, { name, projectId });
  if (!projectId) return { ok: true, files: 0, empty: true, artifactName: name };
  const r = await download(dir, client, { force: true });
  if (r.missing) throw new Error("The uploaded project is not in the document any more.");
  // the screens were uploaded together with that zip: they are in step too, so the first Upload does not send them all again
  const { byKey } = await remoteState(client, { oid: artifact.oid });
  const link = await readLink(dir), attachments = { ...link.attachments };
  for (const f of await screenNames(dir)) {
    const key = screenKey(projectId, f), remote = byKey.get(key);
    if (remote) attachments[key] = { ...record(remote), local: hash(await readFile(path.join(dir, f))) };
  }
  await writeLink(dir, { ...link, attachments });
  return { ok: true, files: r.files, artifactName: r.artifactName ?? name };
}
