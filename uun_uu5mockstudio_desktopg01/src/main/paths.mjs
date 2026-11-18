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

/** An error of the system refusing access (macOS privacy: a new build of the app is not allowed into Documents until the user allows it again). */
export const isAccessDenied = (e) => ["EPERM", "EACCES"].includes(e?.code);
/** The pane of the macOS settings where the user lets an app into the Documents folder. */
export const FILES_AND_FOLDERS_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders";
/** What the user is told when the projects folder cannot be read: why, and what to do. */
export function accessDeniedMessage(root, platform = process.platform) {
  const mac = platform === "darwin";
  return {
    message: "uu5Mock Studio may not open the folder with your projects.",
    detail: `${root}\n\n${mac ? "macOS asks again after an update. Allow uu5Mock Studio in System Settings → Privacy & Security → Files and Folders (Documents Folder), or Full Disk Access, then open the app again." : "Allow the app to read and write this folder, then open the app again."} You can also choose another folder for your projects.`,
  };
}
