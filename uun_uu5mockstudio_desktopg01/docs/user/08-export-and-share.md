# 8. Export and share

## The Share menu

**Share ▾** on the bar over a selected screen works in two steps:

1. **What** — pick a tile: **Image** (PNG, JPEG or PDF at the size of the frame), **HTML file** (opens in a browser), **uu5String** (to paste into a document) or **Project ZIP** (every screen with its notes and rules). The menu remembers the last pick.
2. **What to do with it**:

| Action | Image | HTML file | uu5String | Project ZIP |
| --- | --- | --- | --- | --- |
| **Copy** | the picture | the source text | the uu5String | the file (paste it into Finder, Mail, a chat; on Windows and Linux its path) |
| **Save…** | choose PNG, JPEG or PDF | `.html` | `.uu5string.txt` | `.zip` |
| **Share…** | on macOS the system share sheet (Messages, Mail, AirDrop, WhatsApp, Signal …); elsewhere an e-mail draft with the file attached | | | |
| **⠿ Drag** | press, hold and drag the file into a chat, a mail or a folder (it is prepared when you pick the tile; the button is dim for a moment) | | | |

The same is in the application menu: **File → Export** (Screen as Image, as HTML, Copy Screen as uu5String, Screen as uu5String…, Project as ZIP) and **File → Share** (Screen Image, HTML File, Screen as uu5String, Project ZIP).

## uu5String (to paste into a document)

The uu5String is taken from the screen **as it is rendered now**: lists are expanded, texts computed, and the state is the current one (an open tab, a countdown at its current value). Components of uu5 libraries keep the props you set (defaults are left out); components defined in the screen disappear and leave what they render; plain HTML elements stay, and the rules of their CSS classes are written as an inline style.

Only a part of the screen: in the **Edit mode** click a component (Shift-click marks more, also in other screens) and press **Copy as uu5String** in the Edit panel. A component inside a list gives every item of the list.

Not everything can go in. The message after copying says how many notes there are; **Details** lists them:

- event handlers (`onClick`, `onSubmit`, …) are left out;
- a closed dialog (`Modal`, `Drawer`, …) is left out; open it in the screen and copy again to include it;
- CSS that cannot be written inline (`:hover`, nested selectors) is lost;
- components that are not rendered (in a closed dialog, a hidden tab) are left out;
- icons a document may not show: documents can load an older Material Design Icons font (4.x) than the screens (7.x), so a newer icon (`mdi-strategy`, `mdi-rocket-launch-outline`, …) stays empty there. The note names them; pick older icons in the screen if that happens.

The result uses the components of the screen (`Uu5Elements.*`, `Uu5Forms.*`). It renders wherever uu5String can load those libraries; a document that accepts only Bricks components needs it rewritten.

An exported HTML file needs the Plus4U CDN to render, like the screens in the app.
