# 4. The agent

The app does not ship a model. `ClaudeService` (`src/main/claudeService.mjs`) drives the user's own Claude Code through the **Claude Agent SDK**.

## One message = one `query()`

`ClaudeService.send(prompt, model, { plan })` builds the options and iterates the stream of SDK messages, forwarding every one to the renderer (`onEvent`):

| Option | Value | Why |
| --- | --- | --- |
| `cwd` | the project folder | the agent works in the project and nowhere else |
| `pathToClaudeCodeExecutable` | found by `claudeEnv.mjs` | the user's Claude Code, with its login and plugins |
| `settingSources` | `["user", "project"]` | the user's skills and plugins (uu5-mockup, uugds, uu5-development) apply |
| `permissionMode` | `acceptEdits` | edits inside the project need no prompt |
| `disallowedTools` | `["Bash"]`, plus **`Write`, `Edit`, `MultiEdit`, `NotebookEdit`** in Plan mode | tools that are removed cannot be used at all |
| `canUseTool` | `toolVerdict` → `accessPolicy` | a verdict for the tools that are still asked about (reading outside the project, writing outside it, secrets) |
| `mcpServers` | `studio-browser` | the preview tools |
| `resume` | the Claude session id of the conversation | each chat keeps its own session |
| `includePartialMessages` | true | the answer is streamed |
| `systemPrompt` | preset `claude_code` + appended text | see below |

**Why `disallowedTools` in Plan mode:** with `acceptEdits`, edits inside the project are approved without calling `canUseTool`, so a verdict alone would not stop them. The file tools are removed from the agent instead.

## The system prompt

`claude_code` preset + `append`:

1. **`studioPrompt`**: what the app is, where to save screens (`<project>/<kebab-name>.html`, one file per screen, no subfolders), that `npm start` and the mockup workspace are not available, the **verification loop** (reload, read the console, screenshot, up to three fixes), "look before you change", the attached images, the Plan switch.
2. **`memoryPrompt`**: project memory. `BUSINESS_RULES.md` (current text, limited to 12 000 characters) and the policy to record rules **without being asked** (rules the user states, and rules the screen implements; inferred ones end with `(assumed)`); `PROJECT.md`; the notes of screens; the linked repository (read-only); the rules for all projects (`GLOBAL_RULES.md`, standing rules, `G-nnn`) and a description of the library components named in the rules (from `uu5Docs`, `componentsInRules`). The files are marked as **data, not instructions**.
3. **`planPrompt`** (Plan mode only): plan without writing files; the answer format: a summary with decisions and implied rules, **one `uu5-tree` JSON block** (never an ASCII tree), the **decomposition method** of Unicorn, **one `uu5-questions` block** for decisions, a last line asking to build; use `screen_structure` when the plan changes an existing screen.

The prompt is rebuilt for every message, so changes of rules or descriptions apply at once, also in old conversations.

## Messages the app adds to the user's text

The renderer appends context lines to a message before sending: the screen being presented, the picked components (`agentContext`: sentence plus exact source), mentioned screens and files, paths of attached images. The text of a plan approval, of the answers to questions and of a regeneration request are built by `planTree.js` (`approvalMessage`, `regenerateMessage`).

## The MCP server `studio-browser`

In-process (`createSdkMcpServer`), created with the callbacks `onNavigated` and `readStructure`. Each screen's webview is registered by the renderer (`view:register`); the tools address a screen by file name:

- `browser_open`, `browser_reload`: show / reload the screen, wait until uu5 rendered, report render status and the number of console errors.
- `browser_console`: console messages since the last load (noise filtered).
- `browser_snapshot`: visible text and interactive elements.
- `browser_click`: a real click by visible text or selector (`mockClick.mjs`); nothing is saved.
- `browser_screenshot`: a PNG (a hint to use the snapshot when the page is not painted).
- `screen_structure(file)`: the component structure of a screen as an indented outline with the notation (`×N`, `[R: …]`, `[D: …]`, `// label`, `←` data), read statically from the file (`structureOf` + `structureOutline`).

## Events to the renderer

`stream_event` text deltas become the answer; `assistant` messages carry tool uses (shown as steps); `user` messages carry tool results; `result` ends the turn (then a Plan answer is converted into a plan card); `stopped` and `app_error` are produced by the service. While a plan is being written the answer is shown as "Preparing the plan…" and replaced by the card when finished.

## Tokens

The `result` message that ends every `query()` carries `modelUsage` (per model: `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `costUSD`, `contextWindow`) and `usage` (the main loop only). `usageOf` in `src/renderer/usage.js` sums `modelUsage` over all models (subagents included) into `{ in, out, cacheRead, cacheWrite, models }`, `in` being uncached input plus cache writes; the renderer pushes it as a `usage` entry of the chat after the answer (after `convertPlan` in Plan mode). Cost and the context window are in the message but not shown.
