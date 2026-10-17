import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateRepo, listRepoFiles, isSecretPath, accessPolicy, listBranches, snapshotBranch } from "../src/main/repo.mjs";

async function makeRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-"));
  const git = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  await mkdir(path.join(dir, "src", "components"), { recursive: true });
  await writeFile(path.join(dir, "src", "components", "RoomList.jsx"), "export const RoomList = () => null;");
  await writeFile(path.join(dir, "src", "components", "RoomForm.tsx"), "export {};");
  await writeFile(path.join(dir, "README.md"), "# repo");
  await writeFile(path.join(dir, ".env"), "SECRET=1");
  await writeFile(path.join(dir, "logo.png"), "x");
  git("add", "-A"); git("commit", "-q", "-m", "init");
  return dir;
}

test("validateRepo finds the top level and the branch, also from a subfolder", async () => {
  const dir = await makeRepo();
  const r = await validateRepo(path.join(dir, "src"));
  assert.equal(path.basename(r.path), path.basename(dir)); assert.equal(r.branch, "main"); assert.equal(r.name, path.basename(dir));
});

test("validateRepo rejects folders that are not repositories or do not exist", async () => {
  const plain = await mkdtemp(path.join(os.tmpdir(), "plain-"));
  await assert.rejects(validateRepo(plain), /not inside a git repository/);
  await assert.rejects(validateRepo(path.join(plain, "nope")), /does not exist/);
});

test("listRepoFiles returns tracked source files matching the query, never secrets or binaries", async () => {
  const dir = await makeRepo();
  assert.deepEqual((await listRepoFiles(dir, "")).sort(), ["README.md", "src/components/RoomForm.tsx", "src/components/RoomList.jsx"]);
  assert.deepEqual(await listRepoFiles(dir, "roomlist"), ["src/components/RoomList.jsx"]);
  assert.deepEqual(await listRepoFiles(dir, "components room"), ["src/components/RoomForm.tsx", "src/components/RoomList.jsx"]);
  assert.deepEqual(await listRepoFiles(dir, ".env"), []);
});

test("isSecretPath", () => {
  for (const p of [".env", ".env.local", "a/.git/config", "node_modules/x/index.js", "keys/server.pem", "id_rsa", "home/.ssh/config", "credentials.json"]) assert.ok(isSecretPath(p), p);
  for (const p of ["src/App.jsx", "docs/env.md", "src/environment.js", "README.md"]) assert.ok(!isSecretPath(p), p);
});

test("accessPolicy: writes only in the project, reads also in the repository except secrets", () => {
  const cwd = "/p/Demo", repoDir = "/r/app";
  const allow = (tool, target, repo = repoDir) => accessPolicy({ cwd, repoDir: repo, tool, target }).behavior === "allow";
  assert.ok(allow("Write", "/p/Demo/a.html")); assert.ok(allow("Edit", "a.html"));
  assert.ok(!allow("Write", "/r/app/src/x.jsx")); assert.match(accessPolicy({ cwd, repoDir, tool: "Write", target: "/r/app/src/x.jsx" }).message, /linked repository is read-only/);
  assert.ok(allow("Read", "/r/app/src/components/RoomList.jsx")); assert.ok(allow("Glob", "/r/app/src")); assert.ok(allow("Grep", "/r/app"));
  assert.ok(!allow("Read", "/r/app/.env")); assert.ok(!allow("Read", "/r/app/.git/config")); assert.ok(!allow("Read", "/r/app/node_modules/x/index.js"));
  assert.ok(!allow("Read", "/r/app/src/x.jsx", null)); // no repository linked
  assert.ok(!allow("Read", "/etc/passwd")); assert.ok(allow("Read", "/p/Demo/BUSINESS_RULES.md"));
  assert.ok(allow("Read", "/r/app/../app/src/a.js")); assert.ok(!allow("Read", "/r/app/../other/a.js"));
  assert.equal(accessPolicy({ cwd, repoDir, tool: "WebFetch" }).behavior, "allow"); // no path to judge: unchanged behaviour
});

async function repoWithBranch() {
  const dir = await makeRepo();
  const git = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, stdio: "ignore" });
  git("switch", "-q", "-c", "feature/room-detail");
  await writeFile(path.join(dir, "src", "components", "RoomDetail.jsx"), "export const RoomDetail = () => null;");
  await writeFile(path.join(dir, "README.md"), "# repo on feature");
  git("add", "-A"); git("commit", "-q", "-m", "feature");
  git("switch", "-q", "main");
  await writeFile(path.join(dir, "README.md"), "# uncommitted change on main"); // the user's work in progress
  return dir;
}

test("listBranches puts the checked-out branch first and marks remote ones", async () => {
  const dir = await repoWithBranch();
  const r = await listBranches(dir);
  assert.equal(r.current, "main");
  assert.deepEqual(r.branches.map((b) => b.name), ["main", "feature/room-detail"]);
  assert.ok(r.branches.every((b) => b.remote === false));
});

test("listRepoFiles can list the files of another branch", async () => {
  const dir = await repoWithBranch();
  assert.ok(!(await listRepoFiles(dir, "roomdetail")).length);
  assert.deepEqual(await listRepoFiles(dir, "roomdetail", { ref: "feature/room-detail" }), ["src/components/RoomDetail.jsx"]);
});

test("snapshotBranch writes the branch's files to a separate folder and leaves the repository untouched", async () => {
  const dir = await repoWithBranch(), base = await mkdtemp(path.join(os.tmpdir(), "views-"));
  const dest = await snapshotBranch({ repoDir: dir, branch: "feature/room-detail", baseDir: base });
  assert.ok(dest.startsWith(base));
  assert.equal(await readFile(path.join(dest, "README.md"), "utf8"), "# repo on feature");
  assert.equal(await readFile(path.join(dest, "src", "components", "RoomDetail.jsx"), "utf8"), "export const RoomDetail = () => null;");
  assert.equal(await readFile(path.join(dir, "README.md"), "utf8"), "# uncommitted change on main"); // working tree and branch untouched
  assert.equal((await validateRepo(dir)).branch, "main");
  assert.equal(await snapshotBranch({ repoDir: dir, branch: "feature/room-detail", baseDir: base }), dest); // same folder again
  await assert.rejects(snapshotBranch({ repoDir: dir, branch: "nope", baseDir: base }), /not found/);
  await assert.rejects(snapshotBranch({ repoDir: dir, branch: "--output=/tmp/x", baseDir: base }), /Invalid branch/);
});
