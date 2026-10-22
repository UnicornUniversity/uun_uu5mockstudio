// Preload of every mockup <webview>. A trackpad pinch arrives in Chromium as ctrl+wheel and would go to the mockup page
// itself; forward it to the canvas (which zooms) and keep plain scrolling for the page.
const { ipcRenderer } = require("electron");
// Two-finger scrolling over a screen of the canvas: it scrolls the screen and Alt / Option moves the whole canvas ("alt"), with the inspector on as well. "plain" (the canvas
// moves without Alt) is no longer used by the canvas but still works. The fullscreen preview has no canvas to move.
let panMode = null; // null | "alt" | "plain", set by the canvas
ipcRenderer.on("studio-pan-wheel", (_e, mode) => { panMode = mode || null; });
window.addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) {
    if (panMode === "plain" ? !e.altKey : panMode === "alt" ? e.altKey : false) { e.preventDefault(); ipcRenderer.sendToHost("studio-pan", { dx: e.deltaX, dy: e.deltaY }); }
    return;
  }
  e.preventDefault();
  ipcRenderer.sendToHost("studio-zoom", { deltaY: e.deltaY, x: e.clientX, y: e.clientY, vw: window.innerWidth });
}, { passive: false, capture: true });
// Cmd/Ctrl+Enter (or Shift+F) toggles present mode even while the mockup has keyboard focus.
window.addEventListener("keydown", (e) => {
  if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") || ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !/^(TEXTAREA|INPUT|SELECT)$/.test(e.target?.tagName || ""))) { e.preventDefault(); ipcRenderer.sendToHost("studio-fullscreen"); }
}, true);
// Esc leaves present mode unless the mockup used it itself (a modal closes, a menu shuts: it calls preventDefault).
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.defaultPrevented) ipcRenderer.sendToHost("studio-escape"); });
// A right click inside a screen opens the app's menu (add a note here, ...): the page cannot show it, the canvas can.
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ipcRenderer.sendToHost("studio-contextmenu", { x: e.clientX, y: e.clientY, vw: window.innerWidth });
}, true);
