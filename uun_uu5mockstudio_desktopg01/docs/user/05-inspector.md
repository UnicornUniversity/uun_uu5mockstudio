# 5. The inspector

The inspector changes a screen **without code**. Every change is written straight into the HTML file of the screen and the preview reloads.

## Turning it on

Click the inspector button (a crosshair in a frame) in the top bar or on the bar over a selected screen, or press **I**. While it is on, the cursor over a screen is a crosshair (over buttons and links too), the component under the pointer is outlined in blue and the panel on the right waits for a click. **Esc** or the cross of the panel turns it off. Scrolling works as usual (the wheel scrolls the screen, **⌥** moves the canvas).

## Picking a component

Click a uu5 component or a plain HTML element (a tile made of a `<div>`) in the screen. The panel shows:

- the **breadcrumb**: the components it is nested in, for example `AlertBus › ContentContainer › Grid › Box`. **Click any of them to select that one instead**; the frame on the page moves to it. This is how you select a `Grid` that is covered by its items.
- the name of the component, its text and its documentation (with a link), and the **props written in the file** as controls.
- **Add prop…** to add a prop the component supports.
- **Use in chat**: puts a link to the component into your message (see [the chat](03-chat-and-agent.md#picking-components-of-a-screen)).
- **Show component tree**: the structure inside the component ([chapter 6](06-component-tree.md)).

**Several components at once:** Shift + click marks more of them (orange frames, up to eight), and **Use N in chat** takes them all.

**One copy of a repeated component:** a tile that the screen renders for each item of a list (`CONTACTS.map(…)`) is one component in the file, so a click or Shift + click marks all its copies (the other copies get a dashed frame, a change applies to all of them). **⌘ / Ctrl + click** marks just the copy you clicked, each with its own frame; click more copies to add them. The chip in the chat names the item, e.g. `CONTACTS[0] (name: "Jan Novák")`, and the agent is told to change only those items. Such a copy cannot be deleted or copied with Delete / ⌘D: say in the chat what to do with it.

## Editing props

The control follows the type of the prop:

| Prop | Control |
| --- | --- |
| allowed values (colorScheme, significance, size …) | a drop-down; `colorScheme` and `borderRadius` use the palette of the screen |
| yes / no | a checkbox |
| number, text | an input |
| a list of known strings (`nestingLevelList`) | a multi choice |
| icon | the **icon picker** (uuGDS, uuBml and Material Design Icons catalogs, uuBml states); in Material Design a dashed frame marks icons newer than MDI 4, which a document may not show, and **shown in documents** hides them |
| a text that is an LSI (`{ cs, en }`, `t("Ano", "Yes")`, `<T lsi>`, a constant, `useLsi`) | the texts with a **switch of the languages**, edited where they are written |
| a prop that points to a variable | the value of the variable, which you can edit |
| a prop taken from the item of a list (`icon={m.icon}` in `MODULES.map((m) => …)`) | the value of the clicked copy with the usual control (the icon picker for an icon); a change is written into **that item** of the list |
| objects, arrays, functions | **{…}** opens the code in a window |

The cross removes a prop from the file.

### Leads to (links between screens)

For a button or a link the panel has a **Leads to** row: choose another screen of the project and the component gets that screen as its `href`. The flow arrows on the canvas follow it, and in Present a click opens the other screen. Choose “(no screen)” to remove the link.

### Lists of actions

`actionList`, `iconRightList`, `itemList` of `ActionGroup` / `Dropdown` / `ContextMenu` open in a window: all actions on the left, a form on the right (text, icon, tooltip, significance, colour, disabled, onClick, in the menu …), and **add, duplicate, delete, move**. An action that is a component is edited as code. Lists written as a function (`getActionList` of `ContentContainer`) or as a condition between lists (`cond ? [{ … }] : []`, `...(readOnly ? [] : [{ … }])`) are read too.

### A single item of a list

Click a button that is an item of a list (a tab, an action): the breadcrumb ends with `Button · actionList[2]` and the panel edits **that item** as it is written in the file. If the file cannot show the item (the list is built in code) you get the component itself and a note saying why.

## Undo and redo

Every change the app makes to a screen (an edit in the inspector, a text, a list of actions, a rearrangement of components) is a step. **Edit → Undo (⌘Z)** and **Redo (⇧⌘Z)** go back and forward step by step, with or without the inspector; the toast says what was undone. In a text field the same keys undo the typing. Steps are kept in memory; if the file was changed outside of the app since (for example by the agent), the steps are dropped instead of overwriting that work. Changes the agent makes are not part of this history.
