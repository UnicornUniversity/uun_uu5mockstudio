import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSignInRelay, isRelayable, shimScript } from "../src/main/signInRelay.mjs";
import { OIDC } from "../src/main/plus4uOidc.mjs";

const run = promisify(execFile);
const AUTH = `https://uuidentity.plus4u.net/uu-oidc-maing02/x/oidc/auth?client_id=c&redirect_uri=${encodeURIComponent("http://localhost:51234")}&response_type=code&scope=openid`;

test("only a Plus4U sign-in page answering to a loopback address is relayed", () => {
  assert.equal(isRelayable(AUTH, OIDC.issuer), true);
  assert.equal(isRelayable(AUTH.replace("uuidentity.plus4u.net", "evil.example"), OIDC.issuer), false);
  assert.equal(isRelayable(AUTH.replace(encodeURIComponent("http://localhost:51234"), encodeURIComponent("https://evil.example/cb")), OIDC.issuer), false);
  assert.equal(isRelayable("https://uuapp.plus4u.net/some/page", OIDC.issuer), false);
  assert.equal(isRelayable("not a url", OIDC.issuer), false);
});

test("the shim falls back to the real opener, or fails without one", () => {
  assert.match(shimScript("/usr/bin/open"), /exec "\/usr\/bin\/open" "\$@"/);
  assert.match(shimScript(null), /exit 1\n$/);
});

test("the open shim on the proxy's PATH hands a sign-in page to the app", { skip: process.platform === "win32" }, async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "relay-"));
  const got = [];
  const relay = await createSignInRelay({ dir, issuer: OIDC.issuer, onUrl: (u) => got.push(u) });
  t.after(() => relay.close());
  const env = { ...process.env, ...relay.env(`${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`) };
  await run(path.join(dir, "open"), [AUTH], { env });
  assert.deepEqual(got, [AUTH]);
  // a wrong secret is refused
  const bad = await fetch(env.STUDIO_SIGNIN_RELAY.replace(/[^/]+$/, "nope"), { method: "POST", body: AUTH });
  assert.equal(bad.status, 404);
  // a page that is not a Plus4U sign-in is not taken (the shim would run the real opener)
  const other = await fetch(env.STUDIO_SIGNIN_RELAY, { method: "POST", body: "https://example.com/" });
  assert.equal(other.status, 400);
  assert.equal(got.length, 1);
});

test("no relay on Windows", async () => {
  assert.equal(await createSignInRelay({ dir: os.tmpdir(), issuer: OIDC.issuer, onUrl: () => {}, platform: "win32" }), null);
});
