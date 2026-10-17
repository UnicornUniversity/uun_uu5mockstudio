const targets = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? 9333}/json`)).json();
const t = targets.find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m.result); };
const ev = (expression) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: false } })); });
await ev(`window.__ev=[]; window.studio.onEvent(m=>{ if(m.type==="assistant") for(const b of m.message.content){ if(b.type==="tool_use") __ev.push("TOOL "+b.name+" "+(b.input?.file_path?.split("/").pop()??b.input?.file??b.input?.skill??"")); if(b.type==="text") __ev.push("TEXT "+b.text.slice(0,400)); } if(m.type==="user"&&Array.isArray(m.message?.content)) for(const b of m.message.content){ if(b.type==="tool_result"){ const c=Array.isArray(b.content)?b.content.map(x=>x.type==="text"?x.text:"["+x.type+"]").join(" "):String(b.content); if(/rendered:|console|\\[error\\]|No console/.test(c)) __ev.push("RES "+c.slice(0,350).replace(/\\n/g," | ")); } } if(m.type==="result") __ev.push("DONE "+m.subtype+" err="+m.is_error+" turns="+m.num_turns+" $"+m.total_cost_usd?.toFixed(2)); if(m.type==="app_error") __ev.push("APPERR "+m.message); }); 0`);
await ev(`window.studio.send(${JSON.stringify(process.argv[2])}, "sonnet"); 0`);
let shown = 0;
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const r = await ev(`JSON.stringify(window.__ev)`);
  const list = JSON.parse(r.result.value);
  list.slice(shown).forEach((l) => console.log(l)); shown = list.length;
  if (list.some((l) => l.startsWith("DONE") || l.startsWith("APPERR"))) break;
}
ws.close();
