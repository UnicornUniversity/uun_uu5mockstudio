// Preload of every mockup <webview>. A trackpad pinch arrives in Chromium as ctrl+wheel and would go to the mockup page
// itself; forward it to the canvas (which zooms) and keep plain scrolling for the page.
const { ipcRenderer } = require("electron");
// Two-finger scrolling over a screen of the canvas: normally it scrolls the screen and Alt / Option moves the whole canvas; while components are
// being inspected it is the other way round ("plain"): the canvas moves and Alt / Option scrolls the screen. The fullscreen preview has no canvas to move.
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
// Cmd/Ctrl+Shift+F toggles fullscreen preview even while the mockup has keyboard focus. Esc is deliberately left to the
// mockup (modals use it), so fullscreen is closed with the bar button or the same shortcut.
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); ipcRenderer.sendToHost("studio-fullscreen"); }
}, true);
// A right click inside a screen opens the app's menu (add a note here, ...): the page cannot show it, the canvas can.
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ipcRenderer.sendToHost("studio-contextmenu", { x: e.clientX, y: e.clientY, vw: window.innerWidth });
}, true);
