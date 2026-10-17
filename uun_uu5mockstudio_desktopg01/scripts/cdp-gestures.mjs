const ts = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9333}/json`)).json();
const ws = new WebSocket(ts.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result); };
const call = (method, params) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => (await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mouse = (type, x, y, extra = {}) => call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
const snap = () => ev(`JSON.stringify({pct:zpct.textContent,world:world.style.transform,sel:[...document.querySelectorAll(".frame")].map(f=>f.classList.contains("sel")),pos:[...document.querySelectorAll(".frame")].map(f=>f.style.left+","+f.style.top),shield:[...document.querySelectorAll(".shield")].map(s=>s.hidden)})`);
const rect = (sel) => ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,l:r.left,t:r.top}})()`);

console.log("start      ", await snap());
const c = await rect("#canvas");
await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: 0, deltaY: -150, modifiers: 2 });
await sleep(300); console.log("ctrl+wheel ", await snap());
await call("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: 0, deltaY: 120 });
await sleep(300); console.log("wheel pan  ", await snap());
// drag background to pan
await mouse("mousePressed", c.l + 30, c.t + 30); await mouse("mouseMoved", c.l + 90, c.t + 70, { buttons: 1 }); await mouse("mouseReleased", c.l + 90, c.t + 70);
await sleep(300); console.log("bg drag    ", await snap());
// click shield -> select
const b = await rect(".fbody");
await mouse("mousePressed", b.x, b.y); await mouse("mouseReleased", b.x, b.y);
await sleep(300); console.log("click frame", await snap());
await ev(`document.getElementById("fit").click()`); await sleep(500);
// drag title
const t = await rect(".ftitle .fname");
await mouse("mousePressed", t.x, t.y); await mouse("mouseMoved", t.x + 100, t.y + 60, { buttons: 1 }); await mouse("mouseReleased", t.x + 100, t.y + 60);
await sleep(300); console.log("title drag ", await snap());
// device switch
await ev(`(()=>{const s=document.querySelector(".fdev");s.value="mobile";s.dispatchEvent(new Event("change"))})()`);
await sleep(300); console.log("mobile     ", await ev(`document.querySelector(".fbody").style.width+"x"+document.querySelector(".fbody").style.height`));
await ev(`document.getElementById("fit").click()`); await sleep(500);
console.log("fit        ", await snap());
await call("Page.captureScreenshot", { format: "png" }).then(async (s) => (await import("node:fs")).writeFileSync(process.argv[2], Buffer.from(s.data, "base64")));
ws.close();
