# 6. Inspector

Two halves: a **script that runs inside every screen** while the inspector is on, and a **panel in the renderer**.

## The injected script (`inspector.js`, `INJECT`)

A template string executed in the page with `webview.executeJavaScript` (so it must contain no backticks or `${…}`). While on it:

- adds capturing listeners for `mousemove` (the blue frame under the pointer; only an edge, no fill), `click`, `scroll`, `resize`, and swallows `mousedown`/`mouseup`/`pointerdown`/`pointerup`/`submit` so the page does not react to picking;
- sets the **crosshair** cursor for everything (`<style>` with `* { cursor: crosshair !important }`, removed on off);
- keeps a map of **marked** components (orange frames; Shift + click adds or removes a component, ⌘ / Ctrl + click one copy) and repaints them periodically (the page re-renders and scrolls);
- **copies from `.map`**: an element written once in the file can be rendered several times (`LIST.map(…)`, or a component of the file used twice). `copiesOf` finds all outermost fibers with its ordinal in the committed tree; `copyOf` says which copy was clicked: at every level where the copies part, the place among the siblings that hold a copy, plus the React key of the innermost one. Shift / plain click marks the element (the other copies get dashed frames, the pick says `copies: n`); ⌘ / Ctrl + click marks one copy (key `ordinal|sub@k:<key>` or `@<path>`, pick `inst: { index, count, key, nth, path }`). On macOS Ctrl + click arrives as `contextmenu` with button 0: the inspector picks it there and the webview preload leaves it alone while `<html data-studio-inspect>` is set. `describeElement` / `describeItem` return `loop: { list, count, items: [{ index, label, values }] }` for an element inside `.map` (`jsxSource.mjs`, `loopOf`), and `copyItem` (inspector.js) matches the copy to its item (by the key among the item's values, else by place when the counts agree), so the chip says `CONTACTS[0] (name: "Jan Novák")` and `agentContext` tells the agent to change only that item. Delete / ⌘D refuse a copy (the file has one element for all copies); the chip's flash (`flashCode(ordinal, nth)`) frames the copy.
- on click reports the pick with `console.log("<marker>" + JSON)`; the host's `console-message` handler (`handleConsole`) parses it. Escape is reported the same way (`__studio_esc__`) because the page swallows it;
- exposes `window.__studioInspect` with `drop(key)`, `clear()`, `markLevel(i, item)` (the frame goes to the component `i` levels above the last pick) and `off()`.

### From a DOM element to a component

React fibers are found through the `__reactFiber$…` key of a DOM node. A fiber belongs to a JSX element when its props carry `data-uu5-src` (see [05](05-screen-source.md)); `compAt` walks up to the nearest one. The tag is passed down through wrapper components, so the **outermost fiber with the same ordinal** holds the props of the component (`outermost`). `chainOf` lists the ordinals of the components around (up to eight, nearest first); `levels` keeps their fibers for `markLevel`.

### Items of a list

A button that is an item of a list prop has no JSX element of its own. `subOf(T, clicked)` takes the props of the outer component that are arrays of plain objects, and also functions named `getXxxList` without parameters (called once, in a `try`), and looks for the fiber on the path to the clicked node whose props equal (`Object.is`, at least 60 % of the keys) one of the items: `{ prop, index, count, name }`. The pick key is `ordinal|prop[index]`.

## The pick

The marker carries `{ key, additive, selected, chain, runtime, ownerRuntime, propNames, sub, assets, palettes, text, w, h }`: the ordinals, the runtime props (summarized), the palettes of the page (`colorScheme`, `borderRadius` from the uuGDS palettes), the URL base of the icon fonts, the text under the pointer. `showPick` in `renderer.js` either adds a chip to the message (chat picking) or updates the **marked selection** (`updateSelection`) and calls `propsPanel.show`.

## The panel (`propsPanel.js`)

`show(pick)` calls `jsx:inspect(file, ordinals, sub)` (the main process describes the element or item from the file: props, documentation). `kindOf(prop, attr, palettes, name)` chooses the control: `select` (documented enum, or a palette type, or the well-known fallbacks for `colorScheme`, `borderRadius`, `significance` when the documentation only says "oneOf"), `bool`, `number`, `multi` (a list of strings with known items), `code`, `text`. Icons, LSI texts, variables and lists of actions get special controls. Every edit calls an IPC handler (`jsx:set`, …) which returns the fresh description.

Breadcrumb: `selectLevel(i, item)` re-inspects with `ordinals = chain.slice(i)` and asks the page to move the frame (`api.markLevel`). `refresh(file)` re-reads the shown component when its file changes and clears the panel when it is gone. `file` (a getter) is the screen of the component shown.

## Lists of actions

`listKind(prop, componentName)` (`actionGrammar.js`) says which props open the list editor: `actionList`, `iconRightList`, `getActionList`, and `itemList` of `ActionGroup` / `Dropdown` / `ContextMenu`. `actionFields(doc, palettes)` builds the form from the parsed reference of `Uu5Elements.Button`. The editor works through `jsx:list` and `jsx:item` (add, remove, move, duplicate, replace as code) and `jsx:set` / `jsx:remove` with a `sub`.

## Dropping a component of the catalogue (`dropTarget.js`, `catalogDrag.js`)

A `<webview>` is a page of its own, so HTML5 drag and drop does not cross into it. The drag runs in the app: `libraryPicker` (side panel only) calls `onDragStart(name, event)` on pointerdown of an item; `createCatalogDrag.start` waits for 5 px of movement (before that it is a click), then adds a **ghost** and a transparent **overlay** (`.catalog-drag-overlay`, keeps the pointer events away from the pages) and, on every move, converts the pointer to the page coordinates of the screen under it (`webview` rect and `offsetWidth` give the zoom) and calls `window.__studioDrop.at(x, y, { exclude })` in that page (`DROP_INJECT`, injected on first use). One probe runs at a time; the position at pointerup decides. Escape cancels.

`__studioDrop.at` uses the same fiber helpers as the inspector (`FIBER`, shared string in `inspector.js`: `compAt`, `outermost`, `rectOf`, `publicName`): it finds the tagged component under the point, the layout direction of its siblings (`axisOf`: a flex parent's direction, inline items in a row, otherwise column) and whether it takes children (`children` in its props or in its `propTypes`), then `zoneOf(rect, pt, axis, canInside)` gives `before | after | inside` (a container has edge bands of a quarter, 8 to 28 px; a component without children is split in halves). It paints a line or a frame (blue; red when `exclude`, the ordinal of a component being moved, is the target or one of its parents) and returns `{ ordinal, zone, ok, name, canInside }`. `onDrop` calls `jsx:insert` without a snippet; the main process chooses it (below).

### What is inserted, and when the agent does it

`componentSnippets.mjs`: `snippetFor(name, docs)` takes (1) `CURATED`, hand-written snippets of 22 common components (every prop in them is documented; a test checks that the names still exist in the wiki), then (2) `generateSnippet`, built from the documented props (a required prop gets a neutral value of its type, a `name` prop the field key, a text child when `children` takes a string; a required `object`, `element` or `ref` means no snippet), then (3) nothing. `jsx:insert` answers `{ needsAgent: true, reason }` when there is no snippet, when `insertElement` refuses the place, or when the snippet uses a library the page does not import and that cannot be imported safely (`CORE_IMPORTS`: only `Uu5Elements` and `Uu5Forms`, which need no entry in `uu5DemoDependencies`; their import is added after the last import of the page, the others would make the page crash on an undefined component, so the file is left untouched). The renderer then shows the reason with **Ask the agent** (`askAgentToAdd`: a message with the target element's JSX and the documentation of the component). The same button is on the toast of a refused move (`askAgentToMove`).

## Moving a component inside its screen

Only while the inspector is on (otherwise the page is interactive and its own buttons need the press). `INJECT` includes `DROP_CORE` (`dropTarget.js`), so the whole drag runs in the page, where the pointer events are: `pointerdown` on a component (no modifier key, not an item of a list prop) arms it, 6 px of movement with the button down starts the drag, then every `pointermove` calls `dropAt(x, y, { exclude: <its ordinal> })` (a target inside the dragged component is red), a small label shows `Name → zone Target`, the page scrolls near its top and bottom edge. On `pointerup` over a valid place the page logs `__studio_move__` + JSON `{ ordinal, name, target, targetName, position }`; the click that follows is not a pick (`afterDrag`). Escape cancels (and, as before, turns the inspector off). The listeners are added before the swallowing ones, so they see the events.

`createInspector({ onMove })` gets `{ file, … }` from `handleConsole`; `moveInScreen` in `renderer.js` calls `jsx:moves` with one op (the same safe cases as the structure dialog: `failed[0].reason` goes to the toast) and the toast offers **Undo** (`screen:undo`). A move to another screen is not possible. The modules: `pageFiber.js` (`FIBER`, the fiber helpers), `dropTarget.js` (`zoneOf`, `DROP_CORE`, `DROP_INJECT`).

## Deleting components

`removeElements(html, ordinals)` (`jsxSource.mjs`) takes plain JSX children out of the file (the whole line when the element is alone on it; an element inside one that is removed too counts as removed; a child in a condition, a list or a prop, and the root of a component are refused with a reason) and `jsx:delete` writes it through `save()` ("Removed a component", so **Undo** works). Two ways in: **Delete / Backspace** in the page while the inspector is on removes the *marked* components (`sel`; list items are skipped; not while typing in a field) and logs `__studio_delete__` + `{ items: [{ ordinal, name }] }`, and the **Delete component** button of the inspector panel removes the shown one. `deleteInScreen` in `renderer.js` shows the toast with Undo, or the reason with **Ask the agent** (`askAgentToDelete`).

## The Edit mode

The inspector is presented as the **Edit mode** (button "Edit components", panel "Edit", the frames of the screens say "editing", menu View > Edit Components; the code keeps the name inspector). In it the page does not react to its own clicks and every gesture edits the file: click / Shift-click mark, drag moves, a drag from the Components tab adds, **Delete / Backspace** removes the marked ones, **Cmd/Ctrl + D** copies them (`duplicateElements`: each copy right after its original, through `insertElement`; `jsx:duplicate` returns `{ copies, failed }`), Cmd/Ctrl + Z / Shift + Z are the menu's Undo / Redo (the last change of the screen).

The keys work wherever the focus is: in the page (`keys` in `INJECT`, which logs `__studio_delete__` / `__studio_duplicate__` with the marked components) and in the app (the global `keydown` in `renderer.js` uses `markedByFile()`). A text field keeps its own keys. **Escape** goes in steps: during a drag it only cancels the drag (the page swallows it), with marks it unmarks them (`escapeEdit`), otherwise it leaves the mode.

After a component is added, moved or copied the file changes, the page is rendered again and the marks are gone. `markAfterReload(file, ordinals)` remembers the new ordinals (`insertElement` returns `ordinal`, `moveElements` returns `moved`, `duplicateElements` returns `copies`) and `onPageReady` marks them as soon as the inspector is in the new page (`inspector.pickOrdinal(view, ordinal, additive)` runs `__studioInspect.pickOrdinal`, which finds the first DOM node of that component and picks it like a click). The note expires after 10 s.

## Editing a text in place

A **double click** on a text in the Edit mode (`dbl` in `INJECT`): the text node under the pointer (`caretRangeFromPoint`; the pointer has to be on the text, or in a box whose only content is that text) is made editable (`contentEditable = "plaintext-only"`, a blue outline). A text with element children (`Rich <b>text</b>`) is refused with a hint. **Enter** or leaving the field hands the change over, **Escape** drops it (`edkeys` is registered before the other key handlers and stops the event, so Escape does not leave the mode and Delete / Cmd+D do not touch components while a text is edited; the mouse handlers let events in the field through). An unchanged or empty text restores the old one. The page logs `__studio_text__` + `{ ordinal, old, value }` (whitespace collapsed).

The file is changed by **what the text said**, not by where it is: `editText(html, ordinal, old, value)` (`jsxSource.mjs`) looks in the nearest tagged component (the one the page found, not a list item) for a text that equals `old` in this order: a JSX text child (`element.childTexts`, kept layout around it; `{ } < > &` in the new text make it a string expression), a text child written elsewhere (`{TITLE.en}`, `{t("Ano", "Yes")}`: the language that says `old` is changed where it is written), a text prop (`header="…"`, a language of an LSI prop). Otherwise it throws ("not written out as a plain text of this component"). `jsx:editText` writes it through `save()`; `editTextInScreen` (`renderer.js`) shows Undo and marks the component again, or reloads the screen (the page already shows the new text) and offers **Ask the agent** (`askAgentToEditText`). A text that several components share through a constant is changed in that constant.

## Items of lists in the Edit mode

An item of a list prop (an action of `actionList` / `itemList` of ActionGroup, any prop that holds an array of objects written out in the file) is a pick with `sub = { prop, index, count }` (see above); the key is `ordinal|prop[index]`. The same gestures work on items: **Delete** removes, **Cmd/Ctrl + D** copies (the copy follows the item), a **drag** within the list moves it (`itemAt` in `INJECT`: the pointer has to be over another item of the same list of the same component, a line shows before / after, `to` is the index after the move, and the item's own place is no move; logs `__studio_itemmove__` + `{ ordinal, prop, from, to }` → `moveItemInScreen` → `jsx:item` move). The messages of Delete / Duplicate carry `sub` per item (`marked()` in the page, `markedByFile()` in the app); `listGroups` makes one change per list.

`changeItems(html, ordinal, prop, op, { indexes, props, at })` (`jsxSource.mjs`) does several items at once (from the end, so the indexes do not move): `remove` → `{ removed }`, `duplicate` → `{ copies: [indexes of the copies] }`, `add` → `{ added: index }`; `jsx:items` writes it as one undo step. The panel has **Add item after this one** for an item (`addItemInScreen`: a ready action, `newAction()`, in a list of actions per `listKind`, a copy of the item in any other list of objects), and **Delete item** / **Duplicate item** (the same buttons as for components). A list that is built in code (not written out in the JSX) is refused with the reason of `listOf`; the toast offers the agent. After an item is added, copied or moved it is marked again (`pickItem`; `markAfterReload` takes `{ ordinal, prop, index }` as well as ordinals).

## The catalogue next to the screens

Entering the Edit mode leaves the side panel on the tab it is on (the chat stays open); a component is dragged onto the screen from the **Components** tab once the user opens it.
