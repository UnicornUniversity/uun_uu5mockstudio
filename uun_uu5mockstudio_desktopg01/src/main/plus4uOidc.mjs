import { randomBytes, createHash } from "node:crypto";

/**
 * Sign-in to Plus4U (uuIdentity OIDC) for the app's own calls of uuApps (uuManagementKit EBC, the photo of the person): pure helpers, no Electron.
 *
 * The client is the public one of the Plus4U MCP proxy `uu_aichat_mcputilityg01` (its src/lib/constants.js, `oidc.prod`): authorization code
 * with PKCE and a loopback redirect `http://localhost:<port>`. A token is issued for a set of audiences (`scope = "openid <aud> <aud>"`), the
 * base URIs of the uuApps it may call (`https://host/<product>/<awid>`). Kept in one place so it can be swapped for a client of the app's own.
 */
export const OIDC = {
  issuer: "https://uuidentity.plus4u.net/uu-oidc-maing02/bb977a99f4cc4c37a2afce3fd599d0a7/oidc",
  clientId: "bba2539821b16287a9ec6073617e23c3",
  clientSecret: "MG@EBz!UqzZqhAk4%L2X8-5_qMhW7Tf05@7s&pgF34137wuT+8v22kfW-ku30$10",
};

/** The uuApp that serves the photos of people (personalCard/loadPhoto), as Plus4U5Elements.PersonPhoto uses it. */
export const PEOPLE_BASE_URI = "https://uuapp.plus4u.net/uu-plus4upeople-maing01/56ac93ddb0034de8b8e4f4b829ff7d0f";

/** A token is treated as expired this long before its `exp`, so that a request in flight does not fail on arrival. */
export const EXPIRY_BUFFER_MS = 90 * 1000;

/**
 * The audience form of a uuApp address: `https://host/<product>/<awid>` (the use case, query and hash dropped), or null when the address
 * is not one of a uuApp. `https://uuapp.plus4u.net/uu-managementkit-maing02/<awid>/document?oid=…` → `https://uuapp.plus4u.net/uu-managementkit-maing02/<awid>`.
 */
export function normalizeAudience(uri) {
  try {
    const u = new URL(String(uri));
    if (u.protocol !== "https:") return null;
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg.length < 2) return null;
    return `${u.origin}/${seg[0]}/${seg[1]}`;
  } catch { return null; }
}

/** The OIDC scope for a set of audiences: `openid` and each audience once, in the given order. */
export function scopeFor(audiences) {
  const list = [...new Set((audiences ?? []).map(normalizeAudience).filter(Boolean))];
  if (!list.length) throw new Error("No Plus4U application to sign in for.");
  return ["openid", ...list].join(" ");
}

/** The payload of a JWT (not verified: it only tells the app who signed in and until when; the uuApps verify the token themselves), or null. */
export function decodeJwt(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
}

/** The audiences a token was issued for (its `aud` claim, normalized). */
export function audiencesOf(token) {
  const aud = decodeJwt(token)?.aud;
  return (Array.isArray(aud) ? aud : aud ? [aud] : []).map(normalizeAudience).filter(Boolean); // the client id is an audience too: not a uuApp
}

/** Whether a token may be sent to the uuApp at `uri` (one of its audiences is the base URI of that uuApp). */
export function covers(token, uri) {
  const want = normalizeAudience(uri);
  return Boolean(want) && audiencesOf(token).includes(want);
}

/** Whether a token is still usable at `now` (its `exp` minus the buffer). A token without `exp` is not trusted. */
export function isFresh(token, now = Date.now()) {
  const exp = Number(decodeJwt(token)?.exp);
  return Number.isFinite(exp) && exp * 1000 - EXPIRY_BUFFER_MS > now;
}

/**
 * Who signed in, from the payload of the id token or the access token: { uuIdentity, name } or null. The key of the identity is `uuidentity`
 * (uuIdentity OIDC); `sub` is the fallback. The name is `name`, else the given and family name.
 */
export function identityOf(...tokens) {
  for (const t of tokens) {
    const p = decodeJwt(t);
    if (!p) continue;
    const uuIdentity = String(p.uuidentity ?? p.uuIdentity ?? p.sub ?? "").trim();
    if (!uuIdentity) continue;
    const name = String(p.name ?? [p.given_name, p.family_name].filter(Boolean).join(" ") ?? "").trim();
    return { uuIdentity, name: name || uuIdentity };
  }
  return null;
}

/** A PKCE pair: { verifier, challenge } (S256). */
export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** The address of the sign-in page. `silent` asks the OIDC server not to show any page (prompt=none): it answers from the existing sign-in or with an error. */
export function authorizeUrl({ endpoint, clientId = OIDC.clientId, redirectUri, scope, challenge, state, silent = false }) {
  const u = new URL(endpoint);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", scope);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (state) u.searchParams.set("state", state);
  if (silent) u.searchParams.set("prompt", "none");
  return u.toString();
}

/**
 * What the OIDC server sent back to the redirect address: { code } or { error }, or null when `url` is not the redirect address at all.
 * uuIdentity reports a failure as `uuAppErrorMap`, standard servers as `error` (+ `error_description`).
 */
export function readCallback(url, redirectUri, state) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  const r = new URL(redirectUri);
  if (u.origin !== r.origin || u.pathname.replace(/\/+$/, "") !== r.pathname.replace(/\/+$/, "")) return null;
  const p = u.searchParams;
  if (state && p.get("state") && p.get("state") !== state) return { error: "The answer of the sign-in does not belong to this sign-in." };
  if (p.get("code")) return { code: p.get("code") };
  const err = p.get("error_description") || p.get("error") || p.get("uuAppErrorMap") || "The sign-in did not return a code.";
  return { error: err, silentFailed: ["login_required", "interaction_required", "consent_required"].includes(p.get("error")) };
}

/**
 * The tokens kept by the app: a list of { access, id, refresh, audiences, exp }. uuIdentity gives an opaque access token and the claims (aud, exp) only
 * in the id token, so `claimsOf(entry)` is the JWT to read them from: the access token when it is one, else the id token.
 */
export const claimsOf = (t) => (decodeJwt(t?.access) ? t.access : t?.id ?? null);

/** The freshest usable access token for the uuApp at `uri` from the kept list, or null. */
export function pick(list, uri, now = Date.now()) {
  return (list ?? []).filter((t) => t?.access && covers(claimsOf(t), uri) && isFresh(claimsOf(t), now))
    .sort((a, b) => (decodeJwt(claimsOf(b))?.exp ?? 0) - (decodeJwt(claimsOf(a))?.exp ?? 0))[0]?.access ?? null;
}

/** Adds a token to the list: replaces those whose audiences it covers all of, drops the expired ones. */
export function remember(list, entry, now = Date.now()) {
  const auds = audiencesOf(claimsOf(entry));
  // an expired token stays while it has a refresh token (it renews without a window); one whose audiences the new one covers goes
  const kept = (list ?? []).filter((t) => t?.access && (isFresh(claimsOf(t), now) || t.refresh) && !audiencesOf(claimsOf(t)).every((a) => auds.includes(a)));
  return [...kept, { access: entry.access, id: entry.id ?? null, refresh: entry.refresh ?? null, audiences: auds, exp: decodeJwt(claimsOf(entry))?.exp ?? null }];
}

/** All the audiences of the kept tokens (so that a new sign-in asks for them again and one token keeps serving everything). */
export const knownAudiences = (list) => [...new Set((list ?? []).flatMap((t) => t?.audiences ?? []))];

/** The type of a picture from its first bytes (PNG, JPEG, GIF, WebP), or null. SVG is not accepted: it can carry scripts. */
export function imageType(buf) {
  const b = Buffer.from(buf ?? []);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/**
 * The sign-in as the user should see it: signed in only while some kept token is still usable. { signedIn: true, uuIdentity, name, expiresAt }
 * (expiresAt: ms when the last usable token stops being usable), { signedIn: false, expired: true, uuIdentity, name } when only expired
 * tokens are kept (the app knows who it was), else { signedIn: false }.
 */
export function sessionOf(list, now = Date.now()) {
  const all = (list ?? []).filter((t) => t?.access);
  const fresh = all.filter((t) => isFresh(claimsOf(t), now));
  const newest = (l) => [...l].sort((a, b) => (decodeJwt(claimsOf(b))?.exp ?? 0) - (decodeJwt(claimsOf(a))?.exp ?? 0))[0];
  if (fresh.length) {
    const t = newest(fresh), who = identityOf(t.id, t.access);
    if (who) return { signedIn: true, ...who, expiresAt: decodeJwt(claimsOf(t)).exp * 1000 - EXPIRY_BUFFER_MS };
  }
  const old = all.length ? identityOf(newest(all).id, newest(all).access) : null;
  return old ? { signedIn: false, expired: true, ...old } : { signedIn: false };
}
