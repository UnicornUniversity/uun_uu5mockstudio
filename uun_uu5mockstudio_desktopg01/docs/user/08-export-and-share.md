# 8. Export and share

## The Share menu

**Share ▾** on the bar over a selected screen works in two steps:

1. **What** — pick a tile: **Image** (PNG, JPEG or PDF at the size of the frame), **HTML file** (opens in a browser), **uu5String** (to paste into a document) or **Project ZIP** (every screen with its notes and rules, and the pictures and videos the screens use). The menu remembers the last pick.
2. **What to do with it**:

| Action | Image | HTML file | uu5String | Project ZIP |
| --- | --- | --- | --- | --- |
| **Copy** | the picture | the source text | the uu5String | the file (paste it into Finder, Mail, a chat; on Windows and Linux its path) |
| **Save…** | choose PNG, JPEG or PDF | `.html` | `.uu5string.txt` | `.zip` |
| **⠿ Drag** | press, hold and drag the file into a chat, a mail or a folder (it is prepared when you pick the tile; the button is dim for a moment) | | | |

**Pictures and videos.** The Project ZIP contains every file the screens point to (`assets/…` and other local files, also the pictures of read documents); the screens in it work when unzipped. A **uu5String** cannot carry files and a document does not have them: **Save…** writes `<screen>.assets.zip` next to the text, and after **Copy** the message offers **Files…** to save it. The ZIP has a `README.md` listing which address of the text is which file; upload the files to the document and point the uu5String at them. **Drag** takes only the text.

The same is in the application menu: **File → Export** (Screen as Image, as HTML, Copy Screen as uu5String, Screen as uu5String…, Project as ZIP) and **File → Share** (Screen Image, HTML File, Screen as uu5String, Project ZIP).

## Project specification (for the people who build it)

**File → Export → Project Specification (Markdown)…** (or **Copy Project Specification**) writes one Markdown document for the developers: the overview (the project description), the linked repository, a table of the screens, the business rules, then for every screen its purpose, the **component structure** (the tree of the screen as an outline), the library components and the components defined in the screen, the notes and the comments (open and resolved), and at the end the components overall and the open questions. It is assembled from what the project already holds, so keep the descriptions, the rules and the comments up to date.

The Project ZIP also contains the comments a screen already has (`docs/<screen>.comments.json`; comments are hidden in the app since 0.31.0).

## Start from an existing component

On the dashboard, under the message box: **Extend an existing component** or **New component based on one** (in a project: **Project ▾ → Start from an existing component…** or **Project → Git Repository**). From the dashboard a project is made for it and the repository you choose (the last one is offered) is linked. Choose the component's file (**Choose…** searches the files of the repository) and, if you have one, add a screenshot of it in the real application (paste, drop or choose). **Build the screen**:

- reads the component and the files it imports and saves its real decomposition as the plan **“<Name> (as is)”**: its own components with their files and props, the library components, and what is not visual – providers, contexts, the repository's hooks and data loading (with its handlers and calls), lists (×N) and conditions,
- sends the agent the task to build a mockup screen of it as it is now: the screen's components are named like the real visual ones (so the screen stays linked to the code), the non-visual parts are only faked with mock data.

**From the chat:** write what you want and pick the component with **@** – for example *redesignuj existující komponentu @repo/…/header.js* or *další komponenta CourseList podle @repo/…/header.js*. A message with an **@repo/** component file and words like *redesign, extend, rozšiř, další, nová, podle, based on* opens the same dialog, filled in from the message (the file, the mode, the name and what it should do); **Build the screen** then runs this scenario. Cancel it and send again to send the message as it is. In a project already made from a component, **Project ▾ → Another from an existing component…** starts the next one.

**New component based on one** takes the existing component as the pattern only: give the new component a name and say what it should do; the agent designs it following the existing one's decomposition (with its providers, hooks and data loading), look and conventions, and it is handed over as new.

The component tree of such a screen (right click → Code → Show component tree) shows the **Real structure** first: the component as it is in the code – with its providers, loaders, hooks and data loading (dashed) – and the screen's new parts in their real place (marked new); what the mockup only simulates (states, demo switches, fake data) is not in it. **Re-read the code** reads the component from the repository again. **Only changes** narrows it to the new and changed parts and the way to them (a run of wrappers – loaders, providers – becomes one node that names them). **Mockup** shows the screen's own structure, which can be rearranged (the page shell, demo switches and fake data are hidden; **Mockup helpers** shows them).

**The library components of the code are kept.** The screen (and a plan's tree) uses the same library components as the code, for real – Plus4U5Elements.ContentContainer stays a ContentContainer, a StateBadge is not drawn as a Badge. The Plus4U libraries work in the screens of the app (they are served over http); a component that loads its own data from a uuApp, such as PersonItem, shows without it. Only what cannot run in a mockup (the application shell of Plus4U5App, a library the mockup runtime does not have) is simulated under the real name. After the agent changes a screen, the chat shows a card **Exceptions to <component> in the code**: the simulated components, the ones drawn with an equivalent (ContentContainer as Block), the library components the code does not use (check that they are not a look-alike) and, for a redesign, the ones of the code the screen does not draw. The same list goes into HANDOFF.md (**Exceptions in the mockups**).

### Screens of several existing components

One project can hold screens of **several existing components**: start the next one with **Project ▾ → Another from an existing component…** (or from the chat). Each screen follows the component it was made from. **Project ▾** lists every component with the names of its screens; a click shows the real structure of its screen. The component tree, **Re-read the code**, the exceptions after the agent's changes, **Update from code** and the handoff of a screen all use the screen's own component.

### Update from code

When the component changes in the repository after its screen was made, bring the change into the screen without losing your work: **right-click the screen → Code → Update from code…** (or **Project ▾ → Update from code…**, which works on the selected screen, or on the only screen made from a component).

- The component is read from the repository again and compared with the reading the screen was made from. Only **what changed in the code** (parts added, removed or moved, props, conditions, lists) goes to the agent, together with the library components the screen still draws with a look-alike.
- **Everything you changed on the screen stays**: texts, props, layout, colours, states, fake data and the parts you added. Where a change of the code and your change meet in the same place, your version stays and the agent lists it under **Conflicts** at the end of its answer.
- When nothing changed, the app only says that the screen is up to date.
- The update is **one step of Undo**: the message after it offers **Undo**, and ⌘Z on the canvas does the same. After the update the new reading of the code is the starting point of the next one.

A project from an older version does not know which reading of the code the screen was made from. Then the agent compares the screen with the code directly and keeps everything the code change does not touch.

### Plan the change

Then you change it. In **Plan** mode the agent plans the redesign **against the baseline**: the tree keeps the existing parts with their files and marks each **keep**, **modify** or **remove**, and adds the new ones – also the non-visual ones (a new provider, hook or data loading), which are drawn dashed with their role (logic, provider, hook, data). The screen shows only the visual part. Without a new plan, the handoff compares the screen with the baseline (**Redesign of <Name>**, the default): the parts of the existing component are **Modify**, **Keep** or **Remove**, what the screen adds is **New**, the mockup's helpers are folded away as not built. With a plan, modified files (with the change of their props), new components (visual and non-visual) and the parts to remove; the unchanged ones are context only.

## Hand off for production (into the git repository)

When the design is approved, **Project → Git Repository → Hand Off for Production…** puts everything the developers need into a new branch **feature/<name>** of the linked repository, without touching your working copy:

- the components to build: the components of kind **new** in the tree of the approved plan, with what you fill in for each of them right in the dialog (saved into the plan; while the agent's plan is still proposed you can fill the same in its tree): **File** – where it goes in the repository, **Props** – one per line, `name*: type = default — description`, `*` = required, and **Accept** – the acceptance criteria); in Plan mode the agent proposes them,
- the specification (as above) with the plan and its tree, the mockups, pictures of the screens and the project's description and rules,
- the task for the agent in plain words (PROMPT.md): which files change and how, which components are created, what is removed and what stays. After the branch is made, the dialog asks where to work on it: **In my working copy** (your project folder is switched to the branch with `git switch`; offered when it has no uncommitted changes) or **In a separate folder** (a git worktree next to your repository, your working copy stays as it is; it needs its own `npm install`). Then **Build it in your tool** says what to do, in tabs: **VS Code**, the **Claude app**, **Codex** (its app or command-line tool) and **Terminal**. Only the tools found on this computer are offered: the Claude and Codex apps, their command-line tools (`claude`, `codex`) and VS Code with the Claude Code or Codex extension; when none is found, the dialog shows the task to copy. The task goes to Claude Code or Codex as it is. A later handoff to a branch that is checked out commits only the package files there; your own changes stay out of that commit.

**Without a plan** (or with **What to hand over → The components of the screens**) the dialog lists the components your mockups define themselves. For each choose:

- **New** – it is created (optionally say the file),
- **Modify existing** – a redesign of a component that already is in the repository: pick its file (the dialog suggests files by the name). Its current props are read from it, the handoff lists what changes (props added, changed, removed) and the developer's agent modifies that file in place, keeping its decomposition,
- **Mockup only** – a helper that exists only for the mockup (demo switches, simulated data, the page shell); it is listed as "do not build". The dialog guesses these by their names and notes.

These choices are kept in the project (`.studio/links.json`); with a plan they are kept in the plan's tree.

**From** is where the new branch starts: by default the branch the agent read the code from (the branch of the repository strip in the chat), else the checked-out one; the remote branches (origin/…) are offered too. **Fetch** brings them up to date and the dialog warns when the chosen local branch is behind its remote. The branch starts from the last commit (uncommitted changes are not in it) and does not track the branch it started from.

To hand over **only one screen**, use **Hand off this screen…** in the menu of the screen (right click → **Code**): the package then holds that screen and its components only, and is named after it. A screen made from an existing component is compared with **its own** component, also when the project has screens of several; a redesign of one component hands over only the screens made from it.

**Open in VS Code** opens the repository. Nothing is pushed: push the branch or open a pull request yourself. When the screens change, the dialog says so and **Update branch** adds a new commit.

## uu5String (to paste into a document)

The uu5String is taken from the screen **as it is rendered now**: lists are expanded, texts computed, and the state is the current one (an open tab, a countdown at its current value). Components of uu5 libraries keep the props you set (defaults are left out); components defined in the screen disappear and leave what they render; plain HTML elements stay, and the rules of their CSS classes are written as an inline style.

Only a part of the screen: in the **Edit mode** click a component (Shift-click marks more, also in other screens) and press **Copy as uu5String** in the Edit panel. A component inside a list gives every item of the list.

Not everything can go in. The message after copying says how many notes there are; **Details** lists them:

- event handlers (`onClick`, `onSubmit`, …) are left out;
- a closed dialog (`Modal`, `Drawer`, …) is left out; open it in the screen and copy again to include it;
- CSS that cannot be written inline (`:hover`, nested selectors) is lost;
- components that are not rendered (in a closed dialog, a hidden tab) are left out;
- icons a document may not show: documents can load an older Material Design Icons font (4.x) than the screens (7.x), so a newer icon (`mdi-strategy`, `mdi-rocket-launch-outline`, …) stays empty there. The note names them; pick older icons in the screen if that happens.

The result uses the components of the screen (`Uu5Elements.*`, `Uu5Forms.*`). It renders wherever uu5String can load those libraries; a document that accepts only Bricks components needs it rewritten.

An exported HTML file needs the Plus4U CDN to render, like the screens in the app.
