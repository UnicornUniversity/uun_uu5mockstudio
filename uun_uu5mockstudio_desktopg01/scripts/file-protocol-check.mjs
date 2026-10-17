// Does a mockup render when opened straight from disk (file://), like an e-mail recipient would do?
import { app, BrowserWindow } from "electron";
const file = process.argv[2];
setTimeout(() => { console.log(JSON.stringify({ timeout: true })); app.exit(1); }, 40000);
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1200, height: 800 });
  const logs = [];
  w.webContents.on("console-message", (e) => (e.level === "error" || e.level === 3) && logs.push(String(e.message).split("\n")[0].slice(0, 160)));
  w.loadFile(file).catch((e) => logs.push('load: ' + e.message));
  await new Promise((r) => setTimeout(r, 1500));
  let n = 0;
  for (let i = 0; i < 40 && !n; i++) { await new Promise((r) => setTimeout(r, 500)); n = await w.webContents.executeJavaScript(`document.getElementById("uu5")?.children.length ?? 0`); }
  const text = await w.webContents.executeJavaScript(`document.body.innerText.slice(0,60)`);
  console.log(JSON.stringify({ rendered: n > 0, text, errors: logs.slice(0, 3) }));
  app.exit(0);
});
