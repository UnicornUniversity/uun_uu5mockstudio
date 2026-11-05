// A stand-in for the uu_aichat_mcputilityg01 proxy: the status / login tools and the load tools of uuBookKit and uuManagementKit.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

let signedIn = process.env.FAKE_SIGNED_IN === "1";
const server = new McpServer({ name: "fake-doc", version: "1" });
const text = (o) => ({ content: [{ type: "text", text: typeof o === "string" ? o : JSON.stringify(o) }] });
server.registerTool("uuAiChatMcpStatus", { inputSchema: {} }, async () => text({ token: { present: signedIn }, serverUrl: process.env.SERVER_URL }));
server.registerTool("uuAiChatMcpLogin", { inputSchema: {} }, async () => { signedIn = true; return text("Authenticated."); });
server.registerTool("toolUuBookKitLoadPage", { inputSchema: { targetAwid: z.string(), code: z.string() } }, async ({ targetAwid, code }) => {
  if (!signedIn) return { ...text("Authentication failed: no token"), isError: true };
  return text({ page: { code, name: { cs: "Správa místností", en: "Room management" }, awid: targetAwid }, sectionList: [
    { code: "a1", header: { cs: "Úvod" }, content: '<uu5string/><Uu5Bricks.Section header="Úvod">Seznam <b>místností</b> &amp; kapacit.</Uu5Bricks.Section>' },
    { code: "a2", header: "Role", content: "<uu5string/><UuContentKit.Bricks.BlockInfo>Správce smí mazat.</UuContentKit.Bricks.BlockInfo>" },
  ] });
});
server.registerTool("toolUuManagementkitEccPanelGetContent", { inputSchema: { documentUrl: z.string(), targetAwid: z.string(), pageOid: z.string().optional() } }, async () => text({
  entityType: "document", pageName: "Portál praxí",
  sectionList: [
    { index: 0, sectionOid: "s1", truncated: false, contentUu5String: '<Uu5Bricks.Lsi><Uu5Bricks.Lsi.Item language="cs"><UuContentKit.Images.Image src="66cdbdfefbc8750023912811" fileName="corp2.jpg"/>Text</Uu5Bricks.Lsi.Item></Uu5Bricks.Lsi>' },
    { index: 1, sectionOid: "s2", truncated: true, contentUu5String: '<uu5string/><Uu5Bricks.Section header="Partneři"><Uu5Bricks.Link href="https://a.test/getDa...' },
  ],
}));
// the whole content of one section (the load tool above cuts long ones)
server.registerTool("toolUuManagementkitEccSectionGet", { inputSchema: { sectionOid: z.string(), documentUrl: z.string().optional(), targetAwid: z.string().optional() } }, async ({ sectionOid }) =>
  sectionOid === "s2" ? text({ entityType: "document", sectionOid, content: '<uu5string/><Uu5Bricks.Section header="Partneři"><Uu5Bricks.Link href="https://a.test/getData?x=1">Hardwario</Uu5Bricks.Link></Uu5Bricks.Section>' }) : { ...text("Unknown section"), isError: true });
server.registerTool("toolUuManagementkitEbcFileLoad", { inputSchema: { documentUrl: z.string(), targetAwid: z.string(), fileOid: z.string(), pageOid: z.string().optional() } }, async ({ fileOid, pageOid }) => text({
  fileOid, name: "corp2.jpg", contentType: "image/jpeg", loaded: true, pageOidSent: Boolean(pageOid),
  contentIntent: { parts: [{ filename: "corp2.jpg", contentType: "image/jpeg", file_url: `https://uuapp.plus4u.net/uu-appbinarystore-maing02/x/binary/getData?code=${fileOid}` }] },
}));
await server.connect(new StdioServerTransport());
