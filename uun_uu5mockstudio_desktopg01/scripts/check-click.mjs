// Electron check of src/main/mockClick.mjs: `npx electron scripts/check-click.mjs` (no Claude, no tokens).
import { app, BrowserWindow } from "electron";
import { clickIn } from "../src/main/mockClick.mjs";

const PAGE = `<!doctype html><meta charset=utf-8><body style="margin:0">
<div style="height:1400px;padding:30px"><button id=add>Add room</button> <button id=del aria-label="Delete room">🗑</button> <button id=hid style="display:none">Hidden</button></div>
<div id=dlg role=dialog style="display:none;position:fixed;inset:60px;background:#eee"><h3>New room</h3><input id=code placeholder="Code"><button id=save>Save</button></div>
<button id=far style="position:absolute;top:1200px">Far away</button><div id=log></div>
<script>
const log = (t) => (document.getElementById("log").textContent += t + ";");
add.onclick = () => { dlg.style.display = "block"; log("add"); }; far.onclick = () => log("far"); del.onclick = () => log("del");
save.onclick = () => { dlg.style.display = "none"; log("save"); };
</script>`;

const results = [];
const check = (name, ok) => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 900, height: 700 });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(PAGE));
  const wc = win.webContents, state = () => wc.executeJavaScript(`document.getElementById("log").textContent`), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let r = await clickIn(wc, { text: "add room" });
  await sleep(200);
  check("clicks by visible text (case-insensitive) with real input", r.ok && !r.viaFallback && (await state()).includes("add") && (await wc.executeJavaScript(`dlg.style.display`)) === "block");
  r = await clickIn(wc, { text: "Save" }); await sleep(200);
  check("clicks a button inside the opened dialog", r.ok && (await state()).includes("save"));
  r = await clickIn(wc, { text: "Delete room" }); await sleep(200);
  check("finds a button by its aria-label", r.ok && (await state()).includes("del"));
  r = await clickIn(wc, { text: "far away" }); await sleep(200);
  check("scrolls an element that is far down into view first", r.ok && (await state()).includes("far") && (await wc.executeJavaScript("scrollY")) > 100);
  r = await clickIn(wc, { selector: "#add" }); await sleep(200);
  check("clicks by CSS selector", r.ok && r.tag === "button");
  r = await clickIn(wc, { text: "Hidden" });
  check("does not click a hidden element and lists what is clickable", !r.ok && r.items.some((i) => i.includes("Add room")) && !r.items.some((i) => i.includes("Hidden")));
  r = await clickIn(wc, { text: "no such thing" });
  check("reports a missing element", !r.ok && r.count === 0);
  console.log(results.every(Boolean) ? "ALL PASSED" : "SOME FAILED");
  app.exit(results.every(Boolean) ? 0 : 1);
});
