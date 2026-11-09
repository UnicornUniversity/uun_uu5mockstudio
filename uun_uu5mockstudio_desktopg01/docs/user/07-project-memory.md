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

## Brand guidelines

When the customer has a brand manual, give it to the project: **Project → Brand Guidelines… (⌥⌘B)**, or drop a PDF, HTML or Markdown file into the chat (the app asks whether it is a brand manual).

- The manual is stored in the project (hidden folder `.studio/brand/source`, never served) and Claude **distills it once** into **`DESIGN_GUIDE.md`**: colours, typography, spacing and shape, logo, icons and images, tone of voice, do and don't, and where in the manual each part comes from. What Claude had to interpret ends with **(assumed)**. Edit the guide in the dialog; **Distill again** reads the manual again and keeps what you wrote by hand.
- The guide goes into every request, like the business rules, so every screen follows it. The long manual is read again only for a detail the guide does not cover.
- **Colours and fonts are available in every screen as CSS variables** (`--brand-primary`, `--brand-font-body`, …), made from the bullets `- primary: #0057B8 (…)` under *Colours* and `- font-body: Inter, sans-serif` under *Typography*. Uu5Elements components only have their fixed colour schemes, so Claude uses the closest one and puts the brand colour on top through `style` / `className` and these variables.
- Limits: at most 10 files of 50 MB each; ZIP archives are not accepted yet. Logos are added as pictures “In design” (they go to `assets/`).

## Descriptions

**Project → Project Description…** (⌥⌘D) and **Screen → Description…** edit `PROJECT.md`: what the project is and what each screen is for. Claude reads it for context and changes it only when you ask.

## Notes

Yellow sticky notes of a screen, kept in `<screen>.notes.md`; see [Projects, screens and the canvas](02-projects-screens-canvas.md#notes-on-a-screen). Claude reads them before it changes the screen and never edits them.

## Comments

**Comments** (the speech-bubble icon in the top bar, with the number of open ones) are for the conversation between people who review the design, not for the agent. A comment belongs to a screen, or to a component of it (mark it in the inspector and choose **Comment on this**), has an author, can be answered, **resolved** and **reopened**. They are saved beside the screen as `<screen>.comments.json`, so they travel with the project folder and the ZIP; the app is desktop-only and has no server, so a colleague gets them with the files. Your name in comments is the system user; click “You are …” in the dialog to change it.

How they differ from **notes**: a note is yellow context on the canvas that the agent **reads** before it changes the screen (rules, open questions, a decision); it has no author and no state. A comment is a review remark with an author and a state that the agent does not read. Both go into the specification (notes under “Notes”, comments under “Open comments” and “Open questions”).

## Linked git repository

Link the repository where the real components will be built: **Project → Git Repository → Link…**. Claude gets **read-only** access to it: it can read files to stay consistent with names, props and structure, and **never writes there**; mockups, rules and notes go only into the project folder. Secrets, `.git` and `node_modules` are not readable.

- **Switch Branch…** reads another branch as a read-only snapshot (the working copy of the repository is never changed).
- Mention files with `@repo/path/to/file` in the chat.
- **Open Repository Folder** shows it in the file manager; **Unlink Repository** (also the cross on the repository strip) asks first.
