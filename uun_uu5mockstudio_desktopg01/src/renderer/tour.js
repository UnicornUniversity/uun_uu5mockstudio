/**
 * The welcome tour: a few cards that show what the app does, opened on the first run (and from Help > Welcome Tour…).
 * Every card has a small drawing (inline SVG in the colors of the theme), a title and a few lines. Left / Right arrows move, Escape closes.
 */
const S = (inner) => `<svg viewBox="0 0 440 190" role="img" aria-hidden="true" class="tr-svg">${inner}</svg>`;
const frame = (x, y, w, h, cls = "t-card") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="${cls}"/>`;
const line = (x, y, w, cls = "t-line") => `<rect x="${x}" y="${y}" width="${w}" height="6" rx="3" class="${cls}"/>`;

const CARDS = [
  {
    title: "Describe a screen, get a live page",
    text: "Write what you need in plain words. Claude builds it as a real uu5 / uuGDS page that you can click, inspect and share. One HTML file per screen, in a folder per project.",
    art: S(`${frame(14, 20, 150, 150)}${line(28, 40, 90)}${line(28, 56, 110, "t-line s")}${line(28, 72, 70, "t-line s")}
      <rect x="28" y="124" width="122" height="30" rx="15" class="t-accent"/><text x="89" y="143" text-anchor="middle" class="t-btn">Send</text>
      <path d="M176 95h50" class="t-arrow"/><path d="M218 86l10 9-10 9" class="t-arrow"/>
      ${frame(240, 20, 186, 150)}${line(254, 36, 70)}<rect x="254" y="54" width="158" height="14" rx="4" class="t-fill"/>
      ${[80, 100, 120, 140].map((y) => `${line(254, y, 158, "t-line s")}`).join("")}<rect x="354" y="30" width="58" height="16" rx="8" class="t-accent"/>`),
  },
  {
    title: "The chat knows your context",
    text: "Paste or drop a screenshot or a sketch into the request. Type @ to mention another screen, a file of the linked repository or a component of the uu5 libraries (the cube button browses them). The target button picks a component on a screen.",
    art: S(`${frame(60, 14, 320, 162)}
      <rect x="76" y="30" width="180" height="26" rx="13" class="t-fill"/>${line(92, 40, 120, "t-line s")}
      <rect x="170" y="66" width="194" height="26" rx="13" class="t-accent"/>${line(186, 76, 140, "t-line w")}
      ${frame(76, 108, 288, 52, "t-card t-focus")}<text x="92" y="130" class="t-text">Build it like @room-list …</text>
      ${frame(112, 140, 116, 30)}<text x="126" y="159" class="t-text">@room-list</text>
      <circle cx="314" cy="134" r="12" class="t-card"/><circle cx="342" cy="134" r="12" class="t-card"/>`),
  },
  {
    title: "A canvas for all screens",
    text: "Zoom and pan (⌥ + two-finger scroll moves the canvas while you work inside a screen), choose a device size, arrange the screens with one click, or open one fullscreen. Pin sticky notes to a screen: they stay with it, right on the canvas.",
    art: S(`${frame(14, 30, 120, 130)}${line(26, 46, 60)}${line(26, 62, 90, "t-line s")}${line(26, 78, 80, "t-line s")}
      ${frame(150, 30, 150, 130, "t-card t-sel")}${line(162, 46, 70)}<rect x="162" y="62" width="126" height="40" rx="5" class="t-fill"/>${line(162, 114, 100, "t-line s")}
      ${frame(316, 30, 110, 130)}${line(328, 46, 50)}${line(328, 62, 80, "t-line s")}
      <rect x="318" y="8" width="92" height="46" rx="6" class="t-note"/>${line(326, 20, 70, "t-line n")}${line(326, 34, 50, "t-line n")}`),
  },
  {
    title: "Inspect and tweak components",
    text: "Switch on the inspector and click any uu5 component. Change its props: colors, icons from the uuGDS and uuBml catalogs, even objects and arrays. The change is written back to the HTML. Shift-click marks several components to use together in the chat.",
    art: S(`${frame(14, 20, 260, 150)}${line(30, 38, 100)}
      <rect x="30" y="58" width="110" height="34" rx="6" class="t-accent"/><rect x="26" y="54" width="118" height="42" rx="8" class="t-orange"/>
      ${line(30, 112, 200, "t-line s")}${line(30, 128, 160, "t-line s")}
      ${frame(290, 20, 136, 150)}${line(304, 36, 60)}
      ${[60, 86, 112].map((y) => `${line(304, y, 36, "t-line s")}<rect x="348" y="${y - 6}" width="66" height="18" rx="5" class="t-fill"/>`).join("")}
      <rect x="304" y="140" width="110" height="20" rx="6" class="t-accent"/>`),
  },
  {
    title: "Project memory",
    text: "Link a git repository: Claude reads it, never writes to it, and any branch works as a read-only snapshot. Business rules, project and screen descriptions and notes live in the project folder, so every request builds on them.",
    art: S(`${frame(14, 14, 412, 34)}<circle cx="34" cy="31" r="5" class="t-accent"/>${line(48, 28, 90)}<rect x="320" y="24" width="86" height="14" rx="7" class="t-fill"/>
      ${frame(14, 60, 200, 116)}${line(28, 76, 80)}${[96, 116, 136].map((y) => `<rect x="28" y="${y}" width="26" height="12" rx="3" class="t-accent"/>${line(62, y + 3, 130, "t-line s")}`).join("")}
      ${frame(226, 60, 200, 116)}${line(240, 76, 60)}${line(240, 96, 160, "t-line s")}${line(240, 112, 140, "t-line s")}${line(240, 128, 150, "t-line s")}`),
  },
  {
    title: "Share, and stay up to date",
    text: "Export a screen as an image or HTML, or the whole project as a ZIP, and share it from the menu. Help > Claude Code & Plugins… checks your setup, and the app tells you when a new version is out. On a Mac, View > Appearance > Glass Effect gives it a translucent look.",
    art: S(`${frame(14, 30, 170, 130)}${line(28, 48, 80)}<rect x="28" y="66" width="142" height="40" rx="5" class="t-fill"/>${line(28, 120, 100, "t-line s")}
      <path d="M204 95h50" class="t-arrow"/><path d="M246 86l10 9-10 9" class="t-arrow"/>
      <rect x="276" y="40" width="64" height="64" rx="10" class="t-card"/><text x="308" y="78" text-anchor="middle" class="t-text">PNG</text>
      <rect x="352" y="40" width="64" height="64" rx="10" class="t-card"/><text x="384" y="78" text-anchor="middle" class="t-text">HTML</text>
      <rect x="276" y="116" width="140" height="44" rx="10" class="t-card"/><text x="346" y="143" text-anchor="middle" class="t-text">project .zip</text>`),
  },
];

export function createTour({ onClose }) {
  const box = document.createElement("div");
  box.id = "tour"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="tr-title">
    <div class="tr-art"></div><h2 id="tr-title"></h2><p class="tr-text"></p>
    <div class="tr-dots" aria-hidden="true"></div>
    <div class="row"><button class="tr-skip" type="button">Skip</button><span class="grow"></span><button class="tr-back" type="button">Back</button><button class="tr-next" type="button">Next</button></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  let i = 0;

  function show(n) {
    i = Math.max(0, Math.min(CARDS.length - 1, n));
    const c = CARDS[i], last = i === CARDS.length - 1;
    q(".tr-art").innerHTML = c.art; q("#tr-title").textContent = c.title; q(".tr-text").textContent = c.text;
    q(".tr-dots").innerHTML = CARDS.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    q(".tr-back").hidden = i === 0; q(".tr-skip").hidden = last;
    q(".tr-next").textContent = last ? "Get started" : "Next";
  }
  function close() { if (box.hidden) return; box.hidden = true; onClose?.(); }
  q(".tr-skip").onclick = close;
  q(".tr-back").onclick = () => show(i - 1);
  q(".tr-next").onclick = () => (i === CARDS.length - 1 ? close() : show(i + 1));
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); q(".tr-next").click(); }
    else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); show(i - 1); }
  });
  return { open() { show(0); box.hidden = false; q(".tr-next").focus(); }, close, isOpen: () => !box.hidden };
}
