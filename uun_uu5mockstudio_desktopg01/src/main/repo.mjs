import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

/** Git repository linked to a project: read-only reference for the agent (existing components, style) and a place to publish the mocks to. */

const run = (cmd, args, cwd) => new Promise((resolve, reject) => execFile(cmd, args, { cwd, timeout: 8000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout)))));
const inside = (p, root) => p === root || p.startsWith(root + path.sep);
const SOURCE_EXT = /\.(jsx?|tsx?|mjs|cjs|json|md|css|scss|html|vue|svelte)$/i;

/** Files the agent must never read from a repository: git internals, dependencies, credentials. */
export function isSecretPath(rel) {
  const p = String(rel).split(path.sep).join("/");
  const base = p.split("/").pop();
  return /(^|\/)(\.git|node_modules|\.ssh|\.aws|\.gnupg)(\/|$)/.test(p) || /^\.env(\.|$)/.test(base) || /\.(pem|key|p12|pfx|keystore)$/i.test(base) || /^id_(rsa|dsa|ecdsa|ed25519)/.test(base) || /^credentials(\.|$)/i.test(base);
}

/** Resolves a user-chosen folder to a repository: { path (top level), name, branch }. Throws a readable error when it is not one. */
export async function validateRepo(dir) {
  const given = path.resolve(String(dir ?? ""));
  if (!fs.existsSync(given) || !fs.statSync(given).isDirectory()) throw new Error("That folder does not exist.");
  let top;
  try { top = (await run("git", ["rev-parse", "--show-toplevel"], given)).trim(); } catch { throw new Error("That folder is not inside a git repository."); }
  let branch = "";
  try { branch = (await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], top)).trim(); } catch { /* a repository without commits */ }
  return { path: fs.realpathSync(top), name: path.basename(top), branch };
}

const cache = new Map(); // repo + ref -> { at, files }
/**
 * Source files of the repository whose path contains every word of `query` (most relevant first, at most `limit`).
 * Without `ref` the working tree (tracked and untracked, not ignored files); with a branch / ref the files of that commit.
 */
export async function listRepoFiles(repoDir, query = "", { limit = 60, ref = null } = {}) {
  const key = `${repoDir}\0${ref ?? ""}`;
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > 15000) {
    const out = await run("git", ref ? ["ls-tree", "-r", "-z", "--name-only", ref] : ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], repoDir);
    hit = { at: Date.now(), files: out.split("\0").filter((f) => f && SOURCE_EXT.test(f) && !isSecretPath(f)).slice(0, 5000) };
    cache.set(key, hit);
  }
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const score = (f) => { const l = f.toLowerCase(), base = path.basename(l); return words.reduce((s, w) => s + (base.startsWith(w) ? 0 : base.includes(w) ? 1 : 2), 0) + f.length / 1000; };
  return hit.files.filter((f) => words.every((w) => f.toLowerCase().includes(w))).sort((a, b) => score(a) - score(b)).slice(0, limit);
}

const READ_TOOLS = new Set(["Read", "Glob", "Grep"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const HOME_READ = [".claude", ".skilled-plus4u-mcp"].map((d) => path.join(os.homedir(), d));

/**
 * What the agent may touch: writes only inside the project folder; reads inside the project folder, the Claude plugin folders and
 * (when a repository is linked) the repository except secrets. Returns { behavior: "allow" } or { behavior: "deny", message }.
 */
export function accessPolicy({ cwd, repoDir, tool, target }) {
  if (!target) return { behavior: "allow" };
  const abs = path.resolve(cwd, target);
  if (WRITE_TOOLS.has(tool)) return inside(abs, cwd) ? { behavior: "allow" } : { behavior: "deny", message: `Writing outside ${cwd} is not allowed${repoDir && inside(abs, repoDir) ? " (the linked repository is read-only)" : ""}.` };
  if (READ_TOOLS.has(tool)) {
    if ([cwd, ...HOME_READ].some((r) => inside(abs, r))) return { behavior: "allow" };
    if (repoDir && inside(abs, repoDir)) return isSecretPath(path.relative(repoDir, abs)) ? { behavior: "deny", message: `${abs} is not readable (secrets, git internals and dependencies are excluded).` } : { behavior: "allow" };
  }
  return { behavior: "deny", message: `Access to ${abs} is not allowed.` };
}

/** Local and remote branches: { current, branches: [{ name, remote }] }, the checked-out one first, then local, then remote branches. */
export async function listBranches(repoDir) {
  const current = (await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoDir).catch(() => "")).trim();
  const refs = (await run("git", ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"], repoDir)).split("\n").filter(Boolean);
  const branches = refs.filter((r) => !r.endsWith("/HEAD")).map((r) => (r.startsWith("refs/heads/") ? { name: r.slice(11), remote: false } : { name: r.slice(13), remote: true }));
  branches.sort((a, b) => Number(b.name === current) - Number(a.name === current) || Number(a.remote) - Number(b.remote) || a.name.localeCompare(b.name));
  return { current, branches };
}

/**
 * A read-only copy of one branch's files in `baseDir` (git archive: nothing in the repository is touched, no checkout, no .git changes).
 * The same repository + branch always lands in the same folder, which is replaced. Returns the folder.
 */
export async function snapshotBranch({ repoDir, branch, baseDir }) {
  if (!/^[\w./@+-]+$/.test(branch) || branch.startsWith("-")) throw new Error("Invalid branch name.");
  await run("git", ["rev-parse", "--verify", "--quiet", `${branch}^{commit}`], repoDir).catch(() => { throw new Error(`Branch ${branch} was not found.`); });
  const dest = path.join(baseDir, `${crypto.createHash("sha1").update(repoDir).digest("hex").slice(0, 10)}-${branch.replace(/[^\w.-]+/g, "_")}`);
  await fs.promises.rm(dest, { recursive: true, force: true });
  await fs.promises.mkdir(dest, { recursive: true });
  await new Promise((resolve, reject) => {
    const git = spawn("git", ["archive", "--format=tar", branch], { cwd: repoDir }), tar = spawn("tar", ["-x", "-C", dest]);
    let err = "";
    git.stderr.on("data", (d) => (err += d)); tar.stderr.on("data", (d) => (err += d));
    git.stdout.pipe(tar.stdin);
    git.on("error", reject); tar.on("error", reject);
    tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Could not read branch ${branch}: ${err.trim() || `exit ${code}`}`))));
  });
  return dest;
}
