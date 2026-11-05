import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareVersions } from "./prerequisites.mjs";

/**
 * Codex has no Skill tool: it only "may" use an installed skill, and a model that does not feel like it designs freely.
 * So the app names the files of the skills the screens are built with and requires them to be read; a run that wrote a screen
 * without reading them is sent back (see CodexService).
 */
const MP = "uu-technical-products-mp";

/** The folder of an installed plugin: the newest version in Codex's plugin cache, else the synchronised marketplace. */
export function pluginRoot(name, { home = os.homedir(), mp = MP } = {}) {
  const cache = path.join(home, ".codex", "plugins", "cache", mp, name);
  try {
    const v = fs.readdirSync(cache, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(compareVersions).pop();
    if (v) return path.join(cache, v);
  } catch { /* not installed in Codex */ }
  const dir = path.join(home, ".skilled-plus4u-mcp", "marketplaces", mp, "plugins", name);
  return fs.existsSync(dir) ? dir : null;
}

const mdc = (root) => { try { return fs.readdirSync(path.join(root, "rules")).filter((f) => /\.mdc?$/.test(f)).sort().map((f) => path.join(root, "rules", f)); } catch { return []; } };

/** The files to read before a screen is written, in the order of reading; only those that exist. `bricks`: a content page (template level Page) also needs the uu5bricks knowledge. */
export function requiredFiles(opts = {}) {
  const mock = pluginRoot("uu5-mockup", opts), gds = pluginRoot("uugds", opts), dev = pluginRoot("uu5-development", opts), bricks = opts.bricks ? pluginRoot("uu5bricks", opts) : null;
  const list = [
    ...(mock ? [...mdc(mock), path.join(mock, "skills", "create-mockup", "SKILL.md"), path.join(mock, "skills", "mockup-iterate", "SKILL.md")] : []),
    ...(gds ? [...mdc(gds), path.join(gds, "skills", "uugds-icons", "SKILL.md")] : []),
    ...(dev ? [path.join(dev, "skills", "uu5-knowledge", "SKILL.md")] : []),
    ...(bricks ? [path.join(bricks, "skills", "uu5bricks-knowledge", "SKILL.md")] : []),
  ];
  return list.filter((f) => fs.existsSync(f));
}

/** The binding instruction (part of the first message of a conversation and of every request: Codex re-reads the files when it forgot). */
export function skillsPrompt(files) {
  if (!files.length) return "";
  return [
    "MANDATORY SKILLS (this is not optional and it overrides your own habits). Screens are built ONLY from uu5 components (Uu5Elements, Uu5Forms, Uu5Tiles, Plus4U5Elements …; Uu5Bricks and the other Bricks on a content page meant for a document) with uuGDS values (colorScheme, significance, size, gaps, spacing, icons); hand-written HTML/CSS layout, custom colours and invented component names are wrong and the screen will be thrown away and redone.",
    "Before you write or change ANY screen file, read ALL of these files completely with the shell (cat) and follow them: use create-mockup for a new screen and mockup-iterate for an existing one; look every component and its props up in the uu5-knowledge wiki (the Bricks in uu5bricks-knowledge) before you use it; take icons only from uugds-icons.",
    ...files.map((f) => `- ${f}`),
    "Start the first line of your answer with `Skills read:` and the names of the skills you read.",
  ].join("\n");
}

/** Did this shell command read a skill or a rule file? */
export const readsSkill = (command) => /SKILL\.md|uu5-mockup-(coding|design)\.mdc|\/rules\/[\w-]+\.mdc/.test(String(command ?? ""));

/** Did this item of the run write a screen (an .html file)? A shell command is judged by its text: it names an .html file and redirects, copies or edits. */
export function writesScreen(item) {
  if (!item) return false;
  if (item.type === "file_change") return (item.changes ?? []).some((c) => /\.html$/.test(c.path ?? ""));
  if (item.type === "command_execution") return /\.html\b/.test(item.command ?? "") && /(^|[^<>=-])>>?\s*\S|\btee\b|sed\s+-i|apply_patch|\b(mv|cp)\b|<<\s*['"]?\w+/.test(item.command ?? "");
  return false;
}

/** The message that sends a run back that wrote a screen without the skills. */
export function reworkPrompt(files) {
  return [
    "You wrote or changed a screen without reading the mandatory skills, which is not allowed.",
    "Read ALL of these files completely now (cat), then check the screen against them and rework it: replace hand-written HTML/CSS with uu5 components and uuGDS values, verify every component name in the uu5-knowledge wiki, and keep the content and the business rules.",
    ...files.map((f) => `- ${f}`),
    "Start your answer with `Skills read:` and the names of the skills you read.",
  ].join("\n");
}
