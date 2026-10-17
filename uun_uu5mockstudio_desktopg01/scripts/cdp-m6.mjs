const ts = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9333}/json`)).json();
const ws = new WebSocket(ts.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result); };
const call = (method, params) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? "EXC " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) : r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mouse = (type, x, y, extra = {}) => call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
const rect = (sel) => ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`).then(JSON.parse);

console.log("selbar initially hidden:", await ev(`document.getElementById("selbar").hidden`));
await ev(`document.querySelector(".tab").click()`); await sleep(1000);
console.log("selbar after select:", await ev(`JSON.stringify({hidden:document.getElementById("selbar").hidden,name:document.getElementById("selname").textContent})`));

// 1) pinch/ctrl+wheel over the selected (interactive) frame
const f = await rect(".fbody"); const before = await ev(`document.getElementById("zpct").textContent`);
for (let i = 0; i < 4; i++) { await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: f.x, y: f.y, deltaX: 0, deltaY: -30, modifiers: 2 }); await sleep(80); }
await sleep(300); console.log("pinch over selected frame:", before, "->", await ev(`document.getElementById("zpct").textContent`));
// plain wheel over the selected frame must still scroll the page, not move the canvas
const camBefore = await ev(`document.getElementById("world").style.transform`);
await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: f.x, y: f.y, deltaX: 0, deltaY: 120 }); await sleep(300);
console.log("plain wheel leaves canvas untouched:", camBefore === await ev(`document.getElementById("world").style.transform`));

// 2) selection bar menus -> export image, then a REAL click on the toast "Zobrazit" link
await ev(`window.__clicks=[]; document.addEventListener("click",(e)=>window.__clicks.push(e.target.tagName+":"+(e.target.textContent||"").slice(0,12)),true)`);
const exp = await rect('#selbar [data-menu="export"]'); await mouse("mousePressed", exp.x, exp.y); await mouse("mouseReleased", exp.x, exp.y); await sleep(300);
console.log("export menu:", await ev(`JSON.stringify([...document.querySelectorAll("#selmenu button")].map(b=>b.textContent))`));
const imgItem = await ev(`(()=>{const b=document.querySelector("#selmenu button");const r=b.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`).then(JSON.parse);
await mouse("mousePressed", imgItem.x, imgItem.y); await mouse("mouseReleased", imgItem.x, imgItem.y); await sleep(3500);
console.log("toast:", await ev(`document.getElementById("toast").hidden ? "hidden" : document.getElementById("toast").textContent`));
const link = await rect("#toast a"); await ev(`window.__clicks.length=0`);
await mouse("mousePressed", link.x, link.y); await mouse("mouseReleased", link.x, link.y); await sleep(300);
console.log("click reached:", await ev(`JSON.stringify(window.__clicks)`));

// 3) deselect by clicking the empty canvas
const c = await rect("#canvas"); await mouse("mousePressed", c.x + 400, c.y + 300); await mouse("mouseReleased", c.x + 400, c.y + 300); await sleep(300);
console.log("selbar after deselect hidden:", await ev(`document.getElementById("selbar").hidden`));
ws.close();
