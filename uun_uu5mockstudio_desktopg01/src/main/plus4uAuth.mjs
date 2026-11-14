import http from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { OIDC, PEOPLE_BASE_URI, authorizeUrl, decodeJwt, imageType, identityOf, sessionOf, knownAudiences, normalizeAudience, pick, pkcePair, readCallback, remember, scopeFor } from "./plus4uOidc.mjs";

const LOGIN_TIMEOUT = 5 * 60 * 1000, SILENT_TIMEOUT = 15 * 1000, SILENT_LOGIN_WAIT = 4000, REQUEST_TIMEOUT = 60 * 1000;
const MAX_PHOTO = 5 * 1024 * 1024;

/**
 * The Plus4U sign-in of the app (see plus4uOidc.mjs): the sign-in page opens in an app window of the session `partition` (the one in which
 * the user signs in for the pictures of documents, so an existing Plus4U sign-in is reused and nothing has to be typed). The tokens are kept
 * encrypted by the operating system (`safeStorage`) in `file`, never handed to the renderer.
 *
 * `BrowserWindow` and `session` are Electron's (injected, so the module has no Electron import). `fetch` can be replaced in tests.
 */
export function createPlus4uAuth({ file, safeStorage, BrowserWindow, session, partition, fetch = globalThis.fetch, oidc = OIDC, parent, onChange = () => {} }) {
  let tokens = null; // [{ access, id, audiences, exp }]
  let metadata = null;
  let pending = null; // one sign-in at a time
  const photos = new Map(); // uuIdentity -> data URL

  async function load() {
    if (tokens) return tokens;
    try {
      const raw = await readFile(file, "utf8");
      const data = JSON.parse(safeStorage.decryptString(Buffer.from(raw.trim(), "base64")));
      tokens = Array.isArray(data?.tokens) ? data.tokens : [];
    } catch { tokens = []; }
    return tokens;
  }
  async function save(list) {
    tokens = list;
    queueMicrotask(onChange); // the account button and the toolbar look again
    if (!safeStorage.isEncryptionAvailable()) return; // kept for this run only
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, safeStorage.encryptString(JSON.stringify({ tokens: list })).toString("base64"), { mode: 0o600 });
  }

  async function request(url, opts = {}) {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    return res;
  }
  async function discovery() {
    if (metadata) return metadata;
    const res = await request(`${oidc.issuer}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`The Plus4U sign-in server did not answer (HTTP ${res.status}).`);
    return (metadata = await res.json());
  }

  /** Waits for the code at the loopback address: from the window (the redirect is caught before it loads) or from the small server. */
  function authorize({ scope, silent }) {
    return new Promise((resolve, reject) => {
      const { verifier, challenge } = pkcePair();
      const state = randomBytes(12).toString("base64url");
      let win = null, timer = null, done = false, redirectUri = "";
      const finish = (err, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { server.close(); } catch { /* not listening */ }
        if (win && !win.isDestroyed()) win.destroy();
        if (err) reject(err); else resolve(value);
      };
      const handle = (cb) => {
        if (!cb) return false;
        if (cb.code) finish(null, { code: cb.code, verifier, redirectUri });
        else finish(Object.assign(new Error(cb.error), { silentFailed: cb.silentFailed || silent }));
        return true;
      };
      const server = http.createServer((req, res) => {
        const cb = readCallback(new URL(req.url ?? "/", redirectUri).toString(), redirectUri, state);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<!doctype html><meta charset=utf-8><title>uu5Mock Studio</title><p style='font:15px system-ui;padding:24px'>You can close this window and return to uu5Mock Studio.</p>");
        handle(cb);
      });
      server.on("error", (e) => finish(new Error(`The sign-in could not start: ${e.message}`)));
      server.listen(0, async () => {
        try {
          redirectUri = `http://localhost:${server.address().port}`;
          const meta = await discovery();
          const url = authorizeUrl({ endpoint: meta.authorization_endpoint, clientId: oidc.clientId, redirectUri, scope, challenge, state });
          win = new BrowserWindow({ width: 520, height: 760, show: !silent, parent: silent ? undefined : parent?.(), title: "Sign in to Plus4U", autoHideMenuBar: true, webPreferences: { partition, sandbox: true, contextIsolation: true } });
          win.webContents.on("page-title-updated", (e) => e.preventDefault());
          const intercept = (e, u) => { const cb = readCallback(u, redirectUri, state); if (cb) { e.preventDefault(); handle(cb); } };
          win.webContents.on("will-redirect", intercept);
          win.webContents.on("will-navigate", intercept);
          win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
          // silent: no prompt=none (uuIdentity refuses it). The hidden window loads the login page; when it does not go on by itself within
          // SILENT_LOGIN_WAIT (it shows the choice of +4U Access / Google / … to a person), there is nothing to reuse.
          if (silent) win.webContents.on("did-navigate", (_e, u) => {
            let onLogin = false; try { onLogin = /\/login\b/.test(new URL(u).pathname); } catch { /* not a URL */ }
            if (onLogin) setTimeout(() => finish(Object.assign(new Error("No Plus4U sign-in to reuse."), { silentFailed: true })), SILENT_LOGIN_WAIT).unref?.();
          });
          win.on("closed", () => finish(Object.assign(new Error("The sign-in was cancelled."), { cancelled: true, silentFailed: silent })));
          if (process.env.STUDIO_PLUS4U_DEBUG) {
            win.webContents.on("did-navigate", (_e, u) => console.warn(`[plus4u] ${silent ? "silent" : "window"} at ${u.split("?")[0]}`));
            win.webContents.on("did-navigate-in-page", (_e, u) => console.warn(`[plus4u] ${silent ? "silent" : "window"} in-page ${u.split("?")[0]}`));
          }
          timer = setTimeout(() => finish(Object.assign(new Error(silent ? "The silent sign-in did not finish." : "The sign-in took too long."), { silentFailed: silent })), silent ? SILENT_TIMEOUT : LOGIN_TIMEOUT);
          await win.loadURL(url).catch((e) => { if (!done && !/ERR_ABORTED/.test(String(e?.message))) throw e; });
        } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); }
      });
    });
  }

  /** A call of the token endpoint: { access, id, refresh } or throws (scopeRejected / grantRejected tell why). */
  async function tokenRequest(params) {
    const meta = await discovery();
    const res = await request(meta.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ client_id: oidc.clientId, client_secret: oidc.clientSecret, ...params }),
    });
    const text = await res.text();
    let body = null; try { body = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error(`Plus4U refused the sign-in (HTTP ${res.status})${body?.error ? `: ${body.error_description || body.error}` : ""}.`), { scopeRejected: /invalid_(scope|target)/.test(text), grantRejected: /invalid_grant/.test(text) });
    const access = body?.access_token || body?.id_token;
    if (!access) throw new Error("Plus4U did not return a token.");
    if (process.env.STUDIO_PLUS4U_DEBUG) console.warn(`[plus4u] token response fields: ${Object.keys(body).join(",")}`);
    return { access, id: body?.id_token ?? null, refresh: body?.refresh_token ?? null };
  }
  const grant = ({ code, verifier, redirectUri }, scope) => tokenRequest({ grant_type: "authorization_code", code, scope, redirect_uri: redirectUri, code_verifier: verifier });

  /** One sign-in for a set of audiences; when several in one token are refused, one sign-in per audience (silently after the first). */
  let offline = true;
  async function signIn(audiences, { silent }) {
    // offline_access asks for a refresh token (then the token is renewed without any window); a server or client that refuses it gets the plain scope
    const once = async (auds, quiet, offline) => { const scope = scopeFor(auds) + (offline ? " offline_access" : ""); return grant(await authorize({ scope, silent: quiet }), scope); };
    const run = async (auds, quiet) => { try { return await once(auds, quiet, offline); } catch (e) { if (!offline || !(e.scopeRejected || /scope/i.test(e.message))) throw e; offline = false; return once(auds, quiet, false); } };
    let got;
    try { got = [await run(audiences, silent)]; } catch (e) {
      if (!e.scopeRejected || audiences.length < 2) throw e;
      got = [];
      for (const [i, a] of audiences.entries()) got.push(await run([a], silent || i > 0));
    }
    let list = await load();
    for (const t of got) list = remember(list, t);
    await save(list);
    return got;
  }

  /** Signs in (one at a time); `audiences` are added to those the app already holds tokens for. */
  function login({ audiences = [], silent = false } = {}) {
    if (pending) return pending;
    pending = (async () => {
      const list = await load();
      const auds = [...new Set([PEOPLE_BASE_URI, ...knownAudiences(list), ...audiences].map(normalizeAudience).filter(Boolean))];
      return signIn(auds, { silent });
    })().finally(() => { pending = null; });
    return pending;
  }

  /** Renews a token with a kept refresh token (no window), asking for `aud` too. Returns true when a token for `aud` was got. */
  async function refreshFor(aud) {
    const list = await load();
    for (const t of [...list].reverse().filter((x) => x.refresh)) {
      const auds = [...new Set([...(t.audiences ?? []), aud])];
      for (const scope of [scopeFor(auds) + " offline_access", null]) {
        try {
          const got = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh, ...(scope ? { scope } : {}) });
          await save(remember(await load(), { ...got, refresh: got.refresh ?? t.refresh }));
          if (pick(await load(), aud)) return true;
          break; // renewed, but not for this application: a refresh with this token cannot widen it
        } catch (e) {
          if (process.env.STUDIO_PLUS4U_DEBUG) console.warn(`[plus4u] refresh failed: ${e.message}`);
          if (e.grantRejected) { await save((await load()).filter((x) => x.refresh !== t.refresh)); break; } // revoked or expired
        }
      }
    }
    return false;
  }

  /**
   * An access token for the uuApp at `uri`: a kept one, else one renewed with a refresh token, else a silent sign-in (the existing Plus4U sign-in of the window session), else, when
   * `interactive`, the sign-in window. Throws { code: "login" } when the user has to sign in.
   */
  async function tokenFor(uri, { interactive = false } = {}) {
    const aud = normalizeAudience(uri);
    if (!aud) throw new Error(`This is not an address of a Plus4U application: ${uri}`);
    let t = pick(await load(), aud);
    if (t) return t;
    if (await refreshFor(aud).catch(() => false)) return pick(await load(), aud);
    try { await login({ audiences: [aud], silent: true }); } catch (e) { if (!interactive) throw Object.assign(new Error("Sign in to Plus4U first."), { code: "login", cause: e }); }
    t = pick(await load(), aud);
    if (t) return t;
    if (!interactive) throw Object.assign(new Error("Sign in to Plus4U first."), { code: "login" });
    await login({ audiences: [aud] });
    t = pick(await load(), aud);
    if (!t) throw new Error("The Plus4U sign-in did not give access to this application.");
    return t;
  }

  /** A kept, fresh token for the uuApp at `uri`, or null: never signs in (not even silently), so a background check opens no window. */
  async function peekToken(uri) { const aud = normalizeAudience(uri); return aud ? pick(await load(), aud) : null; }

  /** { signedIn, uuIdentity, name }: signed in = the app holds a token (an expired one is renewed silently when it is needed). */
  async function status() {
    const list = await load();
    if (process.env.STUDIO_PLUS4U_DEBUG) for (const t of list) for (const [k, v] of [["access", t.access], ["id", t.id]]) { const p = decodeJwt(v); if (p) console.warn(`[plus4u] ${k} claims: ${Object.keys(p).join(",")} aud=${JSON.stringify(p.aud)} scope=${JSON.stringify(p.scope ?? p.scp ?? null)} exp-in-min=${Math.round((p.exp * 1000 - Date.now()) / 60000)}`); }
    return sessionOf(list);
  }

  /** The photo of the signed-in person (or of `uuIdentity`) as a data URL, or null when there is none or it cannot be loaded. */
  async function photo(uuIdentity) {
    const st = await status();
    const who = uuIdentity || (st.signedIn ? st.uuIdentity : null);
    if (!who) return null;
    if (photos.has(who)) return photos.get(who);
    let token;
    const why = (msg) => { console.warn(`[plus4u] no photo: ${msg}`); return null; };
    try { token = await tokenFor(PEOPLE_BASE_URI); } catch (e) { return why(`no token for the people app (${e.cause?.message ?? e.message}); kept audiences: ${knownAudiences(await load()).join(", ")}`); }
    const res = await request(`${PEOPLE_BASE_URI}/personalCard/loadPhoto?uuIdentity=${encodeURIComponent(who)}`, { headers: { authorization: `Bearer ${token}`, accept: "*/*" } }).catch((e) => ({ ok: false, status: e.message, text: async () => "" }));
    if (!res?.ok) return why(`HTTP ${res?.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
    const type = String(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_PHOTO) return why(`size ${buf.length}`);
    const mime = imageType(buf) ?? (/^image\/(png|jpeg|gif|webp)$/.test(type) ? type : null); // the server sends application/octet-stream
    if (!mime) return why(`not a picture (${type})`);
    const url = `data:${mime};base64,${buf.toString("base64")}`;
    photos.set(who, url);
    return url;
  }

  /** Forgets the tokens and signs out of Plus4U in the window session too (else the next sign-in would pass without asking). */
  async function logout() {
    tokens = [];
    photos.clear();
    queueMicrotask(onChange);
    await rm(file, { force: true });
    try { await session.fromPartition(partition).clearStorageData({ origin: new URL(oidc.issuer).origin }); } catch { /* nothing to clear */ }
    return { signedIn: false };
  }

  return { login, logout, status, photo, tokenFor, peekToken };
}
