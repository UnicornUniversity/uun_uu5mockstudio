/** Minimal Chrome DevTools Protocol client over the global WebSocket (Node 22+): enough to drive the app and record its window. */
export async function connect(port, { urlPattern = /index\.html/, tries = 60 } = {}) {
  let target;
  for (let i = 0; i < tries && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page" && urlPattern.test(t.url)); } catch { /* app not up yet */ }
    if (!target) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!target) throw new Error(`No app window found on port ${port}.`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), handlers = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(`${d.error.message}`)) : res(d.result); }
    else if (d.method) for (const h of handlers.get(d.method) ?? []) h(d.params);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  return {
    send,
    on: (method, fn) => handlers.set(method, [...(handlers.get(method) ?? []), fn]),
    /** Evaluate an expression in the app window (awaits promises, returns the value). */
    async ev(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    close: () => ws.close(),
  };
}
