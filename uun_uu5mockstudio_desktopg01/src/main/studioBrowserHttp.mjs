import http from "node:http";
import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const readBody = (req) => new Promise((resolve, reject) => {
  let n = 0; const parts = [];
  req.on("data", (c) => { n += c.length; if (n > 4e6) { reject(new Error("too big")); req.destroy(); } else parts.push(c); });
  req.on("end", () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString("utf8")) : undefined); } catch (e) { reject(e); } });
  req.on("error", reject);
});

/**
 * The tools of the studio-browser (`{ name, description, inputSchema, handler }`, as made by `tool()`) as an MCP server over HTTP on
 * 127.0.0.1, for agents that cannot take an in-process server (Codex). Stateless: every request gets its own server.
 * The URL holds a random token and the Host header is checked, so that no web page can reach the preview of the user.
 */
export async function startBrowserMcpHttp(tools) {
  const token = randomBytes(16).toString("hex");
  const make = () => {
    const server = new McpServer({ name: "studio-browser", version: "0.3.0" });
    for (const t of tools) server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, (args, extra) => t.handler(args, extra));
    return server;
  };
  const srv = http.createServer(async (req, res) => {
    const fail = (code, msg) => { if (!res.headersSent) res.writeHead(code, { "content-type": "text/plain" }); res.end(msg); };
    if (req.url !== `/mcp/${token}` || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? "")) return fail(404, "not found");
    if (req.method !== "POST") return fail(405, "method not allowed");
    try {
      const body = await readBody(req);
      const server = make(), transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) { fail(400, String(e?.message ?? e)); }
  });
  await new Promise((resolve, reject) => { srv.once("error", reject); srv.listen(0, "127.0.0.1", resolve); });
  srv.unref();
  return { url: `http://127.0.0.1:${srv.address().port}/mcp/${token}`, close: () => new Promise((r) => srv.close(r)) };
}
