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
- Props equal (`Object.is`) to the component's `defaultProps` are left out. Functions are left out and counted by prop path (`itemList[].onClick`). `className` becomes a style: rules of the page's style sheets whose selector is exactly `.name` are parsed from `cssText` (shorthands stay short); `.name:hover` is counted (`report.hover`) and noted, because a uu5String cannot hold `:hover` (tried: `<style>`, `&:hover` in `style`, a `data-hover` attribute; documents ignore all of them); other selectors with that class are reported as lost. Rules inside `@media` count while the media query matches the screen's current width; `!important` keeps its weight over later rules. The inline `style` wins over the classes.
- Chosen components: `ordinals` (the `data-uu5-src` tags, see [05](05-screen-source.md)) in file order. Every outermost fiber with that ordinal is taken, so an element inside `.map` gives all its rendered copies.

## The output

`<uu5string/>` prefix; numbers and booleans unquoted; data as `'<uu5json/>…'`; JSX in a prop as a nested `"<uu5string/>…"` (only text → a plain string); a value takes the quotes it does not contain, else `"…"` with `\"`. Children that contain text are written on one line exactly as they are (whitespace matters inline); children that are only elements go one per line. A space at the edge of a text, next to a tag, is written as `&nbsp;`: the uu5String parsers of documents trim text at tags (`Zbývá <span>7 míst</span> za` would lose both spaces), uu5g05 renders the entity as a space.

## CSS variables

A document does not define the custom properties of the screen (`--brand-…`, see [07](../user/07-project-memory.md)), so `var(--x, fallback)` never goes into a uu5String: `withStyle` in `uu5StringCollect.js` writes every one in a style (class rules and inline `style`, also inside gradients) as its value, read from the element, else from the page root, else the `var()` fallback.

## Backgrounds

A document does not paint a `background` from the `style` of a div or a Card (a gradient hero comes out white, its white text invisible). The Web templates tell the screen to paint with `Uu5Bricks.Background` itself, so nothing needs rewriting. As a safety net for screens that paint with `style`, `backgroundLift` in `uu5String.js` moves a gradient or a dark solid colour out of the style into a `Uu5Bricks.Background` (`gradient` or `color`, `margin=0`, `borderRadius="none"`; a `borderRadius` of the element goes to the Background's `style` with `overflow: hidden`) around the element, and `notesOf` says how many. Only `div`s and `Uu5Bricks.Card`s are lifted: a Card cannot take a colour, so it becomes the Background itself (its `margin` and `borderRadius`) with a div inside that carries `contentPadding`. Buttons, texts and other components keep their style (wrapped, a button would turn into a full-width block). `background="full"` is never set: it puts the components inside into their dark-mode grey. Translucent (glass), light (white cards) and text-clip (`… text`) backgrounds stay in the style.

## Icons

Documents may load an older Material Design Icons font than the screens (the screens load 7.0.96; uuBookKit / uuManagementKit pages were seen with 4.x). The serializer collects every `mdi-*` value it writes (icon props, items of action lists) and `notesOf` names those that are not in `src/renderer/mdiBaseline.js`, the 4110 icon names of `@mdi/font` 4.0.96. Regenerate it with `node scripts/mdi-baseline.mjs [version]`.

## In the app

The **uu5String** tile of the Share menu of the selected screen (`OUT_FORMATS` in `renderer.js`: copy `uu5string`, save `save-uu5string`, share `share-uu5`, drag `uu5`), **File → Export** (`screen:uu5string`, `screen:save-uu5string`), **File → Share** (`screen:share-uu5`), and **Copy as uu5String** (`#insp-uu5`) in the Edit panel: the marked components (grouped by screen) or the shown one. The text goes to the clipboard through the main process (`clipboard:text`; `navigator.clipboard` needs a focused document) or to a file (`export:text`). Share and drag pass the text to the main process (`share:mail` / `drag:prepare` with kind `uu5` and the text), which writes `<screen>.uu5string.txt` to the share folder. The toast gives a summary, **Details** the notes.

## Files the text refers to

A document has no `assets/logo.png`. `src/main/assets.mjs` finds local media references (`mediaRefs`: pictures, videos, sounds; remote and `data:` links excluded) in a text and resolves them inside the project (`projectRelative`, `findAssets`: realpath must stay in the project; `.studio/` is private except `.studio/sources/assets`, which goes to `assets/sources/` in an export). `writeUu5Assets` writes them as a ZIP with a `README.md` mapping text address → file. IPC: `export:uu5` (text + `<name>.assets.zip` beside it), `assets:list` / `assets:export` (the **Files…** action of the copy toast), and `prepareShare("uu5")` adds the ZIP as a second attachment. The Project ZIP (`exporter.mjs`) uses the same scan on the screens and rewrites absolute preview-server paths to the file's place in the ZIP.
