import { ClaudeService } from "../src/main/claudeService.mjs";
import path from "node:path";
const cwd = path.resolve("project");
const svc = new ClaudeService({ cwd, port: 4999, onEvent: (m) => {
  if (m.type === "assistant") for (const b of m.message.content) {
    if (b.type === "tool_use") console.log("TOOL", b.name, b.input?.skill ?? b.input?.file_path ?? "");
    if (b.type === "text") console.log("TEXT", b.text.slice(0, 300));
  }
  if (m.type === "result") console.log("RESULT", m.subtype, m.is_error, "turns", m.num_turns, "cost", m.total_cost_usd);
  if (m.type === "app_error") console.log("APPERR", m.message);
}});
await svc.send(process.argv[2], "sonnet");
