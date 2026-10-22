# 2. Projects, screens and the canvas

## The dashboard

The app always starts on the dashboard. In the big field write what you want to design (choose **Agent** or **Plan** and a model if you like; the chips above it fill in a sample sentence) and press Enter: a project is created (called *New project* at first, and renamed after the first screen the agent makes, e.g. `thesis-assignment-form` becomes *Thesis assignment form*), it opens, and the chat goes on there with your message already sent.

Below are your projects as cards (or a list, see the switch) with a picture of the whole canvas (the screens where you placed them), the number of screens and when you last worked on it. **Recents** in the left column shows the latest ones, **All projects** the whole folder A–Z; the search field filters; **New Project** makes an empty one. Pointing at a card shows a bin that deletes the project after a confirmation (the folder goes to the system trash, so it can be restored). The box at the bottom left shows the **projects folder**: **Reveal** shows it in the file manager, **Change…** chooses another folder (the app restarts). **File → Dashboard (⇧⌘D)** (or Close Project, ⇧⌘W) returns to the dashboard. The ◐ button in its corner switches the appearance (automatic / light / dark). The pictures are made in the background and kept in the project (`.studio/thumb.jpg`); they are made again when a screen or the layout changes.

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

- **Zoom** with ⌘ + scroll (or pinch), the zoom pill in the top bar (− 71 % + | Fit), or **View → Zoom In / Out**. **Show All Screens (⌘0)** or **Fit** shows everything. **Arrange Screens** puts the frames in a tidy row.
- **Pan** by scrolling over the background or dragging it. Scrolling over a screen scrolls that screen; hold **⌥** to move the canvas instead (the same with the inspector on).
- **Select** a screen by clicking it. A short bar of icons appears above it: **Export**, **Share**, **⋯** (the inspector and the project description are icons in the top bar). The bar can be moved by its grip (a double click puts it back).
- **Device size**: the size button in the title of a frame (**View → Device for All Screens** sets all frames at once) (Desktop 1440×900, Laptop, Tablet, Mobile, **Custom size…**). **Height to fit** makes the frame as tall as its content. Frames can also be resized by their corners.
- **Tabs** above the canvas list the screens; click one to bring it into view.
- **Delete a screen** with the bin in its title, **Screen → Delete Screen…** or Delete on a selected screen. The file goes to the trash; its **notes, rules and description go with it**. The confirmation says what goes; a copy of the rules and the description is kept in `.studio/removed-screen-memory.md`.

### Present

**Screen → Present (⌘Enter)**, **Present** in the ⋯ / right-click menu, or the expand icon in the title of a frame shows one screen alone over the whole window (the window goes native fullscreen). Nothing else is shown: no chat, notes, inspector or bars, only two small buttons in the top-right corner: the monitor icon chooses the device size (Full window, Desktop, Laptop, Tablet, Mobile; the screen is shown at that size on a dark background, scaled down to fit) and the other one stops presenting. **Esc**, the button (**Stop Presenting**) or ⌘Enter / ⇧⌘F leaves. If the mockup itself uses Esc (closing a modal), that press stays with the mockup. The page reloads by itself when the agent changes the screen.

## Notes on a screen

A **note** is a yellow sticky card that belongs to a screen: context, open questions, rules that apply. Add one with **Add Note (⌥⌘N)**, the context menu of a screen, or the notes bubble in fullscreen (a click on the bubble of a screen without notes adds one). A screen can have several notes. Notes are saved in `<screen>.notes.md`. **Claude reads the notes of a screen before it changes that screen, and never edits them.**

## Description of a screen and of the project

**Project → Project Description… (⌥⌘D)** or **Screen → Description…** edits what you want Claude to know in words: what the project is, what the screen is for. It is saved in `PROJECT.md`; Claude reads it as context and changes it only when you ask.
