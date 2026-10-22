# 6. Inspector

Two halves: a **script that runs inside every screen** while the inspector is on, and a **panel in the renderer**.

## The injected script (`inspector.js`, `INJECT`)

A template string executed in the page with `webview.executeJavaScript` (so it must contain no backticks or `${…}`). While on it:

- adds capturing listeners for `mousemove` (the blue frame under the pointer; only an edge, no fill), `click`, `scroll`, `resize`, and swallows `mousedown`/`mouseup`/`pointerdown`/`pointerup`/`submit` so the page does not react to picking;
- sets the **crosshair** cursor for everything (`<style>` with `* { cursor: crosshair !important }`, removed on off);
- keeps a map of **marked** components (orange frames; Shift / ⌘ / Ctrl + click adds or removes) and repaints them periodically (the page re-renders and scrolls);
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
