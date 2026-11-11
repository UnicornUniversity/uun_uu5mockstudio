/**
 * Settings… (⌘, in the app menu on macOS, File on Windows/Linux): every setup of the app in one place (rows: settingsModel.js).
 * A row either changes a value right here (theme, glass, offline mode) or opens the dialog that owns the setup (role, Claude Code,
 * Codex, the uuAiChat MCP server, picture generation). Settings stays open underneath: Esc or the cross of that dialog closes only
 * that dialog, and the values here (the role, whether picture generation is on) are refreshed when it is gone.
 */
import { addDialogClose } from "./dialogChrome.js";
import { settingsSections, rowValue } from "./settingsModel.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** `getState()` -> { theme, glass, offline, roleLabel, images, agents }; `run(action)` runs a menu action; `setValue(key, value)` changes a value of a choice/toggle row. */
export function createSettingsDialog({ platform, getState, run, setValue }) {
  const box = document.createElement("div");
  box.id = "setbox"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="st-title"><h2 id="st-title">Settings</h2><div class="st-body"></div></div>`;
  document.body.append(box);
  const body = box.querySelector(".st-body");
  const close = () => { box.hidden = true; };
  addDialogClose(box.querySelector(".card"), close);
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  const control = (row, state) => {
    if (row.kind === "choice") return `<span class="st-seg" role="radiogroup" aria-label="${esc(row.title)}">${row.options.map(([v, l]) => `<button type="button" role="radio" aria-checked="${state[row.key] === v}" data-key="${row.key}" data-value="${v}">${esc(l)}</button>`).join("")}</span>`;
    if (row.kind === "toggle") return `<input type="checkbox" class="st-tog" data-key="${row.key}" aria-label="${esc(row.title)}"${state[row.key] ? " checked" : ""}>`;
    return `<button type="button" data-action="${row.action}"${row.keepOpen ? ' data-keep="1"' : ""}>${esc(row.button)}</button>`;
  };

  let lastAction = null; // the row button that opened a dialog: the focus returns to it
  async function render() {
    const state = await getState();
    const keep = body.scrollTop, focus = document.activeElement;
    const inBody = body.contains(focus), idle = focus === document.body || !focus; // a dialog open above Settings keeps its focus
    const d = inBody ? focus.dataset : {};
    const same = d.action ? `[data-action="${d.action}"]` : d.key ? `[data-key="${d.key}"]${d.value ? `[data-value="${d.value}"]` : ""}` : null; // the control that had the focus
    body.innerHTML = settingsSections({ platform, agents: state.agents }).map((s) => `<section><h3>${esc(s.title)}</h3>${s.rows.map((r) => {
      const v = rowValue(r, state);
      return `<div class="st-row"><div class="st-text"><b>${esc(r.title)}</b>${v ? `<span class="st-val">${esc(v)}</span>` : ""}<small>${esc(r.desc)}</small></div>${control(r, state)}</div>`;
    }).join("")}</section>`).join("");
    body.scrollTop = keep;
    if (!box.hidden && (inBody || idle)) (same ? body.querySelector(same) : body.querySelector(`[data-action="${lastAction}"]`))?.focus();
  }
  // a dialog above Settings was closed (or opened): show the values it changed
  let timer;
  // only a dialog opening or closing counts: one that is shown and hidden (a direct child of the body), or one that is added to and removed
  // from the body (the territory dialog); not the busy dots and the like
  const onDialog = (muts) => {
    if (box.hidden || !muts.some((m) => m.type === "childList" || (m.target.parentElement === document.body && m.target !== box))) return;
    clearTimeout(timer); timer = setTimeout(() => { if (!box.hidden) render(); }, 150);
  };
  new MutationObserver(onDialog).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(onDialog).observe(document.body, { childList: true });

  body.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.action) {
      lastAction = b.dataset.action;
      await run(b.dataset.action); // the dialog opens above; Settings stays
      if (!box.hidden) await render();
    } else if (b.dataset.key) { await setValue(b.dataset.key, b.dataset.value); await render(); }
  });
  body.addEventListener("change", async (e) => {
    const c = e.target.closest("input.st-tog"); if (!c) return;
    await setValue(c.dataset.key, c.checked); await render();
  });

  return {
    async open() { await render(); box.hidden = false; box.querySelector("button")?.focus(); },
    isOpen: () => !box.hidden,
  };
}
