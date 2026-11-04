# 14. uu5String export

"Copy as uu5String" turns a screen, or chosen components, into a uu5String for a document. It works on the **rendered** page, not on the source: mockups are built from components of the file, `.map` over constants, computed texts and state, which a static reading of the JSX cannot resolve.

## Two halves

| Module | Runs in | Does |
| --- | --- | --- |
| `src/renderer/uu5StringCollect.js` | the screen (`webview.executeJavaScript(collectCode(ordinals))`) | walks the React fibers and returns a plain JSON tree with a report |
| `src/renderer/uu5String.js` | the renderer (pure, tested in Node) | serializes the tree (`toUu5String`), merges trees of several screens (`mergeTrees`), writes the notes for the user (`notesOf`, `summaryOf`) |

`collectUu5Tree` is sent as its own source text (`Function.prototype.toString`), so it uses nothing outside its body. Tests feed it a fake fiber tree through `opts.rootFiber` and `opts.styleRules`.

## The walk

The root is the fiber behind the `__reactContainer$…` key of `#uu5` (or of any element of the body). Every fiber is indexed by its `memoizedProps` object, which is the `props` object of the element it was created from.

- **Fiber mode.** A host element (`tag 5`) becomes an HTML node (a string or number child is taken from its props: React makes no text fiber for it). A function, class, forwardRef or memo fiber whose name matches `Uu5…`/`Plus4U5….Name` (the last such name of the display name, so `Uu5Elements.withTooltip(Uu5Elements.Text)` → `Uu5Elements.Text`) becomes a component node. Anything else (components of the screen, contexts, fragments, portals) is transparent: its child fibers go on.
- **Element mode.** Inside a library component its own render is not walked. Its `children` and JSX props are React elements; each element is looked up in the index and continues in fiber mode, so a component of the screen passed as a child is still expanded. An element with no fiber (not rendered) is written from its props if it is a library or HTML element, otherwise reported as `unresolved`.
- Providers and buses (`…Provider`, `AlertBus`) are transparent. A closed overlay (`Modal`, `Drawer`, `Popover`, `Dialog`, `ContextMenu` without `open`) is skipped and reported.
- Props equal (`Object.is`) to the component's `defaultProps` are left out. Functions are left out and counted by prop path (`itemList[].onClick`). `className` becomes a style: rules of the page's style sheets whose selector is exactly `.name` are parsed from `cssText` (shorthands stay short); other selectors with that class (`.card:hover`) are reported as lost. The inline `style` wins over the classes.
- Chosen components: `ordinals` (the `data-uu5-src` tags, see [05](05-screen-source.md)) in file order. Every outermost fiber with that ordinal is taken, so an element inside `.map` gives all its rendered copies.

## The output

`<uu5string/>` prefix; numbers and booleans unquoted; data as `'<uu5json/>…'`; JSX in a prop as a nested `"<uu5string/>…"` (only text → a plain string); a value takes the quotes it does not contain, else `"…"` with `\"`. Children that contain text are written on one line exactly as they are (whitespace matters inline); children that are only elements go one per line. A space at the edge of a text, next to a tag, is written as `&nbsp;`: the uu5String parsers of documents trim text at tags (`Zbývá <span>7 míst</span> za` would lose both spaces), uu5g05 renders the entity as a space.

## In the app

The **uu5String** tile of the Share menu of the selected screen (`OUT_FORMATS` in `renderer.js`: copy `uu5string`, save `save-uu5string`, share `share-uu5`, drag `uu5`), **File → Export** (`screen:uu5string`, `screen:save-uu5string`), **File → Share** (`screen:share-uu5`), and **Copy as uu5String** (`#insp-uu5`) in the Edit panel: the marked components (grouped by screen) or the shown one. The text goes to the clipboard through the main process (`clipboard:text`; `navigator.clipboard` needs a focused document) or to a file (`export:text`). Share and drag pass the text to the main process (`share:mail` / `drag:prepare` with kind `uu5` and the text), which writes `<screen>.uu5string.txt` to the share folder. The toast gives a summary, **Details** the notes.
