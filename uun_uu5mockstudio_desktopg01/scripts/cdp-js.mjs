const [expr, reload] = process.argv.slice(2);
const ts = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9333}/json`)).json();
const ws = new WebSocket(ts.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result); };
const call = (method, params) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
if (reload) { await call("Page.reload"); await new Promise((r) => setTimeout(r, Number(reload) * 1000)); }
const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
console.log(r.exceptionDetails ? "EXCEPTION: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) : (r.result?.value ?? JSON.stringify(r)));
ws.close();
