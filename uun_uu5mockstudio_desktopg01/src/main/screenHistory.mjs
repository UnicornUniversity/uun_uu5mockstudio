/**
 * Undo / redo of the changes the app makes to a screen file (inspector edits, rearranged components): the text of the file before and
 * after every step, kept in memory per file. A step can only be undone while the file is exactly as that step left it: when someone
 * else (the agent, an editor) changed it since, the steps are dropped instead of overwriting their work.
 */
export function createScreenHistory(limit = 50) {
  const all = new Map();
  const order = []; // the files in the order of their last step
  const of = (key) => { let s = all.get(key); if (!s) all.set(key, (s = { undo: [], redo: [] })); return s; };
  const stale = (s) => { s.undo.length = 0; s.redo.length = 0; return { error: "The file was changed outside of the app since, so the steps cannot be undone or redone any more." }; };
  return {
    record(key, before, after, label = "Change") {
      if (before === after) return;
      const s = of(key); const at = order.indexOf(key); if (at >= 0) order.splice(at, 1); order.push(key);
      s.undo.push({ before, after, label }); if (s.undo.length > limit) s.undo.shift(); s.redo.length = 0;
    },
    /** `current` = the file as it is now. -> { html, label } to write, or { error }. */
    undo(key, current) {
      const s = of(key), e = s.undo.at(-1);
      if (!e) return { error: "Nothing to undo." };
      if (current !== e.after) return stale(s);
      s.undo.pop(); s.redo.push(e); return { html: e.before, label: e.label };
    },
    redo(key, current) {
      const s = of(key), e = s.redo.at(-1);
      if (!e) return { error: "Nothing to redo." };
      if (current !== e.before) return stale(s);
      s.redo.pop(); s.undo.push(e); return { html: e.after, label: e.label };
    },
    /** The file whose last step is the most recent one that can still be undone / redone (`inside` filters the files, e.g. one project). */
    latest(way, inside = () => true) {
      for (let i = order.length - 1; i >= 0; i--) { const k = order[i]; if (inside(k) && of(k)[way].length) return k; }
      return null;
    },
    state(key) { const s = of(key); return { undo: s.undo.length, redo: s.redo.length, undoLabel: s.undo.at(-1)?.label ?? null, redoLabel: s.redo.at(-1)?.label ?? null }; },
    clear(key) { all.delete(key); },
  };
}
