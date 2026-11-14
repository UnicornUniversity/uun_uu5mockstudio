import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAudience, scopeFor, decodeJwt, covers, isFresh, identityOf, authorizeUrl, readCallback, pick, remember, knownAudiences, PEOPLE_BASE_URI, EXPIRY_BUFFER_MS, imageType } from "../src/main/plus4uOidc.mjs";
import { initialsOf } from "../src/renderer/accountButton.js";

const MK = "https://uuapp.plus4u.net/uu-managementkit-maing02/38744216cb324edca986789798259ba9";
const jwt = (payload) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
const NOW = 1_800_000_000_000;
const exp = (minutes) => Math.floor(NOW / 1000) + minutes * 60;

test("normalizeAudience keeps the product and the awid of a uuApp address", () => {
  assert.equal(normalizeAudience(`${MK}/document?oid=66c81cfafbc8750023876be3`), MK);
  assert.equal(normalizeAudience(`${MK}/document/permissionSettings?oid=1&pageOid=2`), MK);
  assert.equal(normalizeAudience(`${MK}/keyTask?oid=67fd06ebee40441857666f4e`), MK);
  assert.equal(normalizeAudience(MK + "/"), MK);
  assert.equal(normalizeAudience("https://uuapp.plus4u.net/"), null);
  assert.equal(normalizeAudience("http://uuapp.plus4u.net/a/b"), null);
  assert.equal(normalizeAudience("not a url"), null);
});

test("scopeFor lists openid and each audience once", () => {
  assert.equal(scopeFor([`${MK}/document?oid=1`, MK, PEOPLE_BASE_URI]), `openid ${MK} ${PEOPLE_BASE_URI}`);
  assert.throws(() => scopeFor([]), /No Plus4U application/);
});

test("decodeJwt reads the payload and refuses junk", () => {
  assert.deepEqual(decodeJwt(jwt({ a: 1 })), { a: 1 });
  assert.equal(decodeJwt("x.y"), null);
  assert.equal(decodeJwt("a.!!!.c"), null);
});

test("covers and isFresh decide whether a token may be sent", () => {
  const t = jwt({ aud: [MK, PEOPLE_BASE_URI + "/"], exp: exp(30) });
  assert.ok(covers(t, `${MK}/document?oid=1`));
  assert.ok(covers(t, PEOPLE_BASE_URI));
  assert.ok(!covers(t, "https://uuapp.plus4u.net/uu-other-maing01/abc"));
  assert.ok(covers(jwt({ aud: MK }), MK));
  assert.ok(isFresh(t, NOW));
  assert.ok(!isFresh(jwt({ exp: Math.floor((NOW + EXPIRY_BUFFER_MS - 1000) / 1000) }), NOW));
  assert.ok(!isFresh(jwt({}), NOW));
});

test("identityOf takes the uuidentity key of the payload", () => {
  assert.deepEqual(identityOf(jwt({ uuidentity: "1-2345-1", name: "Jana Nováková" })), { uuIdentity: "1-2345-1", name: "Jana Nováková" });
  assert.deepEqual(identityOf(null, jwt({ sub: "9-9", given_name: "Petr", family_name: "Svoboda" })), { uuIdentity: "9-9", name: "Petr Svoboda" });
  assert.deepEqual(identityOf(jwt({ uuidentity: "7-7" })), { uuIdentity: "7-7", name: "7-7" });
  assert.equal(identityOf("junk", jwt({})), null);
});

test("authorizeUrl and readCallback round trip the code", () => {
  const url = new URL(authorizeUrl({ endpoint: "https://idp.example/authorize", clientId: "c", redirectUri: "http://localhost:5555", scope: `openid ${MK}`, challenge: "ch", state: "st", silent: true }));
  assert.equal(url.searchParams.get("scope"), `openid ${MK}`);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("prompt"), "none");
  assert.deepEqual(readCallback("http://localhost:5555/?code=abc&state=st", "http://localhost:5555", "st"), { code: "abc" });
  assert.match(readCallback("http://localhost:5555/?code=abc&state=other", "http://localhost:5555", "st").error, /does not belong/);
  assert.ok(readCallback("http://localhost:5555/?error=login_required&state=st", "http://localhost:5555", "st").silentFailed);
  assert.equal(readCallback("https://uuidentity.plus4u.net/login", "http://localhost:5555", "st"), null);
  assert.equal(readCallback("http://localhost:6666/?code=abc", "http://localhost:5555", "st"), null);
});

test("pick and remember keep the freshest usable token per audience", () => {
  const old = { access: jwt({ aud: [MK], exp: exp(5) }) };
  const both = { access: jwt({ aud: [MK, PEOPLE_BASE_URI], exp: exp(30) }) };
  const gone = { access: jwt({ aud: ["https://uuapp.plus4u.net/x/y"], exp: exp(-10) }) };
  let list = remember([], old, NOW);
  list = remember([...list, gone], both, NOW);
  assert.equal(list.length, 1, "the narrower and the expired tokens are dropped");
  assert.equal(pick(list, `${MK}/document?oid=1`, NOW), both.access);
  assert.equal(pick(list, "https://uuapp.plus4u.net/x/y", NOW), null);
  assert.deepEqual(knownAudiences(list), [MK, PEOPLE_BASE_URI]);
});

test("an opaque access token is judged by the claims of the id token", () => {
  const entry = { access: "opaque-token", id: jwt({ aud: ["bba2539821b16287a9ec6073617e23c3", PEOPLE_BASE_URI], exp: exp(29) }) };
  const list = remember([], entry, NOW);
  assert.deepEqual(list[0].audiences, [PEOPLE_BASE_URI]);
  assert.equal(pick(list, PEOPLE_BASE_URI, NOW), "opaque-token");
  assert.equal(pick(list, MK, NOW), null);
  assert.equal(pick(list, PEOPLE_BASE_URI, NOW + 40 * 60000), null);
});

test("an expired token with a refresh token is kept for renewal", () => {
  const entry = { access: "a1", id: jwt({ aud: [MK], exp: exp(-5) }), refresh: "r1" };
  const list = remember([remember([], entry, NOW - 3600e3)[0]], { access: "a2", id: jwt({ aud: [PEOPLE_BASE_URI], exp: exp(30) }) }, NOW);
  assert.equal(list.length, 2);
  assert.equal(list[0].refresh, "r1");
  assert.equal(pick(list, MK, NOW), null, "expired: renewed, not sent");
});

test("initialsOf gives up to two letters", () => {
  assert.equal(initialsOf("Jana Nováková"), "JN");
  assert.equal(initialsOf("  marek "), "M");
  assert.equal(initialsOf(""), "?");
});

test("imageType recognises pictures by their first bytes", () => {
  assert.equal(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(imageType(Buffer.from("GIF89a....")), "image/gif");
  assert.equal(imageType(Buffer.from("RIFF0000WEBPVP8 ")), "image/webp");
  assert.equal(imageType(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(imageType(Buffer.alloc(0)), null);
});

test("sessionOf: signed in only with a usable token, else expired with the name it had", async () => {
  const { sessionOf } = await import("../src/main/plus4uOidc.mjs");
  const id = (m) => jwt({ uuidentity: "6-11-1", name: "Marek", aud: [PEOPLE_BASE_URI], exp: exp(m) });
  const live = sessionOf([{ access: "opaque", id: id(30) }], NOW);
  assert.equal(live.signedIn, true); assert.equal(live.uuIdentity, "6-11-1");
  assert.equal(live.expiresAt, exp(30) * 1000 - EXPIRY_BUFFER_MS);
  assert.deepEqual(sessionOf([{ access: "opaque", id: id(-1) }], NOW), { signedIn: false, expired: true, uuIdentity: "6-11-1", name: "Marek" });
  assert.deepEqual(sessionOf([], NOW), { signedIn: false });
  assert.equal(sessionOf([{ access: "a", id: id(-5) }, { access: "b", id: id(10) }], NOW).signedIn, true);
});
