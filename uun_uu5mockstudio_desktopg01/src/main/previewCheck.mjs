import fs from "node:fs";
import { previewable, PREVIEW_LIBS } from "./componentPreview.mjs";

/**
 * Which previews of the catalogue really render. The pages are loaded one after another in a hidden window (`probe(name)` -> "ok" | "fail")
 * and the result is kept in a file, so the catalogue offers a preview only where one was seen working. A component not checked yet
 * is offered (the check runs in the background); a new check starts when the libraries of PREVIEW_LIBS (their versions) change.
 */
export function createPreviewCheck({ docs, file, probe, concurrency = 2, onDone = () => {} }) {
  const key = JSON.stringify(PREVIEW_LIBS);
  let state = { key, results: {} }, running = false;
  try { const saved = JSON.parse(fs.readFileSync(file, "utf8")); if (saved?.key === key && saved.results) state = saved; } catch { /* no check yet */ }
  const save = () => { try { fs.writeFileSync(file, JSON.stringify(state)); } catch { /* the check is only an optimisation */ } };

  /** The check result of a component: "ok", "fail" or undefined (not checked yet). */
  const status = (name) => state.results[name];
  const todo = () => docs.list().map((c) => c.name).filter((n) => previewable(n, docs) && !state.results[n]);

  /** Checks every previewable component not checked yet; resolves when done. A second call while running does nothing. */
  async function run() {
    if (running || !docs.available()) return;
    running = true;
    try {
      const queue = todo();
      let done = 0;
      await Promise.all(Array.from({ length: concurrency }, async () => {
        for (let name; (name = queue.shift()); ) {
          state.results[name] = await probe(name).catch(() => "fail");
          if (++done % 20 === 0) save();
        }
      }));
      save(); onDone(state.results);
    } finally { running = false; }
  }
  return { status, run, get running() { return running; } };
}
