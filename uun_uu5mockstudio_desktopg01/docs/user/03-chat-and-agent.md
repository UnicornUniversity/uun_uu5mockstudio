# 3. The chat and the agent

The panel has two tabs: **Agent** (the chat, with the Agent / Plan switch) and **Components** (a browser of the library components: search, filter by library, description, a **live preview** of the component (for the components of Uu5Elements and Uu5Forms that have ready-made code; drag its lower edge to make it taller) and props; **Add to message** puts `@Name` into the message and returns to Agent; **drag a component onto a screen** to add it there: a blue line shows that it goes before or after a component, a blue frame that it goes inside; Esc cancels, the toast has Undo). The app has ready-made code for the common components (Text, Block, Button, Tabs, form fields …) and builds it from the documentation for most of the others; when it cannot (a component that needs data, a library the screen does not use yet, a place the file does not allow) the message says why and **Ask the agent** gives the drop to the agent). The tab is remembered.

The chat is where you tell Claude what to build or change. It is a docked column on the left, or a floating window (**Chat → Floating / Docked Chat, ⇧⌘L**) that can be dragged, resized from every edge and minimized with the **_** button into a round chat bubble (a click on the bubble opens it, a drag moves it).


## Tokens of a request

Under every answer of the agent (also under a plan card) a small grey line shows how many **tokens** the request used, for example `17.3k tokens`. It is the new input plus the output, summed over all models the request used. (Claude Code counts cumulatively over a conversation, so the app subtracts the previous result; the first request measured in an older conversation can only show the total so far, marked “so far”.) Point at it for the details: input and output, how much was read from and written to the cache (reading from the cache is cheap and repeats with every message, so it is not in the number), and the tokens per model. The lines are part of the conversation, so they are kept with it and disappear when you delete it. A stopped request shows none.


## Spending fewer tokens

Every step of the agent reads the **whole conversation** again, so a long conversation makes every later step dear. What helps, and what the app does about it:

- **Context.** The line under an answer ends with `context 439k`: how big the conversation is now. From about 200k tokens a bar above the message field suggests a **New conversation**: the screens, rules and notes stay in the project, so little is lost; the new message field already holds a start (the screens and your last request). **✕** hides the bar until the conversation grows by another 200k.
- **Eco** (the leaf next to the model, turn it on and off): the agent thinks less, makes the smallest change that does what you ask, checks once and answers in two or three sentences. Good for small changes; turn it off for a big design.
- **The agent works economically by default**: it writes a screen in one go (or a few large edits) instead of dozens of tiny ones, reloads and checks once per batch, reads big files in parts, takes a screenshot only when the question is visual, and the screenshots it gets are small (900 px, JPEG).

## The message field

One rounded box: your text, a strip of tools under it, and the round send button.

| Control | What it does |
| --- | --- |
| crosshair | **Pick components** in the preview and link them in your message (see below) |
| paperclip | **Attach an image**: a screenshot or a sketch (you can also paste with ⌘V or drop it) |
| cube | **Components from the libraries**: search the uu5 libraries and add a component to the message (the same browser is the **Components** tab at the top of the panel) |
| round arrow | Send. While Claude works it becomes **Stop**. |

Under the box: the **mode** (Agent or Plan) on the left and the **model** on the right (Default is the model configured in your Claude Code). Enter sends, Shift+Enter makes a new line.

## Agent and Plan

- **Agent** (the default): Claude builds and changes screens right away.
- **Plan**: Claude only prepares a plan and **cannot write any file** (the file tools are taken away from it while it plans). See [Plan mode](04-plan-mode.md). When a plan waits for approval and the message field is empty, the send button reads **Build plan**.

The mode is chosen in the menu next to the model, and **Build** on a plan switches back to Agent.

## Mentioning things with `@`

Type `@` and a few letters:

- **another screen** of the project (`@room-list`): Claude opens it and uses it as a template;
- **a file of the linked git repository** (`@repo/…`, see [project memory](07-project-memory.md#linked-git-repository));
- **a component of the uu5 libraries** (`@Uu5Elements.Block`, `@Uu5Forms.FormText`): Claude gets the description of the component, its props and the reference file. Only components known to the documentation of the `uu5-development` plugin are suggested; the cube button opens a browser of them with the props, defaults (long defaults are one clipped line; click to read all) and a link to the online documentation.

## Picking components of a screen

Click the **crosshair** (or the inspector button on the bar over a screen) and click a component in the preview. A short **link** such as `[#1]` is put into your text at the cursor, and a chip with the same number and the full name of the component appears above the field, so you can write *"change this one `[#1]` and that one `[#2]`"*. **Click a chip** to see the component: its screen comes into view and the component is framed for a moment. Shift, ⌘ or Ctrl + click adds or removes more; a plain click replaces the last pick. Claude receives the exact source of each picked component (and, for an item of a list such as a button of an `ActionGroup`, the item as it is written in the file). **Deleting a link from the text removes its chip and its frame in the page.**

With the inspector on you can also **drag a component to another place of the same screen**: press it and move the pointer; a blue line (before / after) or a blue frame (inside) shows where it will land, red means it cannot go there. Let go to move it in the file; the message has **Undo**, Esc cancels. Places the file does not allow (inside a condition or a list, into another component of the file) are refused with a reason; ask the agent for those.

The inspector is the **Edit mode** (crosshair button or **I**): the screen does not react to its own clicks, the frame says "editing". Click marks a component (Shift-click more), **drag** moves it, **Delete** or Backspace removes the marked ones (or **Delete component** in the panel), **⌘D** copies them (or **Duplicate component**), a **double click on a text** edits it in place (Enter saves, Esc drops; where the text is written in the file is found by what it says, so a text shared through a constant changes everywhere), **⌘Z** undoes, **Esc** first unmarks and then leaves the mode. The Edit mode opens the **Components** tab, so you can drag a component from it onto the screen (and the tab you had comes back when you leave). **Lists of objects** (the actions of an action list, an `itemList`) work the same way: click an item to mark it, **drag** it to another place of its list, **Delete** or **⌘D** removes or copies it, and **Add item after this one** in the panel adds a ready action (or a copy of the item when the list is not made of actions). The component or item you added, moved or copied is marked again once the screen is rendered. The message has **Undo**; a component in a condition or a list is refused with a reason and can be given to the agent.

## What Claude does while it works

The chat shows the steps (reading, writing, checking in the browser). Claude checks every screen it writes: it reloads the page, reads the console and takes a screenshot, and fixes errors (up to three times). A screen can be edited by you at the same time: the preview reloads on every change of the file.

## Several conversations

**Chat history** (the clock icon) lists the conversations of the project; **New chat** (⇧⌘N) starts another one without losing the previous. Each conversation keeps its own Claude session.

## Business rules written by the agent

Claude records business rules by itself: the ones you state, and the ones a screen it builds implements (who may do what, conditions of a change of state, validations, what is shown by role or state). Rules it worked out itself end with `(assumed)` so you can confirm or correct them. It says in one line which rules it recorded. See [project memory](07-project-memory.md#business-rules).
