import path from "node:path";

/**
 * Where projects live. A packaged app cannot write next to its own code (read-only asar), so it uses
 * <Documents>/uu5Mock Studio; a dev checkout uses ./projects. A folder the user picked (`saved`) beats the defaults; STUDIO_PROJECTS_DIR beats everything.
 * `legacyDir` is where older versions kept their single project (see projects.migrateLegacy).
 */
export function resolveProjectsRoot({ isPackaged, documents, repoRoot, env = {}, saved = null }) {
  const override = env.STUDIO_PROJECTS_DIR || env.STUDIO_PROJECT_DIR || saved;
  if (override) return { root: path.resolve(override), legacyDir: path.resolve(override) };
  return isPackaged
    ? { root: path.join(documents, "uu5Mock Studio"), legacyDir: path.join(documents, "uu5Mock Studio") }
    : { root: path.join(repoRoot, "projects"), legacyDir: path.join(repoRoot, "project") };
}
