# 2. Projects, screens and the canvas

## The dashboard

The app always starts on the dashboard. In the big field write what you want to design (choose **Agent** or **Plan** and a model if you like; the chips above it are templates, see below) and press Enter: a project is created (called *New project* at first, and renamed after the first screen the agent makes, e.g. `thesis-assignment-form` becomes *Thesis assignment form*), it opens, and the chat goes on there with your message already sent.

Below are your projects as cards (or a list, see the switch) with a picture of the whole canvas (the screens where you placed them), the number of screens and when you last worked on it. **Recents** in the left column shows the latest ones, **All projects** the whole folder A–Z; the search field filters; **New Project** makes an empty one. Pointing at a card shows a bin that deletes the project after a confirmation (the folder goes to the system trash, so it can be restored). The box at the bottom left shows the **projects folder**: **Reveal** shows it in the file manager, **Change…** chooses another folder (the app restarts). **File → Dashboard (⇧⌘D)** (or Close Project, ⇧⌘W) returns to the dashboard. The ◐ button in its corner switches the appearance (automatic / light / dark). The pictures are made in the background and kept in the project (`.studio/thumb.jpg`); they are made again when a screen or the layout changes.

### Templates

Above the field choose what you are designing: **Application** (a whole uu5 application: a shell with navigation and several routes, uu5Uve), **Route** (one route, uu5Route) **Component** (form, list, detail, dashboard…), **Web** (a whole page of a web site with its own navigation and footer, drawn full width: home page, landing page, product detail, web page; plain HTML and CSS, so it is for looking at, sharing as an image or an HTML file) or **Document** (a content page made of uu5Bricks for a document: portal, news; copy it with **Copy as uu5String** into a uuBookKit page or a uuManagementKit portal). The chips are the templates of that level; a chosen template is shown as a badge in the field (the ✕ removes it) and puts a sample sentence into the field. When you send, the project starts from the template's files and the agent changes them according to your request instead of starting from scratch. **Without a template** lets the agent start freely. **Guide me…** (next to Templates…) asks a few short questions (what you need, who it is for and what they should do, what should be on it, and the text or link you already have) and writes a good request into the field for you to read and send.

For **Web** and **Document** a second choice appears next to it: **One page**, or **Whole web site** / **Portal (several pages)**. A whole site starts in Plan mode, also in the Simple view: the agent proposes the **sitemap** first, you approve it, then the pages are built. The project remembers the choice: only a project of a whole site (or one that already has a sitemap) shows the **Sitemap** button in its toolbar.

**Templates…** shows where the templates come from: the ones built into the app, those that installed plugins bring (a plugin can ship a `templates/` folder, so a plugin update updates them) and your own. **Screen → Save as Template…** makes your own template from the selected screen (or from more screens of the project): a title, the level, a description, the sentence for the message field and instructions for the agent; the business rules of the project and the notes of the screens can go with it. Your templates have **Edit…**, **Show in Finder**, **Export ZIP…** (to pass on to a colleague) and **Delete** in the Templates dialog; **Open folder** shows their folder. A later source replaces a template with the same id. How to write a template: see the technical documentation (13, Templates for new projects).

## Projects and screens

A **project** is a folder. Every `.html` file directly in it is a **screen** (one file per screen, no subfolders). Next to the screens the project keeps its memory as plain files ([project memory](07-project-memory.md)):

| File | What it is |
| --- | --- |
| `<screen>.html` | a screen, exactly as Claude wrote it |
| `BUSINESS_RULES.md` | the business rules of the project |
| `PROJECT.md` | the description of the project and of its screens |
| `<screen>.notes.md` | the sticky notes of a screen |
| `.studio/` | hidden app data: conversations, canvas layout, attachments |

The projects live in **Documents → uu5Mock Studio** (change it in **Project → Projects Folder → Change…**). Use **File → New Project… (⌘N)**, **Switch Project… (⌘O)**, **Close Project**, rename or delete from the **Project** menu. The project button at the top of the chat shows the projects as well.

## The canvas

Each screen is a **frame** on the canvas.

- **Zoom** with ⌘ + scroll (or pinch), the zoom pill in the top bar (click the percentage for Zoom in / out, Actual size and Fit), or **View → Zoom In / Out**. **Show All Screens (⌘0)** or **Fit** shows everything. **Arrange Screens** puts the frames in a tidy row.
- **Pan** by scrolling over the background or dragging it. Scrolling over a screen scrolls that screen; hold **⌥** to move the canvas instead (the same with the inspector on).
- **Select** a screen by clicking it. A short bar of icons appears above it: **Export**, **Share**, **⋯** (the inspector and the project description are icons in the top bar). The bar can be moved by its grip (a double click puts it back).
- **Device size**: the size button in the title of a frame (when the frame is too small on the screen for its title to show it: **⋯ / right-click → Device size…**) (**View → Device for All Screens** sets all frames at once) (Desktop 1440×900, Laptop, Tablet, Mobile, **Custom size…**). **Height to fit** makes the frame as tall as its content. Frames can also be resized by their corners.
- **No flicker**: when a screen is rendered again (the agent or the inspector changed it, **Reload**), the new page loads behind the shown one and replaces it when it has loaded and settled, so there is no blank moment and nothing jumps, at any zoom; the scroll position is kept. A page that stays empty (an error) is shown after a few seconds.
- **Tabs** above the canvas list the screens; click one to bring it into view.
- **Delete a screen** with the bin in its title, **Screen → Delete Screen…** or Delete on a selected screen. The file goes to the trash; its **notes, rules and description go with it**. The confirmation says what goes; a copy of the rules and the description is kept in `.studio/removed-screen-memory.md`.

### Flow between screens

A screen that links to another one (a button or link whose address is the other screen's file, e.g. `room-detail.html`) gets an **arrow** to it on the canvas, so the flow of a feature is visible at a glance. The button with the two boxes in the top bar (or **View → Show / Hide Screen Flow**) shows or hides the arrows; they follow the frames when you move them and are found again after every change of a screen. Ask the agent to link the screens ("the Add button leads to the room form"); a click on such a link on the canvas takes you to the screen it leads to (the screen you clicked in stays as it was), and in **Present** the links open the next screen, so you can click through the flow. The arrows stay readable even when every screen links to every other one: the links of a menu (in a `nav`, header or footer, or several screen links next to each other) are hidden by default, because they are the same on every screen; they appear when you select a screen or point at it, and the extra button with three lines next to the flow button draws all of them at once. Two screens that link to each other get one line with a head at both ends. Select a screen, or point at it, and its arrows are drawn strong (dashed when they lead to it) while the others fade. A link is written as the file name of the other screen (`room-detail.html`); the app answers it correctly although a uu5 page sets its own base address.

### Variants of a screen

**Screen → Variants…** asks how many (2 to 4) and what should differ (layout, visual style, how the information is organised, or your own words). The agent writes them as new screens (`room-list-a`, `room-list-b` …) next to the original, which stays as it is. Compare them side by side: the original and its variants share a colour, sit on a tinted board with the header “Variants of …”, and each has a label (Original, A, B …). Choose in the header: click a label to select that screen, then **Use A** (or the context menu of the screen) makes it the screen, with its notes, comments and description, and moves the original and the other variants to the trash. If the original wins, select **Original** and click **Keep Original**: the variants go to the trash.

### Present

**Screen → Present (⌘Enter)**, **Present** in the ⋯ / right-click menu, or the expand icon in the title of a frame shows one screen alone over the whole window (the window goes native fullscreen). Nothing else is shown: no chat, notes, inspector or bars, only two small buttons in the top-right corner: the monitor icon chooses the device size (Full window, Desktop, Laptop, Tablet, Mobile; the screen is shown at that size on a dark background, scaled down to fit) and the other one stops presenting. **Esc**, the button (**Stop Presenting**) or ⌘Enter / ⇧⌘F leaves. If the mockup itself uses Esc (closing a modal), that press stays with the mockup. The page reloads by itself when the agent changes the screen.

## Notes on a screen

A **note** is a yellow sticky card that belongs to a screen: context, open questions, rules that apply. Add one with **Add Note (⌥⌘N)**, the context menu of a screen, or the notes bubble in fullscreen (a click on the bubble of a screen without notes adds one). A screen can have several notes. Notes are saved in `<screen>.notes.md`. **Claude reads the notes of a screen before it changes that screen, and never edits them.**

## Description of a screen and of the project

**Project → Project Description… (⌥⌘D)** or **Screen → Description…** edits what you want Claude to know in words: what the project is, what the screen is for. It is saved in `PROJECT.md`; Claude reads it as context and changes it only when you ask.
