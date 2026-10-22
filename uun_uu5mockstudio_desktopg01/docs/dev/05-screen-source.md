# 5. Screen source: JSX analysis and editing

A uu5 mockup is a React program inside `<script type="text/babel">` blocks of an HTML file. The user thinks in "component + props", not in DOM. `src/main/jsxSource.mjs` reads and edits that program with **@babel/parser** (`jsx` plugin, `errorRecovery`). Edits change **only the text they need to** (an attribute, a list item, a text), never reformat the file.

## Ordinals

`parseElements(html)` finds every `JSXOpeningElement` of all babel scripts, sorts them by position, and numbers them in document order: the **ordinal**. An element is `{ ordinal, name, uu5, start, end, nameEnd, selfClosing, attrs, snippet }`. `uu5` is true for components imported from `uu5*` / `uu_*` / `plus4u*` modules.

`tagHtml(html)` (used by the preview server) inserts ` data-uu5-src="<ordinal>"` after the name of every uu5 element, so the running React fiber carries its ordinal (see [06](06-inspector.md)). If anything fails the page is served untouched.

Because ordinals depend on the whole file, every operation re-parses the current text; nothing caches positions across edits.

## Props

Each attribute is parsed into `{ name, type, value, code, … }`:

- literals (`string`, `number`, `boolean`, `null`) are editable as such;
- anything else is `type: "code"` with `json` when it is plain data (objects, arrays), a `ref` when it names a top-level constant, `valueRef` when it is a member path into a constant (`texts.title`), `branches` when it is a conditional (`cond ? "a" : "b"`), and `resolved` when it is a **text** (see below);
- `items` when it is a list (see below).

`setProp`, `removeProp`, `setBranch`, `setText` and the item variants rewrite the attribute source (`attrSource`, `propSource`), keep multi-line indentation (`reindent`) and **validate the whole result** with the parser (`assertValid`) before returning it; an invalid edit throws a readable message.

### Texts and LSI

`textOf` turns an expression into `{ kind, via, langs: [{ lang, value, … }] }`: plain strings, LSI objects (`{ cs, en }`), `t("Ano", "Yes")` style helpers (a function is recognized as a language helper when its parameters are named like language codes), `<T lsi>` components, constants, `useLsi` objects. `setText(html, ordinal, scope, langIdx, value)` edits one language where the text is written.

### Lists

`findListArray(expr, decls)` finds the array literal behind a list prop wherever it is written: `[…]`, a constant, a function that returns it (`getActionList={getActionList}`, `() => […]`), or a condition between arrays (`cond ? [{…}] : []`, `cond && […]`). Of several arrays only the one with items counts. Items become `{ index, kind: "object" | "other", props, text, start, end, … }`; a spread (`...(readOnly ? [] : [{…}])`) carries `spreadItems` of its non-empty branch.

`itemOf(html, ordinal, prop, index, count)` resolves one item. `count` is the number of items rendered at runtime (from the page): when the file lists the same number of items (after expanding conditional spreads) the index maps directly; otherwise a readable error says the list is built in code or items are filtered. The list operations (`describeList`, `addItem`, `removeItem`, `duplicateItem`, `moveItem`, `replaceItem`, `setItemProp`, `removeItemProp`, `setItemBranch`) keep commas, comments and layout.

## Structure (decomposition) of a screen

`structureOf(html, name, { ordinal })` builds the tree shown in **Show component tree** and returned by `screen_structure`:

- the root is what the page renders (`….render(<App/>)`), else the last component of the file; components **defined in the file** (`function X`, `const X = () =>`, `createVisualComponent({ render })`) are opened with a recursion and depth guard;
- plain HTML tags are skipped and their children lifted; a component prop that holds JSX (`header={<Text/>}`) becomes a child with a note;
- `.map(cb)` → `relation: "1:N"` and `data: "item of <list>"`; `cond && <X/>` and `cond ? <A/> : <B/>` → `render` (the text of the condition, `!(…)` for the other branch); returns after `if (x) return …` get the conditions of the earlier ones; a non-literal `disabled` → `disabled`;
- each node carries its `ordinal` (same numbering as above), so the inspector can show it; with `{ ordinal }` only the part under that element is returned.

`structureOutline(tree)` renders it as indented text for the agent.

## Moves

`moveElements(html, ops)` applies the rearrangement made in the tree: `ops = [{ ordinal, target, position: "before" | "after" | "inside", name? }]`, ordinals as the file had them before the first move. Every element gets a temporary `data-mv="<ordinal>"` attribute so it can be found after another one moved; the attributes are removed at the end. `moveElement` makes a move only when it is **safe**:

- both elements are plain JSX children (`viaChild`) of an element or fragment, and in the **same function** (not inside a condition, a list callback, a prop or a component root, not into another function);
- the target is not inside the moved element; for `inside`, the target is not a component defined in the file (what is put inside it is shown only if it renders its children);
- the result parses.

Text is cut and pasted with indentation adjusted, a self-closing target is opened (`<Block />` → `<Block>…</Block>`). Moves that fail are returned with a **reason**; the renderer sends them to the agent. The result `{ html, applied, failed }` is written by `jsx:moves`.

## Undo / redo

`screenHistory.mjs` keeps, per file path, a stack of `{ before, after, label }`. `main.mjs` records a step in `save(path, before, after, label)` for every edit it makes (`jsx:set`, `jsx:remove`, `jsx:setBranch`, `jsx:item`, `jsx:setText`, `jsx:moves`). `screen:undo` / `screen:redo` take a file, or, when it has no step, **the latest step of the project** (`latest(way, inside)`). A step is applied only if the file is exactly as that step left it; otherwise the stacks of the file are dropped (the agent or an editor changed it). Limit: 50 steps per file. Changes by the agent are not recorded.
