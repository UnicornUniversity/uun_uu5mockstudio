const ts = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9333}/json`)).json();
const ws = new WebSocket(ts.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result); };
const call = (method, params) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => (await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const m = (type, x, y) => call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
const [text, tag] = process.argv.slice(2);
await ev(`document.getElementById("inspect").click()`); await sleep(2500);
// focus the form frame so it is fully visible, then locate the target element inside the webview
await ev(`document.querySelector(".tab").click()`); await sleep(900);
const pos = JSON.parse(await ev(`(async()=>{
  const v=document.querySelector("webview"); const wr=v.getBoundingClientRect();
  const r=await v.executeJavaScript('(()=>{const e=[...document.querySelectorAll(${JSON.stringify(tag)})].find(x=>x.innerText.trim()===${JSON.stringify(text)});const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,vw:innerWidth}})()');
  const s=wr.width/r.vw; return JSON.stringify({x:wr.left+r.x*s,y:wr.top+r.y*s})})()`));
await m("mouseMoved", pos.x, pos.y); await sleep(300); await m("mousePressed", pos.x, pos.y); await m("mouseReleased", pos.x, pos.y); await sleep(1000);
console.log(await ev(`document.getElementById("insp-info").innerText`));
await ev(`document.getElementById("inspect").click()`);
ws.close();
