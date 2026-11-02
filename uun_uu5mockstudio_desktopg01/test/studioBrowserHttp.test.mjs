import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startBrowserMcpHttp } from "../src/main/studioBrowserHttp.mjs";

const tools = [{ name: "echo", description: "Echo the text", inputSchema: { text: z.string(), n: z.number().int().optional() }, handler: async ({ text, n = 1 }) => ({ content: [{ type: "text", text: text.repeat(n) }] }) }];

test("the tools are served over HTTP and run", async () => {
  const s = await startBrowserMcpHttp(tools);
  try {
    const c = new Client({ name: "t", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL(s.url)));
    const list = await c.listTools();
    assert.deepEqual(list.tools.map((t) => t.name), ["echo"]);
    const r = await c.callTool({ name: "echo", arguments: { text: "ab", n: 2 } });
    assert.equal(r.content[0].text, "abab");
    await c.close();
  } finally { await s.close(); }
});

test("a wrong token or a foreign Host is refused", async () => {
  const s = await startBrowserMcpHttp(tools);
  try {
    const base = new URL(s.url);
    assert.equal((await fetch(`${base.origin}/mcp/nope`, { method: "POST" })).status, 404);
    const r = await new Promise((res) => { const q = import("node:http").then((h) => h.request({ host: "127.0.0.1", port: base.port, path: base.pathname, method: "POST", headers: { host: "evil.example" } }, (x) => res(x.statusCode))); q.then((rq) => rq.end()); });
    assert.equal(r, 404);
  } finally { await s.close(); }
});
