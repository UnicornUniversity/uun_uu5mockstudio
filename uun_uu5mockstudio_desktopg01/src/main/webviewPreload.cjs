// Preload of every mockup <webview>. A trackpad pinch arrives in Chromium as ctrl+wheel and would go to the mockup page
// itself; forward it to the canvas (which zooms) and keep plain scrolling for the page.
const { ipcRenderer } = require("electron");
window.addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
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
