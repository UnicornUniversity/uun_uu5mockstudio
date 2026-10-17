// usage: node cdp-ui.mjs <cmd> [arg]  cmds: send <text> | stop | wait | dump | shot <file>
const [cmd, arg] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9333}/json`)).json();
const ws = new WebSocket(targets.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result); };
const call = (method, params) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => (await call("Runtime.evaluate", { expression, returnByValue: true })).result.value;
if (cmd === "send") await ev(`(()=>{const t=document.getElementById("prompt");t.value=${JSON.stringify(arg)};document.getElementById("form").requestSubmit();})()`);
if (cmd === "stop") await ev(`document.getElementById("stop").click()`);
if (cmd === "wait") for (let i = 0; i < 200; i++) { if (await ev(`document.getElementById("stop").hidden`)) break; await new Promise((r) => setTimeout(r, 3000)); }
if (cmd === "dump") console.log(await ev(`document.getElementById("log").innerText`));
if (cmd === "shot") { const s = await call("Page.captureScreenshot", { format: "png" }); (await import("node:fs")).writeFileSync(arg, Buffer.from(s.data, "base64")); }
if (cmd === "state") console.log(await ev(`JSON.stringify({stopHidden:document.getElementById("stop").hidden,sendDisabled:document.getElementById("send").disabled,setupHidden:document.getElementById("setup").hidden})`));
ws.close();
