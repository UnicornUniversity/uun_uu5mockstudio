import { mkdir, readdir, rename, rmdir, stat, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_PROJECT = "Default project";
const exists = (p) => access(p).then(() => true, () => false);

/** Folder-safe project name: no path separators or reserved characters, no leading dots, trimmed. */
export function sanitizeName(raw) {
  const name = String(raw ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 60).trim();
  if (!name) throw new Error("The project name must not be empty.");
  return name;
}

/**
 * Every project is a folder under `root`; every screen is an .html file directly in it, exactly as the agent wrote it.
 * Hidden .studio/ holds app state (chat, session, canvas layout).
 */
export function createProjects(root, { trash }) {
  const dirOf = (name) => path.join(root, name);

  const htmlIn = async (d) => (await readdir(d)).filter((f) => f.endsWith(".html"));

  async function list() {
    await mkdir(root, { recursive: true });
    const out = [];
    for (const e of await readdir(root, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const htmls = await htmlIn(dirOf(e.name));
      let updated = (await stat(dirOf(e.name))).mtimeMs; // the newest screen tells when the work was last touched
      for (const f of htmls) updated = Math.max(updated, (await stat(path.join(dirOf(e.name), f))).mtimeMs);
      out.push({ name: e.name, screens: htmls.length, updated });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "en"));
  }

  async function create(raw) {
    const name = sanitizeName(raw);
    if (await exists(dirOf(name))) throw new Error(`Project “${name}” already exists.`);
    await mkdir(dirOf(name), { recursive: true });
    return name;
  }

  async function rename_(from, raw) {
    const to = sanitizeName(raw);
    if (!(await exists(dirOf(from)))) throw new Error(`Project “${from}” does not exist.`);
    if (to === from) return to;
    if (await exists(dirOf(to))) throw new Error(`Project “${to}” already exists.`);
    await rename(dirOf(from), dirOf(to));
    return to;
  }

  async function remove(name) {
    if (!(await exists(dirOf(name)))) throw new Error(`Project “${name}” does not exist.`);
    await trash(dirOf(name));
  }

  /** Makes sure at least one project exists and returns the name to open (the preferred one if it still exists). */
  async function ensure(preferred) {
    const all = await list();
    if (preferred && all.some((p) => p.name === preferred)) return preferred;
    return all[0]?.name ?? create(DEFAULT_PROJECT);
  }

  /**
   * Older versions kept one project directly in `legacyDir` (mockups/ and .studio/ inside it).
   * Move it into root/<DEFAULT_PROJECT> so it shows up as a normal project. Returns true when something moved.
   */
  async function migrateLegacy(legacyDir) {
    if (!(await exists(path.join(legacyDir, "mockups"))) || (await exists(dirOf(DEFAULT_PROJECT)))) return false;
    if (path.resolve(legacyDir) === path.resolve(root)) {
      await mkdir(dirOf(DEFAULT_PROJECT));
      for (const part of ["mockups", ".studio"]) if (await exists(path.join(root, part))) await rename(path.join(root, part), path.join(dirOf(DEFAULT_PROJECT), part));
    } else {
      await mkdir(root, { recursive: true });
      await rename(legacyDir, dirOf(DEFAULT_PROJECT));
    }
    return true;
  }

  /**
   * Earlier versions kept screens in <project>/mockups/. Move them up into the project folder
   * (a name clash keeps both files) and drop the empty mockups/. Returns the number of moved screens.
   */
  async function flattenAll() {
    let moved = 0;
    if (!(await exists(root))) return 0;
    for (const e of await readdir(root, { withFileTypes: true })) {
      const sub = path.join(root, e.name, "mockups");
      if (!e.isDirectory() || e.name.startsWith(".") || !(await exists(sub))) continue;
      for (const f of await readdir(sub)) {
        let target = path.join(root, e.name, f);
        if (await exists(target)) target = path.join(root, e.name, `${path.basename(f, path.extname(f))}-mockups${path.extname(f)}`);
        await rename(path.join(sub, f), target); moved++;
      }
      await rmdir(sub).catch(() => {});
    }
    return moved;
  }

  return { root, dirOf, list, create, rename: rename_, remove, ensure, migrateLegacy, flattenAll };
}

/** Per-project state (conversations, canvas layout) lives in <project>/.studio/state.json. */
export async function readState(projectDir) {
  try { return JSON.parse(await readFile(path.join(projectDir, ".studio", "state.json"), "utf8")); } catch { return {}; }
}
const queues = new Map();
/**
 * Read-modify-write of the state file, serialized per project so concurrent writers (chat saves, session ids,
 * layout) cannot overwrite each other. `fn(state)` returns the new state (or mutates it and returns nothing).
 */
export function updateState(projectDir, fn) {
  const next = (queues.get(projectDir) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const state = await readState(projectDir);
    const out = (await fn(state)) ?? state;
    await mkdir(path.join(projectDir, ".studio"), { recursive: true });
    await writeFile(path.join(projectDir, ".studio", "state.json"), JSON.stringify(out));
    return out;
  });
  queues.set(projectDir, next);
  return next;
}
export const writeState = (projectDir, patch) => updateState(projectDir, (s) => ({ ...s, ...patch }));
