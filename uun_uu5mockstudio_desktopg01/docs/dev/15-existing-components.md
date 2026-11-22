# 15. Existing components: start from code, update from code, hand off

A project can start from a component that already exists in the linked git repository, follow that component when its code changes, and go back to the repository as a feature branch. This chapter describes the whole round trip. The user's view is in [Export and share](../user/08-export-and-share.md#start-from-an-existing-component); the files are in [Files, state and formats](08-files-and-state.md); the channels are in [IPC reference](09-ipc-reference.md#existing-components-and-handoff).

## Reading a component from the code (`componentTree.mjs`)

`asIsTree(repoDir, file, { depth = 3, component })` reads a component file of the repository with Babel and follows its imports (`resolveImport`) into the repository's own components, up to `depth` levels. → `{ tree, files }`.

- **Nodes** are `{ name, kind: "existing", role, source, props?, render?, relation?, children }`. `role` is `visual` or one of the non-visual roles (`provider`, `context`, `hook`, `data`, `component`; `unknown` when it cannot be told); `source` is the file the node is defined in; `render` is the condition it is shown under; `relation: "N"` marks a list (×N).
- **Library components** keep their real names (`libraryName`, e.g. `Uu5Elements.Block`, `Plus4U5Elements.ContentContainer`); `libraryRole` tells the non-visual ones by name (`…Provider`, `…Loader`, `…Resolver`).
- **JSX passed through props** is followed too: through a split of props and a spread (`{...containerProps}` with `title: <Header/>`).
- `screenNameOf(name)`: the file name of the screen of a component (`CourseHeader` → `course-header`).

The reading is saved as a **plan** so that the existing tooling (plan cards, trees, the diagram) can show it:

| Plan | Front matter | Made by | What it means |
| --- | --- | --- | --- |
| **Baseline** `“<Name> (as is)”` | `baseline: <file>` | `baselinePlan()` | The component is extended or redesigned. Its tree is the starting point; the screen draws it. |
| **Reference** `“<Ref> (reference for <Name>)”` | `reference: <file>`, `component: <Name>` | `referencePlan()` | A **new** component follows this one (structure, style, conventions). Nothing of it is built. |

`readBaselines(projectDir)` / `readReferences(projectDir)` list them, newest first. While a project has baselines or references, `ClaudeService` adds `baselinePrompt()` / `referencePrompt()` to the system prompt ([04](04-agent.md)): the components, their screens and the rule that the screen keeps the names and the library components of the code (`libraryRule`).

## Start from an existing component

`componentStartDialog.js` (from the dashboard, **Project → Git Repository → Start from an Existing Component…**, **Project ▾**, or a chat message with an `@repo/` file and words like *redesign, based on, další*) picks the file with `repoFilePicker.js`, the mode (extend / new) and an optional screenshot. From the dashboard there is no project yet: `prepare({ repoPath })` makes it and links the repository first.

`component:start(file, { mode, name, description })`:

- **extend**: `asIsTree` → the baseline plan (status `approved`) → `state.componentSync[<slug>] = { tree, at }` (the reading the screen is made from) and `state.screenBaselines["<screen>.html"] = <slug>` (the link of the screen to its component). Returns `screenBrief()`, the task for the agent: build the component as it is, with the real visual names; fake only the non-visual parts.
- **new**: the reference plan and `referenceBrief()`; no link and no sync state.

The renderer sends the brief as the agent's task (`componentBrief`).

## Screens of several components

A project may hold screens of several existing components, so every operation asks **which component a screen shows** (`componentUpdate.mjs`):

1. `state.screenBaselines[file]`, written by `component:start`;
2. else `baselineFor()`: the baseline whose `screenNameOf(name).html` is the file, else the only baseline whose root component the screen draws (`structureOf` of the screen), else the only baseline;
3. else `null`, meaning not made from a component.

`screenBaselines(projectDir, baselines, files?)` → `Map(file → baseline | null)`; `baselinesWithScreens()` adds `screens` to each baseline for the menus (`component:origin`) and the agent's prompt. Everything that compares a screen with code uses it: `component:baseline` / `component:focus` (the component tree starts at the screen's own component), `component:reread`, `component:update`, `screenExceptions()` and the handoff (`handoffComponents` keeps only the screens of the redesigned baseline; `handoff:create` with `@redesign:<slug>` hands over that baseline's screens).

## Exceptions to the code

After the agent changes screens the renderer calls `component:exceptions(files)`. `screenExceptions()` (`handoffPackage.mjs`) compares each screen with its origin through `libraryDeviations(codeTree, screenView, html)`:

- `standIns`: library objects the mockup only simulates (`const Plus4U5App = { … }`, `standInsOf`);
- `drawnAs`: a library component drawn with an equivalent (`LIB_EQUIV`: ContentContainer as Block);
- `notInCode`: library components the code does not use;
- `notOnScreen`: those of the code the screen does not draw (redesign only).

`deviationLines()` turns them into text for the chat card **Exceptions to <component> in the code** and for HANDOFF.md.

## Re-read the code

`component:reread(screen)` reads the screen's component again and rewrites its baseline plan with the same slug and date. The **first** re-read first copies the old tree into `state.componentSync[slug]` when there is none, so that Update from code still compares with the reading the screen was made from, not with the newer one.

## Update from code

The goal is to bring a change of the code into the screen without losing what the user changed on it. Three versions meet:

- **before**: the tree the screen was made from (`state.componentSync[slug].tree`; for older projects without it, the baseline plan's tree);
- **after**: the tree read from the repository now;
- **the screen**: its HTML and its tree (`structureOf`).

`component:update(screen)` (screen: the given one, else the screen of the only component, else the only screen):

1. reads `after` and rewrites the baseline plan with it;
2. `planUpdate({ before, after, screenTree, html })` computes:
   - `treeDelta(before, after)`: `added` / `removed` / `changed` nodes. Children are paired by `name|source` in order, so a component that appears twice pairs with its twin. `changed` covers role, the render condition, ×N, and props added, removed or changed.
   - `libs`: the library components the screen still draws with a stand-in or an equivalent (`notInCode` is left out: it may be the user's own addition).
   - `additions` (`screenAdditions`): the parts the screen has beyond `before`, which are the user's work and must stay.
   - `upToDate` when there is no delta and no stand-in or equivalent. The sync state then moves to `after` and nothing goes to the agent.
3. otherwise keeps `{ tree: after, file, html }` in `pendingSync` (in memory, by slug) and returns `updateBrief()`: the delta as lines (`+`, `-`, `~`; the visual parts first), the library notes, the parts that must stay, `before` and `after` as outlines, and the rules. Only the delta is brought in; on a clash the user's version stays and is listed under **Conflicts**. `known: false` (no sync state) tells the agent to compare the screen with the code itself.

The renderer (`updateFromCode` in `renderer.js`) sends the brief in Agent mode. When the agent's turn has changed that screen, `finishCodeUpdate` calls `component:synced(slug)`: `componentSync[slug]` becomes `after`, and `screenHistory` records the HTML from before the update against the current file as **one undo step** (`"Update from code"`). The toast offers Undo.

`linkedScreens` (from `component:origin`) decides where **Update from code…** is offered: in the **Code** submenu of a screen made from a component and in **Project ▾** (`updateTarget()`: the selected screen if it is linked, else the only linked screen).

## Hand off for production

The package and the branch are described in [08](08-files-and-state.md) (`handoffPackage.mjs`, `handoffBranch.mjs`, `handoffLinks.mjs`). `handoffCommand.mjs` writes the texts that go with it:

- `buildInstructions()` → `BUILD.md`, the task for the agent that builds: what to modify in place, create, remove, leave as it is or not build;
- `handoffPrompt()` → `PROMPT.md`, the same task in plain words for the developer to send to Claude Code or Codex;
- `slashCommand()` → `.claude/commands/build-handoff.md` (`/build-handoff <slug>`);
- `developerCommands()` / `workspaceCommands()`: the shell commands shown in the dialog.

`handoffDialog.js`, step 2 **Build it in your tool**, has tabs only for the tools found on this computer: `handoff:tools` → `devTools()` (`devTools.mjs`) looks for the Claude and Codex apps (folders on macOS / Windows, or the URL scheme via `app.getApplicationNameForProtocol`), the `claude` and `codex` command-line tools (`findClaude`, `findCodex`), VS Code and its extensions (`~/.vscode/extensions`: `anthropic.claude-code*`, `openai.chatgpt*` = Codex). `handoffTabs()` orders them `vscode` (only with an agent extension or a CLI), `app`, `codex`, `terminal` (with a CLI); when nothing is found there is one tab, `task`.

## Tests

`test/componentTree.test.mjs`, `componentUpdate.test.mjs` (delta, baselineFor, the brief), `componentProps.test.mjs`, `handoff*.test.mjs` and `devTools.test.mjs`. The fixtures `test/fixtures/brickrepo` and `test/fixtures/uu5repo` are small repositories with providers, hooks, data loading and spread props.
