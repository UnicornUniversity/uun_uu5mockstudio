import fs from "node:fs";
import path from "node:path";
import { notePath, readProject, writeProject, forgetScreen } from "./rules.mjs";
import { commentPath } from "./comments.mjs";
import { getScreenText, setScreenText } from "../renderer/projectDoc.js";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "Use this variant" on the disk. `chosen` is a variant (`room-list-b.html`): it takes the place of the original, the original and the
 * other variants go to the trash. `chosen` is the original (`room-list.html`): it stays and all its variants go to the trash.
 * What belongs to a screen goes with it (notes, comments, rules and description; the rules and the description are copied to
 * .studio/removed-screen-memory.md); when a variant replaces the original, its notes, comments and description move to the original's name.
 * `trash` moves a file to the trash (injected so that tests do not need Electron). -> { kept, removed: the other variants that went away }
 */
export async function keepVariantFiles(projectDir, chosen, { trash, screens }) {
  const file = String(chosen);
  if (!screens.includes(file)) throw new Error(`The screen ${file} does not exist.`);
  const m = /^(.+)-([a-z])\.html$/.exec(file), isVariant = Boolean(m && screens.includes(`${m[1]}.html`));
  const stem = isVariant ? m[1] : file.replace(/\.html$/, "");
  const base = `${stem}.html`, re = new RegExp(`^${escapeRe(stem)}-[a-z]\\.html$`);
  const variants = screens.filter((f) => re.test(f));
  if (!isVariant && !variants.length) throw new Error("This screen has no variants.");
  const others = variants.filter((f) => f !== file), away = isVariant ? [base, ...others] : variants;
  const dir = (f) => path.join(projectDir, f), name = (f) => f.replace(/\.html$/, "");
  const description = isVariant ? getScreenText(await readProject(projectDir), name(file)) : "";

  const sidecars = (f) => [notePath(projectDir, f), commentPath(projectDir, f)];
  for (const f of away) {
    await trash(dir(f));
    for (const s of sidecars(f)) if (fs.existsSync(s)) await trash(s);
    await forgetScreen(projectDir, f);
  }
  if (isVariant) {
    await fs.promises.rename(dir(file), dir(base));
    const from = sidecars(file), to = sidecars(base);
    for (let i = 0; i < from.length; i++) if (fs.existsSync(from[i])) await fs.promises.rename(from[i], to[i]);
    await forgetScreen(projectDir, file); // its rules stay in removed-screen-memory.md; the description is carried over below
    if (description) await writeProject(projectDir, setScreenText(await readProject(projectDir), name(base), description));
  }
  return { kept: isVariant ? base : file, removed: isVariant ? others : variants };
}
