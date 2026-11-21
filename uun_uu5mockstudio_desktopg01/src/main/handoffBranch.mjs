/**
 * Writes a handoff package into a branch of the linked repository (feature/<name>) without touching the user's checkout:
 * a temporary git worktree outside the repository gets the branch, the files are written and committed there, and the worktree is
 * removed again. The user's working copy, its branch and its index stay as they were; only the new commit on the branch remains.
 * This is the app writing, not the agent: the agent's access to the repository stays read-only (repo.mjs accessPolicy).
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const git = (args, cwd, timeout = 30000) => new Promise((resolve, reject) => execFile("git", args, { cwd, timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr: String(stderr) })) : resolve(String(stdout).trim()))));
const MAIN_LINE = /^(main|master|develop|development|trunk|release([/-].*)?)$/; // never committed onto in a working copy
const ok = (p) => p.then(() => true, () => false);

/** feature/<slug>: a valid branch name, or a readable error. */
export async function branchName(name, repoDir) {
  const b = String(name ?? "").trim();
  if (!b || b.startsWith("-") || !/^[\w./-]+$/.test(b) || !(await ok(git(["check-ref-format", "--branch", b], repoDir)))) throw new Error(`“${b}” cannot be a branch name.`);
  return b;
}

/** `git fetch` of every remote (the remote branches up to date before a handoff starts from one); { ok, remotes } or { error }. */
export async function fetchRemotes(repoDir) {
  const remotes = (await git(["remote"], repoDir).catch(() => "")).split("\n").filter(Boolean);
  if (!remotes.length) return { ok: true, remotes: [] };
  try { await git(["fetch", "--all", "--prune", "--quiet"], repoDir, 90000); return { ok: true, remotes }; }
  catch (e) { return { error: `git fetch failed: ${String(e.stderr || e.message).trim().split("\n").pop()}`, remotes }; }
}

/** How a local branch stands against its upstream: { upstream, behind, ahead } (behind: commits of the remote it lacks), or null without an upstream. */
export async function baseStatus(repoDir, base) {
  if (!base || base.includes("/") && (await git(["rev-parse", "--verify", "--quiet", `refs/remotes/${base}`], repoDir).then(() => true, () => false))) return null; // a remote branch is its own upstream
  const upstream = await git(["rev-parse", "--abbrev-ref", `${base}@{upstream}`], repoDir).catch(() => "");
  if (!upstream) return null;
  const [behind, ahead] = (await git(["rev-list", "--left-right", "--count", `${upstream}...${base}`], repoDir).catch(() => "0 0")).split(/\s+/).map(Number);
  return { upstream, behind: behind || 0, ahead: ahead || 0 };
}

/** Whether the branch exists and where it is checked out (a branch checked out in a working copy cannot get a second worktree). */
export async function branchInfo(repoDir, branch) {
  const exists = await ok(git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], repoDir));
  let checkedOutIn = null;
  for (const block of (await git(["worktree", "list", "--porcelain"], repoDir).catch(() => "")).split("\n\n")) {
    const wt = /^worktree (.+)$/m.exec(block)?.[1], br = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
    if (br === branch) checkedOutIn = wt;
  }
  return { exists, checkedOutIn };
}

/**
 * Commits `files` ({ "<path in repo>": Uint8Array | string }) to `branch`, created from `base` (default: the checked-out branch) when it
 * does not exist yet. `replace`: folders emptied before writing (the package folder, so that removed screens disappear).
 * Returns { branch, commit, created, changed (false when the branch already held exactly these files) }.
 */
export async function commitToBranch({ repoDir, branch, base = null, files, replace = [], message, workRoot }) {
  branch = await branchName(branch, repoDir);
  const info = await branchInfo(repoDir, branch);
  if (info.checkedOutIn && MAIN_LINE.test(branch)) throw new Error(`The branch ${branch} is checked out in ${info.checkedOutIn}, and a handoff does not go onto ${branch}: choose a feature branch.`);
  if (info.checkedOutIn) return commitInCheckout({ dir: info.checkedOutIn, branch, files, replace, message });
  if (!info.exists) {
    const from = base || (await git(["rev-parse", "--abbrev-ref", "HEAD"], repoDir).catch(() => ""));
    if (!from || from === "HEAD" || !(await ok(git(["rev-parse", "--verify", "--quiet", `${from}^{commit}`], repoDir)))) throw new Error("The repository has no commit to start the branch from.");
    base = from;
  }
  const dir = path.join(workRoot, `${crypto.createHash("sha1").update(`${repoDir}\n${branch}`).digest("hex").slice(0, 12)}`);
  await git(["worktree", "remove", "--force", dir], repoDir).catch(() => {}); // a leftover of an interrupted run
  await fs.promises.rm(dir, { recursive: true, force: true });
  await git(["worktree", "prune"], repoDir).catch(() => {});
  await fs.promises.mkdir(workRoot, { recursive: true });
  // --no-track: a branch started from origin/sprint must not get origin/sprint as its upstream (a push would go there)
  await git(info.exists ? ["worktree", "add", "--quiet", dir, branch] : ["worktree", "add", "--quiet", "--no-track", "-b", branch, dir, base], repoDir, 120000);
  try {
    for (const r of replace) await fs.promises.rm(path.join(dir, r), { recursive: true, force: true });
    for (const [rel, data] of Object.entries(files)) {
      const p = path.join(dir, rel);
      if (!p.startsWith(dir + path.sep)) throw new Error(`Refused to write outside the repository: ${rel}`);
      await fs.promises.mkdir(path.dirname(p), { recursive: true });
      await fs.promises.writeFile(p, data);
    }
    const paths = [...new Set([...replace, ...Object.keys(files)])];
    await git(["add", "-A", "--", ...paths], dir, 120000);
    const changed = !(await ok(git(["diff", "--cached", "--quiet"], dir)));
    if (changed) {
      const named = Boolean(await git(["config", "user.email"], dir).catch(() => ""));
      const who = named ? [] : ["-c", "user.name=uu5Mock Studio", "-c", "user.email=uu5mock-studio@localhost"]; // a repository without an identity still gets the commit
      await git([...who, "commit", "--quiet", "--no-verify", "-m", message], dir, 120000); // no hooks: the worktree has no node_modules, and the commit holds only the handoff
    }
    return { branch, commit: await git(["rev-parse", "HEAD"], dir), created: !info.exists, changed, base: base || null };
  } finally {
    await git(["worktree", "remove", "--force", dir], repoDir).catch(() => {});
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    await git(["worktree", "prune"], repoDir).catch(() => {});
  }
}

/**
 * The branch is checked out in a folder (the user switched to it, or a worktree of the handoff): the package is written there and
 * committed alone – only its own paths (`git commit -- <paths>`), whatever else is changed or staged in that folder stays as it was.
 */
async function commitInCheckout({ dir, branch, files, replace, message }) {
  const top = await git(["rev-parse", "--show-toplevel"], dir);
  const own = [...new Set([...replace, ...Object.keys(files)])];
  const before = (await git(["diff", "--name-only", "HEAD", "--", ...own], top).catch(() => "")) || (await git(["ls-files", "--others", "--exclude-standard", "--", ...own], top).catch(() => ""));
  if (before.trim()) throw new Error(`The package files in ${top} have changes of their own (${before.split("\n")[0]}…). Commit or discard them first.`);
  for (const r of replace) await fs.promises.rm(path.join(top, r), { recursive: true, force: true });
  for (const [rel, data] of Object.entries(files)) {
    const p = path.join(top, rel);
    if (!p.startsWith(top + path.sep)) throw new Error(`Refused to write outside the repository: ${rel}`);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, data);
  }
  await git(["add", "-A", "--", ...own], top, 120000);
  const changedPaths = (await git(["diff", "--cached", "--name-only", "HEAD", "--", ...own], top)).split("\n").filter(Boolean);
  if (changedPaths.length) {
    const named = Boolean(await git(["config", "user.email"], top).catch(() => ""));
    const who = named ? [] : ["-c", "user.name=uu5Mock Studio", "-c", "user.email=uu5mock-studio@localhost"];
    await git([...who, "commit", "--quiet", "--no-verify", "-m", message, "--", ...changedPaths], top, 120000);
  }
  return { branch, commit: await git(["rev-parse", "HEAD"], top), created: false, changed: changedPaths.length > 0, base: null, in: top };
}

/**
 * A folder where the developer works on the handoff branch, so that nothing in their own working copy is switched: a git worktree next to
 * the repository (`<repo>-<slug>`). When the branch is already checked out somewhere (that folder, or the working copy itself), that place
 * is used. Returns { path, created }.
 */
export async function ensureWorkspace(repoDir, branch, slug) {
  branch = await branchName(branch, repoDir);
  const info = await branchInfo(repoDir, branch);
  if (!info.exists) throw new Error(`The branch ${branch} does not exist.`);
  if (info.checkedOutIn) return { path: info.checkedOutIn, created: false };
  const top = await git(["rev-parse", "--show-toplevel"], repoDir);
  const safe = String(slug || branch.split("/").pop()).replace(/[^\w.-]+/g, "-").slice(0, 60);
  let dir = path.join(path.dirname(top), `${path.basename(top)}-${safe}`);
  for (let i = 2; fs.existsSync(dir); i++) dir = path.join(path.dirname(top), `${path.basename(top)}-${safe}-${i}`); // never into an existing folder
  await git(["worktree", "add", "--quiet", dir, branch], repoDir, 120000);
  return { path: dir, created: true };
}

/**
 * How the user's working copy stands for working on `branch` right in it: { path (the repository folder), current (its branch),
 * dirty (tracked files with uncommitted changes – then it is not switched), here (the branch is already checked out in it),
 * elsewhere (the folder where the branch is checked out instead, e.g. a worktree made earlier) }.
 */
export async function workingCopyState(repoDir, branch) {
  const top = await git(["rev-parse", "--show-toplevel"], repoDir);
  const current = await git(["rev-parse", "--abbrev-ref", "HEAD"], repoDir).catch(() => "");
  const dirty = (await git(["status", "--porcelain", "--untracked-files=no"], repoDir).catch(() => "")).split("\n").filter(Boolean).length;
  const { checkedOutIn } = await branchInfo(repoDir, branch);
  const same = (a, b) => { try { return fs.realpathSync(a) === fs.realpathSync(b); } catch { return a === b; } };
  const here = current === branch || Boolean(checkedOutIn && same(checkedOutIn, top));
  return { path: repoDir, current, dirty, here, elsewhere: checkedOutIn && !here ? checkedOutIn : null };
}

/** `git switch <branch>` in the user's working copy – only when it has no uncommitted changes of tracked files. Returns { path, switched, from }. */
export async function switchWorkingCopy(repoDir, branch) {
  branch = await branchName(branch, repoDir);
  const s = await workingCopyState(repoDir, branch);
  if (s.here) return { path: repoDir, switched: false, from: s.current };
  if (s.elsewhere) throw new Error(`The branch ${branch} is checked out in ${s.elsewhere}. Work there, or remove that folder (git worktree remove) first.`);
  if (s.dirty) throw new Error(`Your working copy has ${s.dirty} changed file${s.dirty === 1 ? "" : "s"} on ${s.current}. Commit or stash them first, or work in a separate folder.`);
  await git(["switch", "--quiet", branch], repoDir, 120000);
  return { path: repoDir, switched: true, from: s.current };
}
