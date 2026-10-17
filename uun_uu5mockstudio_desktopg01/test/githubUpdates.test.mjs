import test from "node:test";
import assert from "node:assert/strict";
import { parseTag, pickAsset, parseRelease, isRepoUrl, checkGithub, DEFAULT_REPO } from "../src/main/githubUpdates.mjs";

const asset = (name) => ({ name, browser_download_url: `https://github.com/${DEFAULT_REPO}/releases/download/v0.3.0/${name}`, size: 100 });
const ASSETS = [asset("uu5Mock-Studio-0.3.0-arm64.dmg"), asset("uu5Mock-Studio-0.3.0-arm64.zip"), asset("uu5Mock-Studio-0.3.0-x64.dmg"), asset("uu5Mock-Studio-0.3.0-x64.exe"), asset("uu5Mock-Studio-0.3.0-x86_64.AppImage")];
const release = (o = {}) => ({ tag_name: "v0.3.0", html_url: `https://github.com/${DEFAULT_REPO}/releases/tag/v0.3.0`, body: "Notes", draft: false, prerelease: false, assets: ASSETS, ...o });

test("parseTag drops the v", () => { assert.equal(parseTag("v0.2.1"), "0.2.1"); assert.equal(parseTag("0.2.1"), "0.2.1"); assert.equal(parseTag(" V1.0 "), "1.0"); });

test("pickAsset chooses the installer of this system and architecture", () => {
  assert.equal(pickAsset(ASSETS, "darwin", "arm64").name, "uu5Mock-Studio-0.3.0-arm64.dmg");
  assert.equal(pickAsset(ASSETS, "darwin", "x64").name, "uu5Mock-Studio-0.3.0-x64.dmg");
  assert.equal(pickAsset(ASSETS, "win32", "x64").name, "uu5Mock-Studio-0.3.0-x64.exe");
  assert.equal(pickAsset(ASSETS, "linux", "x64").name, "uu5Mock-Studio-0.3.0-x86_64.AppImage");
  assert.equal(pickAsset(ASSETS.filter((a) => !a.name.endsWith(".dmg")), "darwin", "arm64").name, "uu5Mock-Studio-0.3.0-arm64.zip", "the zip is the fallback on macOS");
  assert.equal(pickAsset([], "darwin", "arm64"), null);
});

test("parseRelease ignores drafts, pre-releases and releases without a version", () => {
  const ok = parseRelease(release(), { platform: "darwin", arch: "arm64" });
  assert.equal(ok.version, "0.3.0"); assert.equal(ok.notes, "Notes"); assert.match(ok.asset.url, /arm64\.dmg$/);
  assert.equal(parseRelease(release({ draft: true })), null); assert.equal(parseRelease(release({ prerelease: true })), null);
  assert.equal(parseRelease(release({ tag_name: "nightly" })), null); assert.equal(parseRelease(null), null);
});

test("only pages of this repository are opened", () => {
  assert.ok(isRepoUrl(`https://github.com/${DEFAULT_REPO}/releases/tag/v1`));
  for (const u of ["https://evil.example/UnicornUniversity/uun_uu5mockstudio/", `http://github.com/${DEFAULT_REPO}/x`, "https://github.com/other/repo/releases", `https://github.com.evil.example/${DEFAULT_REPO}/`, null, 5]) assert.ok(!isRepoUrl(u), String(u));
});

test("checkGithub: newer -> available, same or older -> current, problems -> a readable error and no exception", async () => {
  const ans = (status, json) => async () => ({ status, json });
  const base = { platform: "darwin", arch: "arm64" };
  const a = await checkGithub({ ...base, current: "0.2.0", fetchJson: ans(200, release()) });
  assert.equal(a.status, "available"); assert.equal(a.version, "0.3.0"); assert.match(a.asset.name, /arm64\.dmg$/);
  assert.deepEqual(await checkGithub({ ...base, current: "0.3.0", fetchJson: ans(200, release()) }), { status: "current", version: "0.3.0" });
  assert.equal((await checkGithub({ ...base, current: "0.10.0", fetchJson: ans(200, release({ tag_name: "v0.9.0" })) })).status, "current", "0.10.0 is newer than 0.9.0");
  assert.match((await checkGithub({ ...base, current: "0.2.0", fetchJson: ans(404, {}) })).message, /No release/);
  assert.match((await checkGithub({ ...base, current: "0.2.0", fetchJson: ans(403, {}) })).message, /limiting/);
  assert.match((await checkGithub({ ...base, current: "0.2.0", fetchJson: ans(500, {}) })).message, /500/);
  assert.match((await checkGithub({ ...base, current: "0.2.0", fetchJson: ans(200, release({ draft: true })) })).message, /could not be read/);
  assert.match((await checkGithub({ ...base, current: "0.2.0", fetchJson: async () => { throw new Error("offline"); } })).message, /Could not reach/);
  assert.match((await checkGithub({ ...base, current: "0.2.0", fetchJson: async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); } })).message, /in time/);
});

test("checkGithub asks the release API of the given repository (and of another API base in tests)", async () => {
  const urls = [];
  const fetchJson = async (u) => { urls.push(u); return { status: 200, json: release() }; };
  await checkGithub({ current: "0.2.0", fetchJson });
  await checkGithub({ current: "0.2.0", repo: "a/b", api: "http://127.0.0.1:1", fetchJson });
  assert.deepEqual(urls, [`https://api.github.com/repos/${DEFAULT_REPO}/releases/latest`, "http://127.0.0.1:1/repos/a/b/releases/latest"]);
});
