#!/usr/bin/env node
/**
 * Publishes the current version to GitHub: a source snapshot (a single new commit on top of the previously published snapshot,
 * never the development history) and a GitHub release with the installers from dist/. The source of the release archive is the
 * snapshot, taken from the tag the release creates.
 *
 *   node scripts/publish-github.mjs                       dry run: checks everything and prints what would happen
 *   node scripts/publish-github.mjs --yes                 publishes (the repository on GitHub is PUBLIC)
 *   options: --author "Name <email>"   author and committer of the public commit (default: `git config uu5studio.githubAuthor`, then git user.name / user.email)
 *            --no-release              publish only the source snapshot (e.g. a README fix), no release, no installers needed
 *            --notes file.md           release notes (default docs/release-notes/<version>.md)
 *            --remote github           name of the git remote of the GitHub repository (default github)
 *
 * Needs: a clean working tree with the version commit, installers of that version in dist/, gh installed and signed in.
 * The snapshot is the tree of HEAD: LICENSE, NOTICE and README.md sit in the repository root (next to the app folder), which is
 * what lets GitHub recognize the license and show the README.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAuthor, releaseAssets, defaultNotes, problems } from "./lib/githubPublish.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? def : process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? true : process.argv[i + 1]; };
const yes = process.argv.includes("--yes"), withRelease = !process.argv.includes("--no-release"), remote = String(arg("remote", "github"));
const DEFAULT_URL = "https://github.com/UnicornUniversity/uun_uu5mockstudio.git", REPO = "UnicornUniversity/uun_uu5mockstudio";

const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { cwd: app, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...o }).trim();
const tryRun = (cmd, args, o) => { try { return { ok: true, out: sh(cmd, args, o) }; } catch (e) { return { ok: false, out: String(e.stderr || e.message) }; } };
const top = sh("git", ["rev-parse", "--show-toplevel"]), folder = path.relative(top, app) || ".";

const version = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8")).version, tag = `v${version}`;
// author: --author, then `git config uu5studio.githubAuthor "Name <email>"` (kept in this clone only), then git user.name / user.email
const authorText = arg("author", null), configured = tryRun("git", ["config", "--get", "uu5studio.githubAuthor"]).out;
const gitAuthor = authorText && authorText !== true ? parseAuthor(authorText) : parseAuthor(configured) ?? parseAuthor(`${tryRun("git", ["config", "user.name"]).out} <${tryRun("git", ["config", "user.email"]).out}>`);
const dist = path.join(app, "dist"), assets = fs.existsSync(dist) ? releaseAssets(fs.readdirSync(dist), version) : [];
const notesFile = arg("notes", null) && arg("notes", null) !== true ? path.resolve(String(arg("notes"))) : path.join(app, "docs", "release-notes", `${version}.md`);
const notes = defaultNotes(version, fs.existsSync(notesFile) ? fs.readFileSync(notesFile, "utf8") : "");

// ---- the facts
const ghInstalled = tryRun("gh", ["--version"]).ok, ghAuthed = ghInstalled && tryRun("gh", ["auth", "status"]).ok;
const dirty = Boolean(sh("git", ["status", "--porcelain"]));
if (!tryRun("git", ["remote", "get-url", remote]).ok) { if (yes) sh("git", ["remote", "add", remote, DEFAULT_URL]); }
const remoteUrl = tryRun("git", ["remote", "get-url", remote]).out || DEFAULT_URL;
const releaseExists = withRelease && ghAuthed && tryRun("gh", ["release", "view", tag, "--repo", REPO]).ok;

// parent = the last published snapshot (fetched from the remote, so that the local branch never has to be trusted)
let parent = null;
if (tryRun("git", ["ls-remote", "--exit-code", remote, "refs/heads/main"]).ok) {
  sh("git", ["fetch", "--quiet", remote, "main"]); parent = sh("git", ["rev-parse", "FETCH_HEAD"]);
}

// ---- the snapshot: the tree of HEAD (the repository root with LICENSE, NOTICE, README.md and the app folder)
const tree = sh("git", ["rev-parse", "HEAD^{tree}"]);
const rootFiles = sh("git", ["ls-tree", "--full-tree", "--name-only", tree]).split("\n");
const missingRootFiles = ["LICENSE", "NOTICE", "README.md"].filter((f) => !rootFiles.includes(f));
const sameTree = parent ? sh("git", ["rev-parse", `${parent}^{tree}`]) === tree : false;

const issues = problems({ dirty, ghInstalled, ghAuthed, assets, releaseExists, sameTree, author: gitAuthor, missingRootFiles, release: withRelease });
console.log(`Publishing ${withRelease ? tag : `the sources of ${tag}, without a release,`} to ${remoteUrl}${yes ? "" : "   (dry run, add --yes to publish)"}
  repository : PUBLIC, branch main, ${parent ? `on top of ${parent.slice(0, 7)}` : "first commit"} (no development history)
  author     : ${gitAuthor ? `${gitAuthor.name} <${gitAuthor.email}>` : "(none)"}   <- visible to everyone
  root files : ${rootFiles.join(" ")}
  ${withRelease ? `assets     : ${assets.length ? assets.join(", ") : "(none)"}\n  notes      : ${fs.existsSync(notesFile) ? path.relative(app, notesFile) : "(generated)"}` : "release    : none (sources only)"}`);
if (issues.length) { console.log("\nProblems:\n" + issues.map((i) => `  - ${i}`).join("\n")); process.exit(yes ? 1 : 0); }
if (!yes) { console.log("\nEverything is in place. Run again with --yes to publish."); process.exit(0); }

// ---- publish
const cenv = { ...process.env, GIT_AUTHOR_NAME: gitAuthor.name, GIT_AUTHOR_EMAIL: gitAuthor.email, GIT_COMMITTER_NAME: gitAuthor.name, GIT_COMMITTER_EMAIL: gitAuthor.email };
const message = withRelease ? `uu5Mock Studio ${version}\n\nSource snapshot of release ${version} (the development history is kept in the internal repository).` : `Update sources after uu5Mock Studio ${version}\n\nSource snapshot (the development history is kept in the internal repository).`;
const commit = sh("git", ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message], { env: cenv });
sh("git", ["push", remote, `${commit}:refs/heads/main`], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
sh("git", ["branch", "-f", "github-main", commit]);
if (!withRelease) { console.log("\nPublished the sources to main (no release)."); process.exit(0); }
sh("gh", ["release", "create", tag, "--repo", REPO, "--target", "main", "--title", `uu5Mock Studio ${version}`, "--notes-file", notesFile, "--latest", ...assets.map((a) => path.join(dist, a))]);
console.log(`\nPublished: https://github.com/${REPO}/releases/tag/${tag}`);
