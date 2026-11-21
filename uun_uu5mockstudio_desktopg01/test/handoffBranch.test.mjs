import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { commitToBranch, branchName } from "../src/main/handoffBranch.mjs";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-repo-"));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "dev@example.com"], dir); git(["config", "user.name", "Dev"], dir);
  fs.writeFileSync(path.join(dir, "README.md"), "hello\n");
  git(["add", "."], dir); git(["commit", "-q", "-m", "init"], dir);
  fs.writeFileSync(path.join(dir, "wip.txt"), "unfinished work\n"); // the user's uncommitted work must survive
  return dir;
}

test("the package lands on a new branch while the checkout, its branch and uncommitted work stay as they were", async () => {
  const repo = makeRepo(), work = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-wt-"));
  try {
    const r = await commitToBranch({ repoDir: repo, branch: "feature/thesis-header", files: { ".uu5mock/handoff/x/HANDOFF.md": "# spec\n", ".claude/commands/build-handoff.md": "cmd\n" }, replace: [".uu5mock/handoff/x"], message: "handoff", workRoot: work });
    assert.equal(r.created, true); assert.equal(r.changed, true); assert.equal(r.base, "main");
    assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], repo), "main");
    assert.equal(fs.readFileSync(path.join(repo, "wip.txt"), "utf8"), "unfinished work\n");
    assert.ok(!fs.existsSync(path.join(repo, ".uu5mock")));
    assert.match(git(["status", "--porcelain"], repo), /^\?\? wip\.txt$/);
    assert.deepEqual(git(["ls-tree", "-r", "--name-only", "feature/thesis-header"], repo).split("\n").sort(), [".claude/commands/build-handoff.md", ".uu5mock/handoff/x/HANDOFF.md", "README.md"]);
    assert.equal(git(["log", "-1", "--format=%an", "feature/thesis-header"], repo), "Dev");
    assert.equal(git(["worktree", "list"], repo).split("\n").length, 1); // the temporary worktree is gone

    // a second handoff: a new commit on the same branch; a screen removed from the package disappears; the same files again change nothing
    const again = await commitToBranch({ repoDir: repo, branch: "feature/thesis-header", files: { ".uu5mock/handoff/x/HANDOFF.md": "# spec v2\n" }, replace: [".uu5mock/handoff/x"], message: "handoff 2", workRoot: work });
    assert.equal(again.created, false); assert.equal(again.changed, true);
    assert.equal(git(["show", "feature/thesis-header:.uu5mock/handoff/x/HANDOFF.md"], repo), "# spec v2");
    const same = await commitToBranch({ repoDir: repo, branch: "feature/thesis-header", files: { ".uu5mock/handoff/x/HANDOFF.md": "# spec v2\n" }, replace: [".uu5mock/handoff/x"], message: "handoff 3", workRoot: work });
    assert.equal(same.changed, false); assert.equal(same.commit, again.commit);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(work, { recursive: true, force: true }); }
});

test("a branch checked out in the working copy and an invalid name are refused with a readable error", async () => {
  const repo = makeRepo(), work = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-wt-"));
  try {
    await assert.rejects(commitToBranch({ repoDir: repo, branch: "main", files: { "a.md": "x" }, message: "m", workRoot: work }), /checked out/);
    await assert.rejects(branchName("feature/bad name", repo), /cannot be a branch name/);
    await assert.rejects(branchName("-x", repo), /cannot be a branch name/);
    await assert.rejects(commitToBranch({ repoDir: repo, branch: "feature/x", files: { "../escape.md": "x" }, message: "m", workRoot: work }), /outside/);
    assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], repo), "main");
  } finally { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(work, { recursive: true, force: true }); }
});

test("a branch can start from a remote branch (without tracking it), and a local branch behind its remote is told", async () => {
  const { fetchRemotes, baseStatus } = await import("../src/main/handoffBranch.mjs");
  const origin = makeRepo(), work = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-wt-")), clone = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-clone-"));
  try {
    execFileSync("git", ["clone", "-q", origin, clone]);
    git(["config", "user.email", "dev@example.com"], clone); git(["config", "user.name", "Dev"], clone);
    fs.writeFileSync(path.join(origin, "new.md"), "newer\n"); git(["add", "new.md"], origin); git(["commit", "-q", "-m", "newer on origin"], origin);
    assert.equal(await baseStatus(clone, "main").then((s) => s.behind), 0); // not fetched yet: the clone does not know
    assert.deepEqual((await fetchRemotes(clone)).remotes, ["origin"]);
    assert.deepEqual(await baseStatus(clone, "main"), { upstream: "origin/main", behind: 1, ahead: 0 });
    assert.equal(await baseStatus(clone, "origin/main"), null);
    const r = await commitToBranch({ repoDir: clone, branch: "feature/x", base: "origin/main", files: { "h.md": "x" }, message: "handoff", workRoot: work });
    assert.equal(r.base, "origin/main");
    assert.equal(git(["show", "feature/x:new.md"], clone), "newer"); // started from the remote's newer commit
    const upstream = (() => { try { return execFileSync("git", ["config", "--get", "branch.feature/x.merge"], { cwd: clone, encoding: "utf8" }).trim(); } catch { return ""; } })(); // exits 1 when not set
    assert.equal(upstream, "", "the new branch does not track origin/main");
  } finally { for (const d of [origin, work, clone]) fs.rmSync(d, { recursive: true, force: true }); }
});

test("the folder of the branch: a worktree next to the repository, reused when the branch is already out somewhere", async () => {
  const { ensureWorkspace } = await import("../src/main/handoffBranch.mjs");
  const repo = makeRepo(), work = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-wt-"));
  try {
    await commitToBranch({ repoDir: repo, branch: "feature/header", files: { "h.md": "x" }, message: "m", workRoot: work });
    const w = await ensureWorkspace(repo, "feature/header", "header");
    assert.equal(w.created, true); assert.equal(w.path, `${fs.realpathSync(repo)}-header`);
    assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], w.path), "feature/header");
    assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], repo), "main"); // the working copy is not switched
    const again = await ensureWorkspace(repo, "feature/header", "header");
    assert.equal(again.created, false); assert.equal(fs.realpathSync(again.path), fs.realpathSync(w.path));
    await assert.rejects(ensureWorkspace(repo, "feature/none", "x"), /does not exist/);
    git(["worktree", "remove", "--force", w.path], repo);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(work, { recursive: true, force: true }); fs.rmSync(`${repo}-header`, { recursive: true, force: true }); }
});

test("working in the working copy: it is switched only when clean, and the next handoff commits there only the package files", async () => {
  const { workingCopyState, switchWorkingCopy } = await import("../src/main/handoffBranch.mjs");
  const repo = makeRepo(), work = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-wt-"));
  try {
    await commitToBranch({ repoDir: repo, branch: "feature/header", files: { ".uu5mock/handoff/h/HANDOFF.md": "v1\n" }, replace: [".uu5mock/handoff/h"], message: "m", workRoot: work });
    fs.writeFileSync(path.join(repo, "README.md"), "changed\n"); // a tracked change: not switched
    const s = await workingCopyState(repo, "feature/header");
    assert.equal(s.current, "main"); assert.equal(s.dirty, 1); assert.equal(s.here, false); assert.equal(s.elsewhere, null);
    await assert.rejects(switchWorkingCopy(repo, "feature/header"), /1 changed file on main/);
    git(["checkout", "--", "README.md"], repo);
    const w = await switchWorkingCopy(repo, "feature/header");
    assert.equal(w.switched, true); assert.equal(w.from, "main");
    assert.equal(git(["rev-parse", "--abbrev-ref", "HEAD"], repo), "feature/header");
    assert.equal(fs.readFileSync(path.join(repo, "wip.txt"), "utf8"), "unfinished work\n"); // untracked work travels along
    assert.equal((await workingCopyState(repo, "feature/header")).here, true);

    // the developer has started: a change of their own and a staged file stay out of the handoff's commit
    fs.writeFileSync(path.join(repo, "README.md"), "dev work\n"); fs.writeFileSync(path.join(repo, "staged.md"), "s\n"); git(["add", "staged.md"], repo);
    const again = await commitToBranch({ repoDir: repo, branch: "feature/header", files: { ".uu5mock/handoff/h/HANDOFF.md": "v2\n" }, replace: [".uu5mock/handoff/h"], message: "m2", workRoot: work });
    assert.equal(again.changed, true);
    assert.deepEqual(git(["show", "--name-only", "--format=", "HEAD"], repo).split("\n"), [".uu5mock/handoff/h/HANDOFF.md"]);
    assert.equal(fs.readFileSync(path.join(repo, "README.md"), "utf8"), "dev work\n");
    assert.match(git(["status", "--porcelain"], repo), /^A  staged\.md$/m);
    // edits of the package files themselves are not overwritten
    fs.writeFileSync(path.join(repo, ".uu5mock/handoff/h/HANDOFF.md"), "edited by hand\n");
    await assert.rejects(commitToBranch({ repoDir: repo, branch: "feature/header", files: { ".uu5mock/handoff/h/HANDOFF.md": "v3\n" }, replace: [".uu5mock/handoff/h"], message: "m3", workRoot: work }), /changes of their own/);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(work, { recursive: true, force: true }); }
});
