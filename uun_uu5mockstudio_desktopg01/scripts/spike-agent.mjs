import { query } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "node:child_process";

const claude = execSync("which claude").toString().trim();
const q = query({
  prompt: process.argv[2] ?? "Reply with just OK.",
  options: {
    cwd: new URL("../project", import.meta.url).pathname,
    pathToClaudeCodeExecutable: claude,
    settingSources: ["user", "project"],
    permissionMode: "plan",
    maxTurns: 2,
  },
});
for await (const m of q) {
  if (m.type === "system" && m.subtype === "init") {
    console.log("plugins:", JSON.stringify(m.plugins));
    console.log("skills with mockup/gds:", (m.skills ?? []).filter((s) => /mockup|gds/i.test(s)));
    console.log("model:", m.model);
  } else if (m.type === "result") {
    console.log("result:", m.subtype, m.result ?? "");
  }
}
