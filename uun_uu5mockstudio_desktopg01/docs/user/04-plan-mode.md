# 4. Plan mode

Use Plan for a bigger step: a new screen, a rewrite, several screens. Claude proposes a plan; you answer its questions, rearrange the component tree, and only then approve. In Plan mode Claude **cannot write any file**.

Switch with the mode menu under the message field (**Agent ▾ / Plan ▾**), then describe what you want. Claude may read your screens, take screenshots and read the component documentation while it plans.

## What a plan contains

1. **A summary**: what will be built or changed and why, the decisions Claude made, and the **business rules the plan implies** (they are recorded when the plan is built).
2. **Questions** (when Claude needs your decisions): cards with options, up to four questions. The recommended option is first and is marked *(Recommended)*; some questions allow several answers; every question has an **Other…** field. The header shows how many are answered.
3. **A component tree**: the screen as a tree of components, in the order they are rendered.

The answer of Claude is shown once, as the finished plan (while it is written the chat shows "Preparing the plan…").

## Answering the questions

Click the options (or type in **Other…**). Unanswered questions are left to Claude, which says what it chose. **Update the plan with my answers** sends your answers back and Claude returns an updated plan (the old one is marked as replaced); **Build** sends the answers with the approval.

## The component tree

The tree is a diagram by default (switch to **Outline** for a compact list):

- Boxes from top to bottom, siblings from left to right **in the order of rendering**. A box shows the name of the component, a colour for its kind (screen, **library** component, **new** component to write, **existing** part of the screen), a mark for the change (**add**, **modify**, **remove**, **keep**) and a short note.
- **Arrows go from a component up to the one it is nested in.** A small circle at the foot means a 1:1 relation; no circle means 1:N (see below).
- Marks: **×N** the component is rendered once per item of a list; **R** it is rendered only under a condition; **D** it is disabled under a condition; **`// label`** the data it shows; a dashed box is less important or not decided yet. Hover a box to read the condition.
- **Zoom and move**: ⌘ + scroll, the buttons, drag the background. **Fit** shows everything, **⤢** opens it large. A subtree can be collapsed with the small button under a box.
- **Rearrange by dragging**: drag a box onto another one. The left third puts it **before**, the right third **after**, the middle **inside** it. A mark shows where it will land; Esc cancels. It also works from the keyboard (select a box, ⌥ + arrows).
- **Edit plan** opens the text of the plan and a form for the selected component: name (or **Choose from libraries…**), kind, change, note, **Repeated** (1:N), data, `// label`, R and D conditions, low importance; add a child or sibling, duplicate, delete, move, indent.

Names marked **not in the docs** are library components the documentation does not know: check them or mark them as new.

## Building the plan

- **Build this** (or **Build the edited plan**) on the card, or the **Build plan** send button, approves the plan and switches back to **Agent**. If you rearranged or edited the tree or answered questions, the edited plan and your answers go to Claude, and it follows them exactly.
- **Revise…** asks for changes in words; **Discard** drops the plan.

## The method behind the tree

The tree follows the decomposition method used at Unicorn (based on Jackson Structure Programming): rendering goes top-down and data flows only top-down (a child reports upward only through handlers passed down). A parent only composes its children, and each child does one job: the component that loads data sits above the one that shows it; a state resolver (loading, error) comes before the content; modals belong to the view. See also [The component tree of a screen](06-component-tree.md), which shows the same notation for a screen that already exists.

## Plans as files on the canvas

Every plan is also saved as its own Markdown file in the project, `plans/<name>.md`, and shown as a **card on the canvas** beside the screens The chat card shows the beginning of the text; **Open full plan** (or a click on the text) opens the whole plan.

- **Read** (default): the plan is shown as a document: headings, lists, checklists, tables, the component tree and the questions. A link written as `[[room-list.html]]` jumps to that screen.
- **Edit** (button on the card, or ⌘E / Ctrl+E): the Markdown of the plan. It is saved as you type. The card in the chat follows the file, and the file follows the card in the chat, so there is one plan, not two.
- **Approve & build** builds the plan as written in the file. Discarding is done on the chat card; a discarded plan stays as a muted card, and its file can be deleted in the project folder.
- **✕** on the card hides it from the canvas (the plan itself stays); **Open full plan** on the card in the chat brings it back.
- Two-finger scrolling over a card scrolls the card; hold **Alt / Option** to move the whole canvas, as over a screen. ⌘ / Ctrl + scroll zooms the canvas (inside the component diagram, the diagram).
- A plan that is no longer a proposal (approved, built, discarded) leaves the canvas by itself, so that the canvas shows what is still being decided; the **Plans** button in the toolbar brings it back. The button is part of the **Advanced** view, like Plan mode itself: with Advanced off it is not in the toolbar.
- Drag the card by its title bar and resize it by the corner; it is remembered. You can also edit the file in any editor: the card updates.

The component tree on the card is the same as in the chat: **Diagram** or **Outline**, a click on a library component shows its description, **Hide / Show the component tree**, and a box can be dragged to another place (the plan file is changed).

## Sitemap of a portal or a web site

**Where the sitemap is offered.** A sitemap belongs to a web site or a portal, not to an application, a route, a component or one page. The **Sitemap** button of the toolbar and **Add a sitemap** on a plan card are there when the project was started as **Whole web site** / **Portal (several pages)** on the dashboard, or when it already has a sitemap (a Web or Document project made before 0.20.0 keeps them too). In any other project the agent proposes no sitemap unless you ask for one, and a sitemap is made from the **Plans** menu: **Add a sitemap** at its end offers **From the screens**, **From a link…**, **Empty map** and **Ask the agent…**. Once the project has a sitemap, the button is in the toolbar.

A plan that has no sitemap yet shows **Add a sitemap** on its card (the agent adds the tree of the pages to the same plan). The component tree is optional: **Remove the tree** takes it out of a plan that does not build a screen.

For a portal, a web site or any request about several pages, Plan mode starts with a **sitemap**: the tree of pages. The plan card shows the text first and the **Sitemap** below it, like the component tree; a plan that is about one page has a component tree and no map, a plan about the whole structure has a map and no tree.

- The root is on the left, the pages grow to the right. A solid box is a **page** (its own screen), a small dotted one a **section** (a chapter, block or tab inside the page above it, no screen of its own, not counted as a page), a dashed one a **group** (only gathers pages in the menu), an orange one an **external** link, a grey page with **–** a **page that is not solved here** (it stays in the map, no screen is built for it and it is not counted). **Export** (above the map) saves the map as a PNG or SVG picture, or copies it, to share it; a legend under the map explains the kinds of boxes the map uses. In the full view of the sitemap (the **Sitemap** button of the toolbar) the comments and the settings of the selected page are in the panel on the right. **Drag a page** onto another one to move it (upper edge: before it, lower edge: after it, middle: inside it). **✔** means the screen of the page exists, **○** that it does not yet.
- **Comment on the map**: select a page and write a comment (an orange mark appears on it). **Shift / ⌘ / Ctrl + click** selects more pages: they get one shared comment (and, if you like, one type), and the agent receives them as one "together" item. **Revise with the agent** above the map sends the comments, and anything you write about the whole map in the field next to it, to the agent, which returns the revised map with the comments resolved.
- A click on the selected page, on the empty map, or **Deselect** selects nothing. The map scrolls by itself and the editor of the selected page stays at the bottom of the card, so a long map can be edited without scrolling. Click a page to edit it: name, type, screen file and note; **+ Page inside**, **+ Page after**, **Duplicate** (a page without sub-pages: a copy right after it with the same type and note, without the screen file and comments; also in the right-click menu), move up / down, indent / outdent, delete.
- **Generate from the screens**: for a project that already has screens, a plan without a sitemap offers a first map made of them (the root is index / home, the pages below follow the links of the content).
- **Real links** (button above the map) draws, in orange, the links that the screens really have between two pages of the map and that the map does not show. A summary lists the pages without a screen and the screens that no page names, each with a **+** that adds it to the map (under the selected page).
- **A sitemap is approved, not built.** For a plan that is only a sitemap, the button on the card and in the chat is **Approve the map**: it agrees on the structure and builds nothing. Screens are created page by page (**Create the screen**), or for up to 8 selected pages at once (**Create the screens**), after a confirmation. If the plan also has a component tree, **Approve & build** builds only that screen, never the other pages of the map.
- **Create the screen** has the agent build just this page, in the place the map gives it; **Open the screen** shows an existing one.
- **Approve & build** builds one screen per page with a navigation that follows the tree. A sitemap you edited goes to the agent with the plan.
- The map is stored in the plan file as a ```` ```uu5-sitemap ```` block (JSON), so it can also be edited as text (**Edit**).

### A sitemap from an existing site, book or portal

When the pages already exist somewhere, start from them: **From a link…** (the Sitemap button or the Plans menu), or the card of a link pasted into the message (in a project of a whole web site or portal, and on the dashboard when **Whole web site** / **Portal** is chosen). Such a card has a switch that says what the link is for: **Reference** (the agent reads that one page, its content and look, as the input of a design) or **Sitemap** (the agent gets the structure of the pages behind the link as the input of the sitemap; the message field goes to Plan). With **Sitemap** the card reads the structure at once and shows how many pages it found; **Choose the pages…** opens the picker. The preview of the card, with **Load with my access…**, works the same for both.

1. Paste the address and press **Load**. The app reads the structure, read-only:
   - **a uuBookKit book**: its menu, with the pages nested as in the book;
   - **a uuManagementKit document or portal**: its own pages, the components with navigation (menus, tiles, lists of links) and the other links of the content;
   - **a web site**: the menu of the page, the links of its content and footer, and the pages of its `sitemap.xml`.
   A Plus4U address needs the sign-in and the uuAiChat server, as a pasted document does. A web site that shows its menu only to a signed-in user: **Load with my access…** opens it in a window of the app, you sign in and close the window, and the structure is read again as you see it.
2. **Pick the pages.** A tick takes a page with everything below it; **Alt+click** ticks only the page itself. The menu and the pages of a book or document are ticked at first, the rest waits for you. **Load its pages** on a row reads the links of that page and puts its pages below it, so you go as deep as you need.
3. Choose what happens with them:
   - **Use as the sitemap**: the picked pages become the sitemap of the project as they are (a sitemap that exists is kept and can be restored). A page you did not tick but whose sub-pages you did stays as a group, so the pages keep their place.
   - **Hand to the agent**: the pages are attached to your next message in Plan mode (nothing is sent yet: a note says so). Say what you want (regroup them, add pages, drop some) and the agent proposes the sitemap from them.

   When the project already has a sitemap, the buttons read **Replace the sitemap** and **Hand to the agent to extend the sitemap**: the agent then goes through the pages and proposes how to extend or change the map you have, and nothing is replaced until you approve its plan.

No content is read at this point. Every page remembers its address (**Source** in the page editor); when you create its screen, the app reads the page first and the agent builds the screen from its content.

### Working on the map after it is approved

**Approve the map** only agrees on the structure; the map stays editable. Add, rename, move and comment on pages as the work goes on, and create their screens one by one. The header of the **Sitemap** section says how many pages already have a screen (**✔** in the map: designed, **○**: only in the map). **Fold all / Unfold all** and the small arrow on a page fold the branches (a big map starts folded below its second level); **Hide** hides the whole section.

## The sitemap of the project

A sitemap is not only a part of a plan: an approved map becomes the **sitemap of the project**, a file of its own (`sitemap.json`) with a **Sitemap** card on the canvas.

- **From a plan to the project.** The map in a plan is a proposal: you read it, comment on it, revise it with the agent. **Approve the map** saves it as the sitemap of the project. If the project already has one, the new map replaces it and the old one is kept: **Undo** on the Sitemap card takes the replacement back. The plan keeps its text and a note that the map was approved.
- **From an existing plan to a sitemap.** A plan with a map: **Approve the map**, or (also for an older or already approved plan) **Use as the sitemap of the project** above the map. A plan without a map, also one that only has a component tree: **Make a sitemap from this plan** at the top of its card; the agent derives the pages, groups and sections from the plan and returns the plan with a map to review and approve. Without any plan, make the map from the **Sitemap** button in the toolbar.
- **The Sitemap card** is edited like the map in a plan (add, rename, move, comment, fold, **Real links**, **Create the screen**) and saved at once. **Revise with the agent** on it asks the agent, in Plan mode, for a revised map; it comes back as a plan to review and approve, so the map of the project never changes behind your back.
- **The agent knows the map.** It reads the sitemap of the project as context (the structure, the names, which pages have a screen) and keeps to it when it builds a screen. It never edits the file and builds only the pages you ask for.
- **The Sitemap button** in the toolbar goes to the sitemap card (**Show**, also when it was hidden) or hides it. Without a sitemap it offers to make one: **From the screens** (a first map of the screens that exist), **From a link…** (the pages of an existing site, book or portal, see above), **Empty map**, or **Ask the agent…** (Plan mode). **The Plans button** next to it lists the plans of the project (plans with the same title are told apart by their date): **Show** brings a hidden card back (and goes to it), **Hide** takes it off the canvas, **Delete** moves the plan file to the trash, and **Arrange the cards** puts the cards one under another, left of the screens, so that none lies on another. A card is never placed on another card or on a screen, and a card that is shown again finds a free place if its old one was taken.
