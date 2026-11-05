import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { KINDS, PROXY_PACKAGE, STATUS_TOOL, LOGIN_TOOL, parseDocUrl, loadArgs, snapshotName, readTerritory, presetsFor, serverUrl, resultData, toSnapshot, sourcesPrompt, agentTools, sourcePage, imageRefs, fileLink, localizeImages, ASSETS_DIR, IMAGE_EXT, truncatedSections, completeSection } from "./docSources.mjs";

const run = promisify(execFile);
export const NPM_REGISTRY = "https://repo.plus4u.net/repository/public-javascript";
export const SOURCES_DIR = path.join(".studio", "sources");
const MAX_IMAGE = 15 * 1024 * 1024;
const LOAD_TIMEOUT = 120000, LOGIN_TIMEOUT = 5 * 60 * 1000 + 15000, CONNECT_TIMEOUT = 120000; // the first npx run downloads the proxy

let npxCached;
/** `npx` of the user (GUI apps have no shell PATH): STUDIO_NPX_BIN, then what a login shell finds, then the common locations. */
export async function findNpx({ refresh = false } = {}) {
  if (process.env.STUDIO_NPX_BIN) return existsSync(process.env.STUDIO_NPX_BIN) ? process.env.STUDIO_NPX_BIN : undefined;
  if (npxCached && !refresh && existsSync(npxCached)) return npxCached;
  npxCached = undefined;
  try {
    const out = process.platform === "win32"
      ? (await run("where", ["npx"], { timeout: 8000 })).stdout
      : (await run(process.env.SHELL || "/bin/zsh", ["-lc", "command -v npx"], { timeout: 8000 })).stdout;
    const hit = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l && existsSync(l));
    if (hit) return (npxCached = hit);
  } catch { /* no login shell */ }
  const home = os.homedir();
  return (npxCached = ["/opt/homebrew/bin/npx", "/usr/local/bin/npx", path.join(home, ".volta/bin/npx"), path.join(home, ".local/bin/npx")].find(existsSync));
}

/**
 * How to start the proxy of one kind: { command, args, env } (PATH with the folder of npx first, so that its `node` is found), or { error }.
 * `error` is "territory" when no territory is chosen yet and "npx" when Node.js is missing.
 */
export async function serverSpec(kind, { store = readTerritory(), npx } = {}) {
  const k = KINDS[kind];
  if (!k) return { error: `Unknown kind of document: ${kind}` };
  const r = serverUrl(kind, store, presetsFor(k.plugin));
  if (r.error) return { error: r.error };
  const bin = npx ?? (await findNpx());
  if (!bin) return { error: "npx" };
  const PATH = [path.dirname(bin), process.env.PATH].filter(Boolean).join(path.delimiter);
  // the proxy is published on the npm registry of Plus4U, not on npmjs.org: name it, so that it does not depend on the user's .npmrc
  return { command: bin, args: ["-y", PROXY_PACKAGE], env: { SERVER_URL: r.url, PATH, npm_config_registry: process.env.STUDIO_NPM_REGISTRY || NPM_REGISTRY }, source: r.source };
}

/** Whether a project holds a snapshot of a document (then the agent gets the MCP servers too). */
export async function hasSources(projectDir) {
  try { return (await readdir(path.join(projectDir, SOURCES_DIR))).some((f) => f.endsWith(".md")); } catch { return false; }
}

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} did not answer in ${Math.round(ms / 1000)} s.`)), ms).unref?.())]);
const textOf = (res) => (res?.content ?? []).filter((c) => c?.type === "text").map((c) => c.text).join("\n");
/** A closed connection says nothing by itself: the last lines the proxy wrote say why (npm could not install it, no keychain …). */
export function explain(e, conn) {
  if (!/-32000|Connection closed/i.test(String(e?.message))) return e;
  const lines = String(conn?.stderr ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !/^npm notice/.test(l));
  const npm404 = lines.find((l) => /E404|404 Not Found/.test(l));
  const why = npm404 ? `npm could not find ${PROXY_PACKAGE} (${npm404.replace(/^npm error\s*/, "")})` : lines.slice(-3).join(" ");
  return new Error(`The Plus4U MCP proxy stopped${why ? `: ${why}` : "."}`);
}
const isAuthError = (msg) => /authenticat|unauthori[sz]ed|\b401\b|login|token/i.test(String(msg));

/**
 * Reads documents of Plus4U for the chat: one MCP client per kind and server URL (the proxy process stays up while the app runs),
 * only the load tool and the status / login tools of the proxy are called. `spec(kind)` can be replaced in tests.
 */
export function createDocFetcher({ spec = serverSpec, clientInfo = { name: "uu5mock-studio", version: "1" } } = {}) {
  const clients = new Map(); // key -> Promise<{ client, transport }>

  async function connect(kind) {
    const s = await spec(kind);
    if (s.error) throw Object.assign(new Error(s.error), { code: s.error === "territory" || s.error === "npx" ? s.error : "config" });
    const key = `${kind} ${s.env?.SERVER_URL}`;
    if (!clients.has(key)) {
      const p = (async () => {
        const transport = new StdioClientTransport({ command: s.command, args: s.args, env: { ...process.env, ...s.env }, stderr: "pipe" });
        const conn = { transport, source: s.source, stderr: "" };
        transport.stderr?.on("data", (d) => { conn.stderr = (conn.stderr + d).slice(-4000); });
        conn.client = new Client(clientInfo);
        await withTimeout(conn.client.connect(transport), CONNECT_TIMEOUT, "The Plus4U MCP proxy").catch((e) => { throw explain(e, conn); });
        transport.onclose = () => clients.delete(key);
        return conn;
      })();
      clients.set(key, p);
      p.catch(() => clients.delete(key));
    }
    return clients.get(key);
  }

  async function call(kind, name, args = {}, timeout = LOAD_TIMEOUT) {
    const conn = await connect(kind);
    return withTimeout(conn.client.callTool({ name, arguments: args }, undefined, { timeout }), timeout + 1000, `The tool ${name}`).catch((e) => { throw explain(e, conn); });
  }

  /** Whether the proxy holds a Plus4U token ({ signedIn, error? }); never opens a browser. */
  async function status(kind) {
    try {
      const st = JSON.parse(textOf(await call(kind, STATUS_TOOL, {}, 30000)) || "{}");
      return { signedIn: Boolean(st?.token?.present) };
    } catch (e) { return { signedIn: false, error: e.code ?? String(e.message ?? e) }; }
  }

  /**
   * Downloads the pictures of a document into <project>/.studio/sources/assets/<fileOid>.<ext> (the load tool of the attachments gives a signed
   * link of the binary store). Best effort: a picture that cannot be loaded stays out. Returns { <fileOid>: { path, name } }.
   */
  async function downloadImages(projectDir, doc, raw, { download = fetch } = {}) {
    const k = KINDS[doc.kind], ids = k.fileTool ? imageRefs(raw) : [];
    const out = {};
    if (!ids.length) return out;
    const dir = path.join(projectDir, SOURCES_DIR, ASSETS_DIR);
    await mkdir(dir, { recursive: true });
    const { pageOid, ...target } = loadArgs(doc); // attachments belong to the document, not to a page
    const one = async (oid) => {
      try {
        const res = await call(doc.kind, k.fileTool, { ...target, fileOid: oid }, 60000);
        if (res?.isError) return;
        const link = fileLink(resultData(res));
        const ext = link && IMAGE_EXT[link.contentType.split(";")[0].trim().toLowerCase()];
        if (!ext) return;
        const r = await download(link.url, { signal: AbortSignal.timeout(60000) });
        if (!r.ok) return;
        const buf = Buffer.from(await r.arrayBuffer());
        if (!buf.length || buf.length > MAX_IMAGE) return;
        await writeFile(path.join(dir, `${oid}.${ext}`), buf);
        // an absolute path on the preview server: the uu5 page sets <base href> to its own folder, a relative one would miss
        out[oid] = { path: `/${encodeURIComponent(path.basename(projectDir))}/${SOURCES_DIR.split(path.sep).join("/")}/${ASSETS_DIR}/${oid}.${ext}`, file: path.join(dir, `${oid}.${ext}`), name: link.name };
      } catch { /* the picture stays out */ }
    };
    for (let i = 0; i < ids.length; i += 3) await Promise.all(ids.slice(i, i + 3).map(one));
    return out;
  }

  /**
   * Loads the whole content of the sections the load tool cut short (uuManagementKit: 20 000 characters a section), so that the snapshot
   * and the rendered page hold valid uu5Strings. Best effort: a section that cannot be loaded stays as it was.
   */
  async function completeTruncated(doc, data) {
    const tool = KINDS[doc.kind]?.sectionTool;
    if (!tool || !data || typeof data !== "object") return;
    const cut = truncatedSections(data);
    const one = async (section) => {
      try {
        const r = await call(doc.kind, tool, { sectionOid: section.sectionOid, documentUrl: doc.url, targetAwid: doc.awid }, LOAD_TIMEOUT);
        if (r?.isError) return;
        const d = resultData(r);
        completeSection(section, typeof d === "string" ? d : d?.content ?? d?.contentUu5String);
      } catch { /* stays cut */ }
    };
    for (let i = 0; i < cut.length; i += 3) await Promise.all(cut.slice(i, i + 3).map(one));
  }

  /** Signs in to Plus4U: the proxy opens the login page in the browser and waits for it. */
  async function login(kind) {
    try {
      const res = await call(kind, LOGIN_TOOL, {}, LOGIN_TIMEOUT);
      return res?.isError ? { error: textOf(res) || "The sign-in failed." } : { ok: true };
    } catch (e) { return { error: e.code ?? String(e.message ?? e) }; }
  }

  /**
   * Loads the document of `url` and saves its snapshot to <project>/.studio/sources/<name>.md (+ .json with the metadata).
   * { ok, kind, label, url, title, sections, file } or { error: "login" | "territory" | "npx" | message, kind? }. Without `allowLogin`
   * a missing token is reported instead of opening the browser.
   */
  async function fetchDoc(projectDir, url, { allowLogin = false, ...opts } = {}) {
    const doc = parseDocUrl(url);
    if (!doc) return { error: "This is not a link to a uuBookKit page or a uuManagementKit document." };
    const k = KINDS[doc.kind];
    try {
      if (!allowLogin) {
        const st = await status(doc.kind);
        if (st.error) return { error: st.error, kind: doc.kind };
        if (!st.signedIn) return { error: "login", kind: doc.kind };
      }
      const res = await call(doc.kind, k.loadTool, loadArgs(doc), allowLogin ? LOGIN_TIMEOUT : LOAD_TIMEOUT);
      if (res?.isError) { const msg = textOf(res) || "The document could not be loaded."; return { error: isAuthError(msg) && !allowLogin ? "login" : msg, kind: doc.kind }; }
      const { source } = await connect(doc.kind);
      const data = resultData(res);
      await completeTruncated(doc, data);
      const fetchedAt = new Date().toISOString();
      const snap = toSnapshot(doc, data, { fetchedAt, territory: String(source ?? "").replace(/^preset:/, "") });
      const dir = path.join(projectDir, SOURCES_DIR), name = snapshotName(doc), file = path.join(dir, `${name}.md`);
      await mkdir(dir, { recursive: true });
      await writeFile(file, snap.markdown);
      // the document rendered by uu5 as Plus4U shows it (.studio/sources/<name>.html, not a screen of the canvas) and a picture of it
      const metaFile = path.join(dir, `${name}.json`);
      const prev = await readFile(metaFile, "utf8").then(JSON.parse).catch(() => null);
      if (prev?.screen && /^source-[\w-]+$/.test(prev.screen)) await rm(path.join(projectDir, `${prev.screen}.html`), { force: true }); // made by an earlier version as a screen
      const images = await downloadImages(projectDir, doc, snap.raw, { download: opts.download });
      const page = path.join(dir, `${name}.html`);
      await writeFile(page, sourcePage({ title: snap.title, url: doc.url, kind: doc.kind, raw: localizeImages(snap.raw, images) }));
      let shot = null, thumb = null;
      if (opts.capture) {
        const pic = await opts.capture(path.relative(projectDir, page)).catch(() => null);
        if (pic?.full) { shot = path.join(dir, `${name}.jpg`); await writeFile(shot, pic.full); thumb = pic.thumb ?? null; }
      }
      await writeFile(metaFile, JSON.stringify({ url: doc.url, kind: doc.kind, title: snap.title, fetchedAt, territory: source ?? null, page: `${name}.html`, shot: shot ? `${name}.jpg` : null, sections: snap.sections.map((s) => s.title) }, null, 2));
      if (Object.keys(images).length) await writeFile(file, `${snap.markdown}\n## Pictures (downloaded, in .studio/sources)\n\n${Object.entries(images).map(([oid, im]) => `- ${oid} → ${im.file} (${im.name})`).join("\n")}\n`);
      return { ok: true, kind: doc.kind, label: k.label, url: doc.url, title: snap.title, sections: snap.sections, file, page, shot, thumb, images: Object.keys(images).length };
    } catch (e) {
      const code = e.code === "territory" || e.code === "npx" ? e.code : null;
      return { error: code ?? (isAuthError(e.message) && !allowLogin ? "login" : String(e.message ?? e)), kind: doc.kind };
    }
  }

  /** Ends the proxies (on quit, or when the territory changes). */
  async function close() {
    const all = [...clients.values()];
    clients.clear();
    await Promise.all(all.map((p) => p.then(({ client }) => client.close()).catch(() => {})));
  }

  /** Signs in for the kind of document of `url` (the card shows "waiting for the sign-in" only while this runs, then the loading). */
  async function loginFor(url) {
    const doc = parseDocUrl(url);
    if (!doc) return { error: "This is not a link to a uuBookKit page or a uuManagementKit document." };
    return login(doc.kind);
  }

  return { fetchDoc, status, login, loginFor, close };
}

/** The snapshots of a project: [{ file, title, url, kind }] (newest first). */
export async function listSources(projectDir) {
  const dir = path.join(projectDir, SOURCES_DIR);
  let names = [];
  try { names = (await readdir(dir)).filter((f) => f.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const n of names) {
    try {
      const meta = JSON.parse(await readFile(path.join(dir, n), "utf8"));
      out.push({ file: path.join(dir, n.replace(/\.json$/, ".md")), title: String(meta.title ?? ""), url: String(meta.url ?? ""), kind: String(meta.kind ?? ""), ...(meta.shot ? { shot: path.join(dir, meta.shot) } : {}), at: String(meta.fetchedAt ?? "") });
    } catch { /* a broken file */ }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20).map(({ at, ...s }) => s);
}

/**
 * The MCP servers of the documents for the agent ({ <server>: { command, args, env } }), only for the kinds the project has snapshots
 * of: starting npx for every request of every project would only slow the agent down.
 */
export async function docMcpServers(sources, { spec = serverSpec } = {}) {
  const out = {};
  for (const kind of new Set(sources.map((s) => s.kind))) {
    if (!KINDS[kind]) continue;
    const s = await spec(kind).catch(() => ({ error: "spec" }));
    if (!s.error) out[KINDS[kind].server] = { command: s.command, args: s.args, env: s.env };
  }
  return out;
}

/** Everything the providers need about the documents of a project: { prompt, servers, readTools: { <server>: [tools] } }. */
export async function docAgentSetup(projectDir, opts) {
  const sources = await listSources(projectDir);
  if (!sources.length) return { prompt: "", servers: {}, readTools: {} };
  const servers = await docMcpServers(sources, opts);
  const readTools = Object.fromEntries(Object.entries(KINDS).filter(([, k]) => servers[k.server]).map(([kind, k]) => [k.server, agentTools(kind)]));
  return { prompt: sourcesPrompt(sources, Object.keys(servers)), servers, readTools };
}
