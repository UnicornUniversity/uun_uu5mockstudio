# 7. Project memory

What is learned while designing does not stay in the chat. It is kept as plain files next to the screens, so it survives, can be read by people and by later tasks (building the real components), and can be edited by hand. Claude reads this memory with every request.

## Business rules

**Project → Business Rules… (⌥⌘R)** or the book icon in the top bar (it shows the number of rules).

- Rules are bullets in `BUSINESS_RULES.md`: `- R-012 text` under `## General` for a rule of the whole project, and `- R-012 (screen: name) text` under `## Screen: name` for a rule of one screen.
- The dialog shows them rendered. **Click a rule to edit it in place**, use the cross to delete it, or type a new rule at the bottom, choose the section (General or a screen) and press Enter. The **‹ › button** switches to the Markdown code and back.
- **Sections roll up**: click the heading (General, Screen: …) to hide its rules; the number of hidden rules is shown, and the choice is remembered.
- **This project (N)** and **All projects (N)** switch between the two files and show how many rules each holds.
- **Claude records rules itself**, without asking: the rules you state, and the rules the screen it builds implements (who may do what, conditions of a change of state, validations and required data, what is shown or hidden by role or state, calculations and thresholds). A rule Claude worked out or chose itself ends with **(assumed)**, so you can confirm or correct it. Purely visual details and controls that exist only for the demo are not recorded. After recording, Claude says in one line which rules it added.
- The **project description** is shown in a line above the canvas only when there is one; add it with the ⓘ button in the top bar or **Project → Project Description…** (⌥⌘D).
- **Deleting a screen removes the rules of that screen** (and its description). A copy is kept in `.studio/removed-screen-memory.md`.

### Rules for all projects

The **All projects** tab edits `GLOBAL_RULES.md` in the folder of your projects. Rules there (`- G-001 text`) apply in every project, for example *"the business component is always a `Plus4U5Elements.ContentContainer`"*. Claude records a rule there when you say it holds always, for every screen or in all projects; any other rule goes to the project file. Components named in the rules (for example `@Uu5Elements.Block`) are described to Claude, so it knows their props. When a request conflicts with a standing rule Claude says so and asks before breaking it.

## Descriptions

**Project → Project Description…** (⌥⌘D) and **Screen → Description…** edit `PROJECT.md`: what the project is and what each screen is for. Claude reads it for context and changes it only when you ask.

## Notes

Yellow sticky notes of a screen, kept in `<screen>.notes.md`; see [Projects, screens and the canvas](02-projects-screens-canvas.md#notes-on-a-screen). Claude reads them before it changes the screen and never edits them.

## Linked git repository

Link the repository where the real components will be built: **Project → Git Repository → Link…**. Claude gets **read-only** access to it: it can read files to stay consistent with names, props and structure, and **never writes there**; mockups, rules and notes go only into the project folder. Secrets, `.git` and `node_modules` are not readable.

- **Switch Branch…** reads another branch as a read-only snapshot (the working copy of the repository is never changed).
- Mention files with `@repo/path/to/file` in the chat.
- **Open Repository Folder** shows it in the file manager; **Unlink Repository** (also the cross on the repository strip) asks first.
