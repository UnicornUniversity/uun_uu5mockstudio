/**
 * The welcome tour: a few cards that show what the app does, opened on the first run (and from Help > Welcome Tour…).
 * Every card has a small drawing (inline SVG in the colors of the theme), a title and a few lines. Left / Right arrows move, Escape closes.
 */
import { addDialogClose } from "./dialogChrome.js";
import { TOUR_TEXT } from "./role.js";
const S = (inner) => `<svg viewBox="0 0 440 190" role="img" aria-hidden="true" class="tr-svg">${inner}</svg>`;
const frame = (x, y, w, h, cls = "t-card") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="${cls}"/>`;
const line = (x, y, w, cls = "t-line") => `<rect x="${x}" y="${y}" width="${w}" height="6" rx="3" class="${cls}"/>`;

const num = (x, y, n) => `<circle cx="${x}" cy="${y}" r="11" class="t-num"/><text x="${x}" y="${y + 4.5}" text-anchor="middle" class="t-btn">${n}</text>`;
const node = (x, y, w, cls = "t-card") => `<rect x="${x}" y="${y}" width="${w}" height="24" rx="6" class="${cls}"/>`;
const link = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}h12V${y2}h${x2 - x1 - 12}" class="t-link"/>`;

// `advanced`: the card is left out in the simple view (the feature is under Advanced there)
const CARDS = [
  {
    title: "Describe a screen, get a live page",
    text: "Pick a template on the dashboard (one page or a whole web site or portal) or just write what you need in plain words. The AI agent (Claude Code or Codex) builds it as a real uu5 / uuGDS page that you can click, edit and share. One HTML file per screen, in a folder per project.",
    art: S(`${frame(14, 20, 150, 150)}${line(28, 40, 90)}${line(28, 56, 110, "t-line s")}${line(28, 72, 70, "t-line s")}
      <rect x="28" y="124" width="122" height="30" rx="15" class="t-accent"/><text x="89" y="143" text-anchor="middle" class="t-btn">Send</text>
      <path d="M176 95h50" class="t-arrow"/><path d="M218 86l10 9-10 9" class="t-arrow"/>
      ${frame(240, 20, 186, 150)}${line(254, 36, 70)}<rect x="254" y="54" width="158" height="14" rx="4" class="t-fill"/>
      ${[80, 100, 120, 140].map((y) => `${line(254, y, 158, "t-line s")}`).join("")}<rect x="354" y="30" width="58" height="16" rx="8" class="t-accent"/>`),
  },
  {
    key: "chat",
    title: "The chat knows your context",
    text: "Paste or drop a screenshot or a sketch. Type @ to mention another screen, a file of the linked repository or a uu5 component (the cube button browses them). Paste a link (a web page, a uuBookKit book, a uuManagementKit document): its card offers it as a Reference for the design, or its pages as the input of a Sitemap.",
    art: S(`${frame(60, 14, 320, 162)}
      <rect x="76" y="30" width="180" height="26" rx="13" class="t-fill"/>${line(92, 40, 120, "t-line s")}
      ${frame(232, 64, 132, 40, "t-card t-sel")}${line(244, 74, 60)}${line(244, 88, 100, "t-line s")}
      ${frame(76, 112, 288, 52, "t-card t-focus")}<text x="92" y="134" class="t-text">Build it like @room-list …</text>
      ${frame(112, 142, 116, 30)}<text x="126" y="161" class="t-text">@room-list</text>
      <circle cx="314" cy="136" r="12" class="t-card"/><circle cx="342" cy="136" r="12" class="t-card"/>`),
  },
  {
    title: "Point at what should change",
    text: "Switch on Annotate (the frame with a pointer, or A) and click a component on a screen or a page of the sitemap. Write a note and the place gets an orange number. With nothing written, Enter only links the place in your text, so you can write “move [#1] under [#2]”. Send: the agent gets every place with your note and a picture of it.",
    art: S(`${frame(14, 14, 250, 162)}${line(30, 32, 90)}
      <rect x="30" y="52" width="120" height="30" rx="6" class="t-fill"/><rect x="26" y="48" width="128" height="38" rx="8" class="t-orange"/>${num(154, 48, 1)}
      ${line(30, 104, 200, "t-line s")}<rect x="30" y="124" width="80" height="28" rx="14" class="t-accent"/><rect x="26" y="120" width="88" height="36" rx="18" class="t-orange"/>${num(114, 120, 2)}
      ${frame(280, 30, 146, 70, "t-card t-focus")}${line(294, 46, 110, "t-line s")}${line(294, 62, 80, "t-line s")}<rect x="364" y="76" width="50" height="16" rx="8" class="t-accent"/>
      ${frame(280, 116, 146, 40)}<text x="292" y="141" class="t-text">move [#1] under [#2]</text>`),
  },
  {
    title: "Plan first, then build",
    advanced: true,
    text: "Switch the chat to Plan and the agent first proposes what it will build: a tree of components you can rearrange, questions with choices to answer, and for a web site or portal a map of its pages. Every plan is a Markdown file and a card on the canvas: read it, change it, then Approve & build.",
    art: S(`${frame(14, 14, 190, 162)}${line(30, 32, 100)}${[52, 68, 84].map((y) => line(30, y, 150, "t-line s")).join("")}
      ${[106, 132].map((y) => `<rect x="30" y="${y}" width="66" height="18" rx="9" class="t-fill"/><rect x="104" y="${y}" width="66" height="18" rx="9" class="t-card t-sel"/>`).join("")}
      <rect x="30" y="152" width="150" height="16" rx="8" class="t-accent"/>
      ${node(232, 30, 80)}${link(312, 42, 340, 42)}${node(340, 30, 86)}${link(312, 42, 340, 82)}${node(340, 70, 86, "t-card t-sel")}${link(312, 42, 340, 122)}${node(340, 110, 86)}${link(383, 134, 383, 160)}${node(340, 148, 86)}`),
  },
  {
    title: "A map of the whole site or portal",
    text: "The Sitemap holds the pages of the project: make it from the screens, from a link to an existing web site, book or portal, or ask the agent. Drag, rename and approve pages; ✔ marks a page that has its screen, Create the screen builds just that page. Real links shows where the screens link outside the map.",
    art: S(`${node(18, 83, 92, "t-card t-sel")}${line(30, 92, 60)}
      ${[30, 83, 136].map((y, k) => `${link(110, 95, 150, y + 12)}${node(150, y, 104, k === 1 ? "t-card t-sel" : "t-card")}${line(162, y + 9, k === 1 ? 50 : 64, k === 1 ? "t-line" : "t-line s")}`).join("")}
      ${[60, 106].map((y) => `${link(254, 95, 296, y + 12)}${node(296, y, 104, "t-card")}${line(308, y + 9, 70, "t-line s")}`).join("")}
      <path d="M236 46l5 6 9-12" class="t-check"/><path d="M236 99l5 6 9-12" class="t-check"/>`),
  },
  {
    key: "economy",
    title: "Keep requests small and cheap",
    text: "The line under each answer shows how big the conversation has grown (context) and what the request cost in tokens. When it gets large, a bar suggests a new conversation: the agent then reads less every time. Eco (the leaf under the message box) makes the agent think less, change only what you asked for and answer briefly: switch it on for quick tweaks, off for a new screen.",
    art: S(`${frame(14, 14, 412, 92)}${line(30, 32, 250)}${line(30, 48, 190, "t-line s")}${line(30, 64, 120, "t-line s")}
      <text x="410" y="96" text-anchor="end" class="t-text">context 142k</text>
      ${frame(14, 118, 412, 58)}<rect x="30" y="136" width="200" height="10" rx="5" class="t-fill"/><rect x="30" y="136" width="150" height="10" rx="5" class="t-accent"/>
      <text x="30" y="166" class="t-text">A new conversation is cheaper</text>
      <rect x="318" y="132" width="92" height="28" rx="14" class="t-accent"/><text x="364" y="151" text-anchor="middle" class="t-btn">Eco</text>`),
  },
  {
    key: "canvas",
    title: "A canvas for all screens",
    text: "Zoom and pan (⌥ + two-finger scroll moves the canvas while you work inside a screen), choose a device size, arrange the screens with one click, or present one. Variants… lets the agent draw 2–4 alternatives next to the original, and the arrows show which screen leads where. Sticky notes stay with their screen; ⌘C / ⌘V copies a screen, with its notes and rules, into another project.",
    art: S(`${frame(14, 30, 120, 130)}${line(26, 46, 60)}${line(26, 62, 90, "t-line s")}${line(26, 78, 80, "t-line s")}
      ${frame(150, 30, 150, 130, "t-card t-sel")}${line(162, 46, 70)}<rect x="162" y="62" width="126" height="40" rx="5" class="t-fill"/>${line(162, 114, 100, "t-line s")}
      ${frame(316, 30, 110, 130)}${line(328, 46, 50)}${line(328, 62, 80, "t-line s")}
      <path d="M134 120h14" class="t-arrow"/><path d="M300 120h14" class="t-arrow"/>
      <rect x="318" y="8" width="92" height="46" rx="6" class="t-note"/>${line(326, 20, 70, "t-line n")}${line(326, 34, 50, "t-line n")}`),
  },
  {
    key: "inspector",
    title: "Edit components yourself",
    text: "Select a screen and switch on Edit (the pencil on its bar, or I). Click a uu5 component and change its props: colours, icons from the uuGDS and uuBml catalogs, even objects and arrays. Double-click a text to rewrite it, drag a component to another place or in from the Components tab. Every change is written back to the HTML; ⌘Z undoes it.",
    art: S(`${frame(14, 20, 260, 150)}${line(30, 38, 100)}
      <rect x="30" y="58" width="110" height="34" rx="6" class="t-accent"/><rect x="26" y="54" width="118" height="42" rx="8" class="t-sel" fill="none"/>
      ${line(30, 112, 200, "t-line s")}${line(30, 128, 160, "t-line s")}
      ${frame(290, 20, 136, 150)}${line(304, 36, 60)}
      ${[60, 86, 112].map((y) => `${line(304, y, 36, "t-line s")}<rect x="348" y="${y - 6}" width="66" height="18" rx="5" class="t-fill"/>`).join("")}
      <rect x="304" y="140" width="110" height="20" rx="6" class="t-accent"/>`),
  },
  {
    title: "Frames from a real page",
    advanced: true,
    text: "Show a screen inside the surroundings of an existing application. Make a frame from a link: open the live page, choose the content area (click, widen or narrow, or drag a rectangle; Shift adds more parts) and the rest, with its icons and background pictures, becomes the frame. Keep it for this project or for all projects, then pick it in the environment menu of any screen.",
    art: S(`${frame(14, 14, 412, 162)}<rect x="14" y="14" width="412" height="26" rx="8" class="t-fill"/>${line(28, 24, 60, "t-line s")}
      <rect x="14" y="40" width="70" height="136" class="t-fill" opacity=".5"/>${[56, 74, 92].map((y) => line(24, y, 50, "t-line s")).join("")}
      <rect x="100" y="54" width="312" height="108" rx="6" class="t-card t-sel" stroke-dasharray="6 4"/>${line(116, 72, 110)}<rect x="116" y="90" width="280" height="14" rx="4" class="t-fill"/>${line(116, 116, 240, "t-line s")}${line(116, 132, 180, "t-line s")}`),
  },
  {
    title: "Project memory",
    text: "Business rules, project and screen descriptions and notes live in the project folder, so every request builds on them. Brand Guidelines… turns the customer's brand manual into a design guide the agent follows. Link a git repository: the agent reads it, never writes to it, and any branch works as a read-only snapshot.",
    art: S(`${frame(14, 14, 412, 34)}<circle cx="34" cy="31" r="5" class="t-accent"/>${line(48, 28, 90)}<rect x="320" y="24" width="86" height="14" rx="7" class="t-fill"/>
      ${frame(14, 60, 200, 116)}${line(28, 76, 80)}${[96, 116, 136].map((y) => `<rect x="28" y="${y}" width="26" height="12" rx="3" class="t-accent"/>${line(62, y + 3, 130, "t-line s")}`).join("")}
      ${frame(226, 60, 200, 116)}${line(240, 76, 60)}${[0, 1, 2, 3].map((k) => `<circle cx="${250 + k * 30}" cy="106" r="10" class="${k ? "t-fill" : "t-accent"}"/>`).join("")}${line(240, 132, 160, "t-line s")}${line(240, 148, 120, "t-line s")}`),
  },
  {
    title: "Work with Plus4U documents",
    text: "Sign in to Plus4U with the account button. Publish puts a screen or the sitemap straight onto a page of a uuManagementKit document; next time one click publishes to the same page. Link the project to a document, keyTask or portal: Upload and Download keep the whole project in its attachments, and the toolbar shows when the copy there is newer.",
    art: S(`${frame(14, 30, 150, 130)}${line(28, 48, 80)}<rect x="28" y="66" width="122" height="40" rx="5" class="t-fill"/>${line(28, 120, 100, "t-line s")}
      <rect x="40" y="134" width="98" height="18" rx="9" class="t-accent"/><text x="89" y="147" text-anchor="middle" class="t-btn">Publish</text>
      <path d="M180 95h50" class="t-arrow"/><path d="M222 86l10 9-10 9" class="t-arrow"/>
      ${frame(250, 14, 176, 162)}<rect x="250" y="14" width="176" height="28" rx="8" class="t-fill"/>${line(264, 25, 70, "t-line s")}<circle cx="408" cy="28" r="7" class="t-accent"/>
      ${line(264, 56, 90)}<rect x="264" y="72" width="148" height="44" rx="5" class="t-card t-sel"/>${line(276, 86, 100, "t-line s")}${line(276, 100, 80, "t-line s")}${line(264, 132, 140, "t-line s")}${line(264, 148, 110, "t-line s")}`),
  },
  {
    title: "Share, review, stay up to date",
    text: "Share on the bar of a screen gives it as an image, an HTML file or a uu5String for a document, and the project as a ZIP: copy it, save it or drag it into a chat or a mail. Settings… checks your Claude Code and Codex setup, and the app tells you when a new version is out.",
    art: S(`${frame(14, 30, 170, 130)}${line(28, 48, 80)}<rect x="28" y="66" width="142" height="40" rx="5" class="t-fill"/>${line(28, 120, 100, "t-line s")}
      <path d="M204 95h50" class="t-arrow"/><path d="M246 86l10 9-10 9" class="t-arrow"/>
      <rect x="276" y="40" width="64" height="64" rx="10" class="t-card"/><text x="308" y="78" text-anchor="middle" class="t-text">PNG</text>
      <rect x="352" y="40" width="64" height="64" rx="10" class="t-card"/><text x="384" y="78" text-anchor="middle" class="t-text">uu5</text>
      <rect x="276" y="116" width="140" height="44" rx="10" class="t-card"/><text x="346" y="143" text-anchor="middle" class="t-text">project .zip</text>`),
  },
];

/** `isSimple()`: the role sees the simple view: some cards then speak less of tokens and props, the cards of Advanced features are left out. */
export function createTour({ onClose, isSimple = () => false }) {
  const box = document.createElement("div");
  box.id = "tour"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="tr-title">
    <div class="tr-art"></div><h2 id="tr-title"></h2><p class="tr-text"></p>
    <div class="tr-dots" aria-hidden="true"></div>
    <div class="row"><button class="tr-skip" type="button">Skip</button><span class="grow"></span><button class="tr-back" type="button">Back</button><button class="tr-next" type="button">Next</button></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  let i = 0, cards = CARDS;

  function show(n) {
    i = Math.max(0, Math.min(cards.length - 1, n));
    const c = cards[i], last = i === cards.length - 1;
    q(".tr-art").innerHTML = c.art; q("#tr-title").textContent = c.title; q(".tr-text").textContent = textOf(c);
    q(".tr-dots").innerHTML = cards.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    q(".tr-back").hidden = i === 0; q(".tr-skip").hidden = last;
    q(".tr-next").textContent = last ? "Get started" : "Next";
  }
  function close() { if (box.hidden) return; box.hidden = true; onClose?.(); }
  q(".tr-skip").onclick = close;
  addDialogClose(q(".card"), close);
  q(".tr-back").onclick = () => show(i - 1);
  q(".tr-next").onclick = () => (i === cards.length - 1 ? close() : show(i + 1));
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); q(".tr-next").click(); }
    else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); show(i - 1); }
  });
  const textOf = (c) => (isSimple() && TOUR_TEXT[c.key]?.simple) || c.text;
  /** The text box is as tall as the longest text, so the dots and the buttons stay in place from card to card. */
  function fitText() {
    const t = q(".tr-text"); t.style.minHeight = "";
    let max = 0; for (const c of cards) { t.textContent = textOf(c); max = Math.max(max, t.offsetHeight); }
    t.style.minHeight = `${max}px`;
  }
  return { open() { cards = isSimple() ? CARDS.filter((c) => !c.advanced) : CARDS; box.hidden = false; fitText(); show(0); q(".tr-next").focus(); }, close, isOpen: () => !box.hidden };
}
