/** Pure helpers of scripts/publish-github.mjs (kept apart so that they can be unit tested). */

/** "Name <email>" -> { name, email }; null when it is not in that form. */
export function parseAuthor(text) {
  const m = String(text ?? "").match(/^\s*(.+?)\s*<\s*([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)\s*>\s*$/);
  return m ? { name: m[1], email: m[2] } : null;
}

/** The files of dist/ that belong to a release of `version`: installers and archives, not block maps or update feeds. */
export function releaseAssets(fileNames, version) {
  const prefix = `uu5Mock-Studio-${version}-`;
  return fileNames.filter((f) => f.startsWith(prefix) && /\.(dmg|zip|exe|AppImage)$/.test(f)).sort();
}

/** Release notes: the file docs/release-notes/<version>.md, or a minimal text when there is none. */
export function defaultNotes(version, fileText) {
  return fileText?.trim() ? fileText : `## uu5Mock Studio ${version}\n\nSee the README for what the app does and how to install it.\n`;
}

/** What is wrong with the plan to publish (an empty list = ready). `facts` come from the script's checks. */
/** `release: false` (sources only) does not need the installers nor a free tag. */
export function problems({ dirty, ghInstalled, ghAuthed, assets, releaseExists, sameTree, author, missingRootFiles = [], release = true }) {
  const p = [];
  if (dirty) p.push("The working tree has uncommitted changes: commit them first.");
  if (release && !ghInstalled) p.push("GitHub CLI (gh) is not installed (brew install gh).");
  else if (release && !ghAuthed) p.push("gh is not signed in: run `gh auth login`.");
  if (release && !assets.length) p.push("No installers for this version in dist/: build them first (npm run dist:mac).");
  if (release && releaseExists) p.push("A release with this tag already exists on GitHub (bump the version).");
  if (sameTree) p.push("The sources are identical to the last published snapshot: nothing to publish.");
  if (missingRootFiles.length) p.push(`Missing in the repository root: ${missingRootFiles.join(", ")}.`);
  if (!author) p.push("No author for the public commit: pass --author \"Name <email>\" or set git user.name and user.email.");
  return p;
}
