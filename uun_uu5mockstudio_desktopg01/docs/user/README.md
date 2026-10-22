# uu5Mock Studio: user guide

This guide is for people who design screens with the app. It follows what you do, from the first start to sharing a result.

1. [Getting started](01-getting-started.md): install, first start, setup of Claude Code and the plugins, the welcome tour.
2. [Projects, screens and the canvas](02-projects-screens-canvas.md): where the files live, zoom and pan, device sizes, presenting, notes.
3. [The chat and the agent](03-chat-and-agent.md): describe a screen, attach images, mention things with `@`, pick components, the Agent and Plan modes.
4. [Plan mode](04-plan-mode.md): a plan with questions and a component tree you can rearrange, then build it.
5. [The inspector](05-inspector.md): pick a component, change its props, edit lists of actions, undo and redo.
6. [The component tree of a screen](06-component-tree.md): see how a screen is composed and rearrange it.
7. [Project memory](07-project-memory.md): business rules, descriptions, notes, the linked git repository.
8. [Export and share](08-export-and-share.md): image, HTML, ZIP, drag into other apps.
9. [Appearance and settings](09-appearance-and-settings.md): theme, Glass Effect, offline use, updates.
10. [Keyboard shortcuts and menus](10-shortcuts-and-menus.md).
11. [Troubleshooting](11-troubleshooting.md).

## The idea in one minute

- You work in a **project**: a folder. Every `.html` file in it is a **screen** and appears as a frame on the **canvas**.
- You talk to **Claude Code** in the chat. It writes the screens, looks at the result in the preview and fixes errors.
- You can change a screen yourself in the **inspector** (props, texts, icons) without writing code. Every such change is written to the file and can be undone.
- **Plan mode** lets Claude propose a plan first: questions to answer and a component tree to rearrange. Nothing is built before you approve it.
- Rules and decisions that come up are kept as plain Markdown next to the screens, so later tasks (building the real components) can read them.
