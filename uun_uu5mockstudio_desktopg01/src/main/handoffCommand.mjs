/**
 * The instructions that go with a handoff package into the repository, so that Claude Code (or Codex) in the developer's editor knows
 * what to do with it. BUILD.md (in the package) holds them; PROMPT.md is the task in plain words that the developer sends to the agent
 * (Claude Code or Codex, in an app, in VS Code or in a terminal); the slash command `/build-handoff <slug>` of Claude Code points to BUILD.md.
 */
export const HANDOFF_ROOT = ".uu5mock/handoff";
export const COMMAND_FILE = ".claude/commands/build-handoff.md";

/** BUILD.md of a package: the task for the agent that builds the real components. `components`: [{ name, target? }]. */
export function buildInstructions({ slug, project, components = [], mockOnly = [], removed = [], unchanged = [] }) {
  const dir = `${HANDOFF_ROOT}/${slug}`;
  const role = (c) => (c.role && c.role !== "visual" ? ` (non-visual: ${c.role === "component" ? "createComponent" : c.role === "data" ? "data loading" : c.role})` : "");
  const list = components.length ? components.map((c) => `- \`${c.name}\`${role(c)}${c.source ? `: **modify** the existing \`${c.source}\` in place (keep its decomposition; the changes of its interface are in HANDOFF.md)` : c.target ? `: **create** \`${c.target}\`` : ": **create** it where this repository keeps components of this kind"}`).join("\n") : "- (no component was marked as new: build the screens' own components listed in HANDOFF.md)";
  return `# Build the components of “${project}”

This folder is a handoff from uu5Mock Studio: a solution architect designed these components and approved their mockups.
Build them for real in this repository.

## Read first
1. \`${dir}/HANDOFF.md\`: the components to build (props, acceptance criteria, where they are used), the plan with its component tree, the business rules and the structure of every screen.
2. \`${dir}/handoff.json\`: the same in a structured form (use it for exact names, props and paths).
3. \`${dir}/mockups/*.html\`: the approved mockups. They are the **visual and behavioural reference**, not code to copy: they are standalone HTML with inline JSX and fake data. Look at \`${dir}/screens/*.png\` for how they look (to run them: \`node ${dir}/serve.mjs\`).

## Components
${list}

${unchanged.length ? `Leave ${unchanged.map((n) => `\`${n}\``).join(", ")} as ${unchanged.length === 1 ? "it is" : "they are"} (unchanged parts of the existing component).\n\n` : ""}${removed.length ? `Remove ${removed.map((c) => `\`${c.name}\`${c.source ? ` (\`${c.source}\`)` : ""}`).join(", ")}: the redesign drops ${removed.length === 1 ? "it" : "them"}; delete the file only when nothing else uses it.\n\n` : ""}${mockOnly.length ? `Do NOT build ${mockOnly.map((n) => `\`${n}\``).join(", ")}: ${mockOnly.length === 1 ? "it exists" : "they exist"} only for the mockup (demo switches, simulated data).\n\n` : ""}## How to build
- Use the uu5 development knowledge: the skills of the \`uu5-development\` plugin (uu5-knowledge first; uu5-forms-composition for forms, uu5-tiles-composition for lists and tables) and of \`uugds\` (uugds-knowledge, uugds-icons) for the look, spacing and texts.
- Follow the conventions of THIS repository first: look at a few existing components of the same kind (file layout, createVisualComponent / createComponent, nestingLevel, uu5Tag, lsi texts, styles, tests) and do the same.
- Keep the decomposition of the plan: the component that loads data sits above the one that shows it; data flow goes only down, children report up through handlers.
- The non-visual parts of the plan (non-visual components, providers, contexts, hooks, data loading) have no mockup: write them as the repository does (createComponent, contexts, use… hooks, useDataObject / useDataList with the calls named in the note) and connect them as the tree shows.
- A component marked "keep" in the plan's tree stays as it is: do not refactor it.
- Implement the props exactly as specified (names, types, required, defaults); add propTypes and defaultProps.
- Every acceptance criterion must hold; the business rules (R-nnn) are constraints, not suggestions.
- Real data comes from the application's calls, not from the mockup's fake data; where a call does not exist yet, leave a clear TODO and a mock in one place.
- Do not edit anything in \`${HANDOFF_ROOT}/\`.

## When done
Run the repository's lint and tests, then report: the files created or changed, each acceptance criterion and whether it holds, and what is left open (questions for the architect).
`;
}

/**
 * The task in plain words, made from what is handed over: which files change and how, which components are created and what for, what is
 * removed and what stays, and where the details are. It is what the developer sends to the agent; one prompt for Claude Code and Codex.
 */
export function handoffPrompt({ slug, title, components = [], removed = [], unchanged = [], asIs = null }) {
  const dir = `${HANDOFF_ROOT}/${slug}`, file = (c) => (c.source ? `\`${c.source}\`` : c.target ? `\`${c.target}\`` : null);
  const role = (c) => (c.role && c.role !== "visual" ? ` (${c.role === "component" ? "non-visual component" : c.role === "data" ? "data loading" : c.role})` : "");
  const what = (c) => (c.note ? ` – ${c.note}` : "");
  const modify = components.filter((c) => c.source), create = components.filter((c) => !c.source);
  const L = [asIs ? `Extend the component ${asIs} in this repository as the solution architect designed it (${title}).` : `Build ${title} in this repository as the solution architect designed it.`, ""];
  if (modify.length) L.push("Change:", ...modify.map((c) => `- ${c.name} in ${file(c)}${c.why ? `: it ${c.why}` : ""}${what(c)}`), "");
  if (create.length) L.push("Create:", ...create.map((c) => `- ${c.name}${role(c)}${what(c)}${c.target ? ` → ${file(c)}` : ""}`), "");
  if (removed.length) L.push("Remove:", ...removed.map((c) => `- ${c.name}${c.source ? ` (${file(c)})` : ""}`), "");
  if (unchanged.length) L.push(`Leave as it is: ${unchanged.length > 6 ? `${unchanged.slice(0, 6).join(", ")} and ${unchanged.length - 6} more` : unchanged.join(", ")}.`, "");
  L.push(`The details are in ${dir}/: read BUILD.md first and follow it. HANDOFF.md has the props, the acceptance criteria and the component structure; mockups/ and screens/ show the approved look – a reference, not code to copy. Follow the conventions of this repository and use the uu5 and uuGDS skills.`);
  return L.join("\n");
}

/** The Claude Code slash command in the repository: `/build-handoff <slug>`; without a slug the only (or newest) package. */
export function slashCommand() {
  return `---
description: Build the components handed over from uu5Mock Studio (.uu5mock/handoff/<name>)
argument-hint: <handoff name>
---
Build the components handed over from uu5Mock Studio.

The handoff to build: \`${HANDOFF_ROOT}/$ARGUMENTS/\`. When no name was given, list the folders in \`${HANDOFF_ROOT}/\` and take the only one; if there are several, ask which.

Read \`BUILD.md\` in that folder and follow it exactly.
`;
}

/** A text as one argument of the shell (single quotes). */
const shq = (t) => `'${String(t).replace(/'/g, "'\\''")}'`;
/** The terminal commands in the folder of the branch: the agent started with the task. */
export function workspaceCommands({ path: dir, prompt }) {
  return { claude: `cd ${shq(dir)} && claude ${shq(prompt)}`, codex: `cd ${shq(dir)} && codex ${shq(prompt)}` };
}

/** The commands the developer runs (shown and copied by the app). */
export function developerCommands({ branch, slug }) {
  return {
    claude: `git switch ${branch} && claude "/build-handoff ${slug}"`,
    codex: `git switch ${branch} && codex "Read ${HANDOFF_ROOT}/${slug}/BUILD.md and follow it exactly."`,
  };
}
