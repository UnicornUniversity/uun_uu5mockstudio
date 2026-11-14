/**
 * The EBC (editable binary content: attachments) commands of a uuManagementKit artifact, called directly as uuCmd with the app's own
 * Plus4U token (the MCP tools of uuManagementKit only read attachments). The same commands as `ebc-client.js` of uuUniversityKit, with the
 * entity taken from the artifact address (`document`, `keyTask` …) instead of `uuOpenBusinessBrick`.
 *
 * dtoIn (as uuUniversityKit uses them): { oid, uuEbcData: { … } }; a binary goes as the multipart field `uuEbcData.data`. The use cases
 * are the current names (`file/get`, `file/getData`, `file/updateData`, `file/trash`): the `…ByOid` ones are legacy and only redirected.
 * `token()` resolves the bearer token; `fetch` can be replaced in tests.
 */
export function createEbcClient({ baseUri, entity, token, fetch = globalThis.fetch, timeout = 120000 }) {
  const url = (cmd) => `${baseUri.replace(/\/+$/, "")}/${entity}/ebc/${cmd}`;

  async function call(cmd, { method = "GET", dtoIn = {}, binary, raw = false } = {}) {
    const headers = { authorization: `Bearer ${await token()}`, accept: raw ? "*/*" : "application/json" };
    let target = url(cmd), body;
    if (method === "GET") {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(dtoIn)) q.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      if ([...q].length) target += `?${q}`;
    } else if (binary) {
      const m = multipart(dtoIn, binary);
      headers["content-type"] = m.contentType;
      body = m.body;
    } else {
      headers["content-type"] = "application/json";
      body = JSON.stringify(dtoIn);
    }
    const res = await fetch(target, { method, headers, body, signal: AbortSignal.timeout(timeout) });
    if (raw && res.ok) return { data: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") || "" };
    const text = await res.text();
    let out = null; try { out = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    if (!res.ok) throw uuError(res.status, out, text, cmd);
    return out ?? {};
  }

  return {
    call,
    /** The artifact itself (`<entity>/load`): name, state, uuEbcData.uuBbAttachmentsCollectionOid … */
    async loadArtifact(oid) {
      const res = await fetch(`${baseUri.replace(/\/+$/, "")}/${entity}/load?oid=${encodeURIComponent(oid)}`, { headers: { authorization: `Bearer ${await token()}`, accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
      const text = await res.text(); let out = null; try { out = JSON.parse(text); } catch { /* not JSON */ }
      if (!res.ok) throw uuError(res.status, out, text, `${entity}/load`);
      return out?.data ?? out;
    },
    /** The collections (folders) of attachments: { itemList } */
    listCollections: (oid) => call("collection/list", { dtoIn: { oid } }),
    /** All files of a collection (the server ignores a searchKey filter here, so the caller filters). */
    async listAllFiles(oid, collectionOid) {
      const all = [];
      for (let pageIndex = 0; pageIndex < 50; pageIndex++) {
        const r = await call("collection/listFiles", { dtoIn: { oid, uuEbcData: { collectionOid, pageInfo: { pageIndex, pageSize: 1000 } } } });
        all.push(...(r.itemList ?? []));
        const total = r.pageInfo?.total ?? all.length;
        if (all.length >= total || !(r.itemList ?? []).length) break;
      }
      return all;
    },
    getFile: (oid, fileOid) => call("file/get", { dtoIn: { oid, uuEbcData: { fileOid } } }),
    /** { data: Buffer, type } */
    getFileData: (oid, fileOid) => call("file/getData", { dtoIn: { oid, uuEbcData: { fileOid } }, raw: true }),
    /** { createdFile } */
    createFile: (oid, { collectionOid, searchKey, name }, binary) => call("collection/createFile", { method: "POST", dtoIn: { oid, uuEbcData: { collectionOid, searchKey, name } }, binary }),
    updateFileData: (oid, { fileOid, name }, binary) => call("file/updateData", { method: "POST", dtoIn: { oid, uuEbcData: { fileOid, name } }, binary }),
    trashFile: (oid, fileOid) => call("file/trash", { method: "POST", dtoIn: { oid, uuEbcData: { fileOid } } }),
  };
}

/**
 * The multipart body as uu_appg01 AppClient builds it (with the `form-data` package): every top-level key a field, an object as a field with
 * `Content-Type: application/json` and no file name, the binary last as the file `uuEbcData.data`. Built by hand: the web FormData would send
 * an object part as a file named "blob", which the server does not read as dtoIn. Returns { body: Buffer, contentType }.
 */
export function multipart(dtoIn, binary, boundary = `----uu5mock${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`) {
  const parts = [];
  const head = (lines) => Buffer.from(`--${boundary}\r\n${lines.join("\r\n")}\r\n\r\n`);
  const q = (v) => String(v).replace(/[\r\n"]/g, (c) => ({ "\r": "%0D", "\n": "%0A", '"': "%22" })[c]);
  for (const [k, v] of Object.entries(dtoIn ?? {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object") parts.push(head([`Content-Disposition: form-data; name="${q(k)}"`, "Content-Type: application/json"]), Buffer.from(JSON.stringify(v)), Buffer.from("\r\n"));
    else parts.push(head([`Content-Disposition: form-data; name="${q(k)}"`]), Buffer.from(String(v)), Buffer.from("\r\n"));
  }
  parts.push(head([`Content-Disposition: form-data; name="uuEbcData.data"; filename="${q(binary.name || "file.bin")}"`, `Content-Type: ${binary.type || "application/octet-stream"}`]), Buffer.from(binary.data), Buffer.from("\r\n"));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** An Error from a uuApp answer: the first message of its uuAppErrorMap, with the code and the HTTP status. */
export function uuError(status, body, text, cmd) {
  const map = body?.uuAppErrorMap ?? {};
  const [code, entry] = Object.entries(map).find(([, e]) => e?.type === "error") ?? Object.entries(map)[0] ?? [];
  const msg = entry?.message || (text ? String(text).slice(0, 200) : "") || `HTTP ${status}`;
  // invalid / missing keys of a dtoIn error say what to fix: "$.searchKey (The value must be dataKey.)"
  const pm = entry?.paramMap ?? {};
  const keys = [...Object.entries(pm.invalidValueKeyMap ?? {}), ...Object.entries(pm.missingKeyMap ?? {})].filter(([k]) => k !== "$").map(([k, v]) => `${k} (${Object.values(v ?? {})[0] ?? "invalid"})`);
  return Object.assign(new Error(`${cmd}: ${msg}${keys.length ? ` ${keys.join("; ")}` : ""}`), { status, code: code ?? null, uuAppErrorMap: map, paramMap: entry?.paramMap });
}
