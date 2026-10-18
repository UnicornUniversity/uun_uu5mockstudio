#!/usr/bin/env node
/**
 * Records a short, silent marketing video (~3 min) of uu5Mock Studio: it starts the app in an isolated profile and plays through
 * the story with real mouse input, a visible cursor and captions: project description -> linked git repository -> one sentence becomes
 * a live screen (Claude also records the business rules) -> rules (edit in place / Markdown) -> description and rule of a screen ->
 * second screen + arrange -> fullscreen with a note -> inspector -> share -> plugin check -> update notice -> Glass Effect. The window is captured with the DevTools screencast and encoded to MP4 by Electron itself.
 * No microphone, no screen-recording permission, no ffmpeg. The script is docs/DEMO.md in executable form.
 *
 *   node scripts/demo/record.mjs --out demo.mp4                      real run: Claude generates the screens (minutes, uses tokens: TWO agent runs)
 *   node scripts/demo/record.mjs --prepared ./my-screens --out ...   rehearsal: copies two ready-made .html screens (first and second in alphabetical order) instead of calling Claude (no tokens)
 *   options: --lang en|cs  --packaged "/path/uu5Mock Studio.app"  --port 9460  --speed 8  --keep-frames
 */
import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../..");
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? def : (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? true : process.argv[i + 1]); };
const opts = { out: path.resolve(arg("out", "demo-output/uu5mock-demo.mp4")), lang: arg("lang", "en") === "cs" ? "cs" : "en", port: Number(arg("port", 9460)), speed: Number(arg("speed", 8)), packaged: arg("packaged", null), prepared: arg("prepared", null), keep: arg("keep-frames", false) === true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- texts
const T = {
  en: {
    project: "Demo",
    projDesc: "Room booking and overview for the university facility office.",
    prompt1: "Use the attached sketch as the layout. Create a University Room Management screen: a table of rooms (code, building, type, capacity, active), a filter by building and type above it and an “Add room” button that opens a modal form with validation. Use sample data. Distinguish room types with colored badges. Keep the “Add room” button prominent, with an icon and its own colorScheme; add icon buttons to the table. The form uses plain text and number fields and really adds the room to the table; every table row has a trash icon button that deletes the room after a confirmation. Business rules: a room code is unique and the capacity is at least 1. Follow the naming of the linked repository.",
    sketch: { title: "Room management", building: "Building", type: "Type", add: "+ Add room", cols: ["Code", "Building", "Type", "Capacity", "Active"] },
    prompt2: "Add a second screen Room Detail that follows @ the first screen: basic room information at the top and a weekly occupancy schedule below as a clear grid (days × hours) with colored reservation blocks. Use the same rooms as in the list.",
    note: "Ask the facility office: are archived rooms still listed?",
    typed: "A-205", values: ["Main building", "Lecture room", "Floor 2"], number: "40",
    ruleEdit: " (case-insensitive)",
    screenDesc: "The main list of all rooms with filters. Entry point for adding a room.",
    cap: {
      intro: "Design uu5 / uuGDS apps with AI", project: "One folder per project. One HTML file per screen.", desc: "Give the project context", git: "Link your git repository. Claude reads it, never writes.",
      prompt: "Describe the screen in plain words", sketch: "Paste or drop a screenshot or a sketch into the request", second: "More screens side by side: @ links to the first one", arrange: "Arrange screens in one click", fullscreen: "Try it fullscreen and pin a note to the screen", note: "Notes stay with the screen, right on the canvas", working: "Claude builds it (sped up)", done: "A live, interactive uu5 page", form: "Validation first, then fill the form: the record appears in the table", del: "Delete a record, with confirmation", rules: "Business rules are captured as you talk",
      rulesEdit: "Edit in place, or switch to Markdown", screen: "Describe any screen: the description sits right below it", inspect: "Inspect real uu5 components, tweak props, pick icons",
      color: "Change a prop: the screen rewrites itself", icon: "Icons straight from the uuGDS catalog", share: "Export or share a screen, or the whole project as ZIP",
      plugins: "Plugins stay current: check any time, update on your terms", update: "New release? You are told: download it, read the notes, or postpone", glass: "Switch on the optional Glass Effect (macOS)", glass2: "Floating chat, toolbar and menus: translucent and blurred", outro: "uu5Mock Studio · Marek Beránek, Unicorn University",
    },
  },
  cs: {
    project: "Demo",
    projDesc: "Rezervace a přehled místností pro provozní oddělení univerzity.",
    prompt1: "Jako rozvržení použij přiložený náčrt. Vytvoř obrazovku Správa místností univerzity: tabulka místností (kód, budova, typ, kapacita, aktivní), nad ní filtr podle budovy a typu a tlačítko „Přidat místnost“, které otevře modální formulář s validací. Použij ukázková data. Barevně rozliš typy místností badge. Tlačítko „Přidat místnost“ nech výrazné, s ikonou a vlastním colorScheme; v tabulce přidej tlačítka s ikonami. Formulář používá běžná textová a číselná pole a místnost opravdu přidá do tabulky; každý řádek tabulky má tlačítko s ikonou koše, které místnost po potvrzení smaže. Business pravidla: kód místnosti je unikátní a kapacita je alespoň 1. Dodrž pojmenování z napojeného repozitáře.",
    sketch: { title: "Správa místností", building: "Budova", type: "Typ", add: "+ Přidat místnost", cols: ["Kód", "Budova", "Typ", "Kapacita", "Aktivní"] },
    prompt2: "Přidej druhou obrazovku Detail místnosti, navazující na @ první obrazovku: základní informace o místnosti nahoře a pod nimi týdenní rozvrh obsazenosti jako přehledná mřížka (dny × hodiny) s barevnými bloky rezervací. Použij stejné místnosti jako v seznamu.",
    note: "Zeptat se provozního oddělení: zobrazují se i archivované místnosti?",
    typed: "A-205", values: ["Hlavní budova", "Přednáškový sál", "2. patro"], number: "40",
    ruleEdit: " (bez ohledu na velikost písmen)",
    screenDesc: "Hlavní seznam všech místností s filtry. Vstupní bod pro přidání místnosti.",
    cap: {
      intro: "Návrh uu5 / uuGDS aplikací s AI", project: "Jedna složka na projekt. Jeden HTML soubor na obrazovku.", desc: "Dej projektu kontext", git: "Napoj git repozitář. Claude čte, nikdy nepíše.",
      prompt: "Zadání běžnou řečí", sketch: "Do zadání vlož i screenshot nebo náčrt", second: "Víc obrazovek vedle sebe: @ odkáže na první", arrange: "Uspořádání obrazovek jedním klikem", fullscreen: "Vyzkoušej fullscreen a připni k obrazovce poznámku", note: "Poznámky zůstávají u obrazovky, přímo na plátně", working: "Claude to staví (zrychleno)", done: "Živá, interaktivní uu5 stránka", form: "Nejdřív validace, pak vyplněný formulář: záznam se objeví v tabulce", del: "Smazání záznamu s potvrzením", rules: "Business pravidla se zapisují, jak mluvíš",
      rulesEdit: "Úprava přímo v textu, nebo přepnutí na Markdown", screen: "Popiš libovolnou obrazovku: popis je hned pod ní", inspect: "Inspekce skutečných uu5 komponent, úpravy props, výběr ikon",
      color: "Změníš prop: obrazovka se přepíše", icon: "Ikony přímo z katalogu uuGDS", share: "Export nebo sdílení obrazovky, případně celého projektu jako ZIP",
      plugins: "Pluginy zůstávají aktuální: kontrola kdykoli, aktualizace podle tebe", update: "Nové vydání? Aplikace to řekne: stáhni, přečti poznámky, nebo odlož", glass: "Zapni volitelný Glass Effect (macOS)", glass2: "Plovoucí chat, lišta i menu: průhledné a rozmazané", outro: "uu5Mock Studio · Marek Beránek, Unicorn University",
    },
  },
}[opts.lang];
const RULES_SAMPLE = opts.lang === "en"
  ? "# Business rules\n\n## General\n\n- R-001 A room code is unique\n- R-002 Capacity is at least 1\n"
  : "# Business rules\n\n## General\n\n- R-001 Kód místnosti je unikátní\n- R-002 Kapacita je alespoň 1\n";

// ---------------------------------------------------------------- app + recording state
const work = fs.mkdtempSync(path.join(os.tmpdir(), "uu5demo-"));
const framesDir = path.join(work, "frames"), projectsDir = path.join(work, "projects"), profile = path.join(work, "profile");
fs.mkdirSync(framesDir, { recursive: true }); fs.mkdirSync(projectsDir, { recursive: true });
const frames = [], segments = [];
let cdp, app, t0 = 0, recording = false, size = { width: 1500, height: 940 };
const now = () => performance.now() - t0;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function jpegSize(buf) { // width/height from the first SOF marker
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/** A small git repository to link (two branches); the real repositories of the author are never touched. */
function makeDemoRepo() {
  const dir = path.join(work, "unicorn-rooms"), env = { ...process.env, GIT_AUTHOR_NAME: "Demo", GIT_AUTHOR_EMAIL: "demo@example.com", GIT_COMMITTER_NAME: "Demo", GIT_COMMITTER_EMAIL: "demo@example.com" };
  const git = (...a) => execFileSync("git", a, { cwd: dir, env, stdio: "ignore" });
  fs.mkdirSync(path.join(dir, "src/rooms"), { recursive: true });
  fs.writeFileSync(path.join(dir, "README.md"), "# unicorn-rooms\n\nRoom management of the university.\n");
  fs.writeFileSync(path.join(dir, "src/rooms/RoomList.js"), "export const RoomList = () => null; // uuRoomList: table of rooms\n");
  fs.writeFileSync(path.join(dir, "src/rooms/RoomForm.js"), "export const RoomForm = () => null; // uuRoomForm: create / edit a room\n");
  git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-q", "-m", "Rooms: list and form");
  git("checkout", "-q", "-b", "feature/rooms-v2"); fs.writeFileSync(path.join(dir, "src/rooms/RoomCalendar.js"), "export const RoomCalendar = () => null; // uuRoomCalendar\n");
  git("add", "-A"); git("commit", "-q", "-m", "Rooms: calendar"); git("checkout", "-q", "main");
  return dir;
}

/**
 * A tiny stand-in for the GitHub releases API that announces the next minor version, so that the update notice can be shown without
 * a really newer release (the app is pointed at it with STUDIO_UPDATE_API). The video says so in docs/DEMO.md.
 */
let apiServer;
function startFakeReleases() {
  const [maj, min] = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).version.split(".").map(Number), next = `${maj}.${min + 1}.0`;
  const R = "UnicornUniversity/uun_uu5mockstudio", base = `https://github.com/${R}/releases`;
  const body = JSON.stringify({ tag_name: `v${next}`, draft: false, prerelease: false, html_url: `${base}/tag/v${next}`, body: "Demo release", assets: [{ name: `uu5Mock-Studio-${next}-arm64.dmg`, size: 120e6, browser_download_url: `${base}/download/v${next}/uu5Mock-Studio-${next}-arm64.dmg` }] });
  const apiPort = opts.port + 20;
  apiServer = http.createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end(body); }).listen(apiPort, "127.0.0.1");
  return `http://127.0.0.1:${apiPort}`;
}

async function launch() {
  const env = { ...process.env, STUDIO_PROJECTS_DIR: projectsDir, STUDIO_PICK_REPO: makeDemoRepo(), STUDIO_UPDATE_API: startFakeReleases() };
  const args = [`--user-data-dir=${profile}`, `--remote-debugging-port=${opts.port}`];
  app = opts.packaged
    ? spawn(path.join(opts.packaged, "Contents", "MacOS", "uu5Mock Studio"), args, { env, stdio: "ignore" })
    : spawn("npx", ["electron", repo, ...args], { cwd: repo, env, stdio: "ignore" });
  cdp = await connect(opts.port);
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  await cdp.ev(`new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r)))`);
  await sleep(2500);
}

async function startRecording() {
  t0 = performance.now(); recording = true;
  cdp.on("Page.screencastFrame", (p) => {
    const buf = Buffer.from(p.data, "base64");
    if (!frames.length) size = jpegSize(buf) ?? size;
    const file = path.join(framesDir, `${String(frames.length).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, buf); frames.push({ t: now(), file });
    cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1600, maxHeight: 1000, everyNthFrame: 1 });
}

/** Everything inside `fn` is shown `speed` times faster in the video (waiting for the agent). */
async function fast(fn, speed = opts.speed) {
  const from = now(); try { return await fn(); } finally { segments.push({ from, to: now(), speed }); }
}

// ---------------------------------------------------------------- overlay: cursor, click ripple, captions
const OVERLAY = `(() => {
  if (window.__demo) return;
  const css = document.createElement("style");
  css.textContent = \`#demo-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:26px;margin:-2px 0 0 -2px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));transition:transform .016s linear}
  .demo-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:3px solid #3b82f6;animation:demoRipple .55s ease-out forwards}
  @keyframes demoRipple{to{transform:scale(4.2);opacity:0}}
  #demo-caption{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;max-width:78vw;padding:12px 22px;border-radius:14px;background:rgba(17,24,39,.88);color:#fff;font:600 21px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;opacity:0;transition:opacity .25s}\`;
  document.head.append(css);
  const c = document.createElement("div"); c.id = "demo-cursor";
  c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.4 19 2.6-7.6L20.6 11z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const cap = document.createElement("div"); cap.id = "demo-caption";
  document.body.append(c, cap);
  window.__demo = {
    cur(x, y) { c.style.transform = "translate(" + x + "px," + y + "px)"; },
    click(x, y) { const r = document.createElement("div"); r.className = "demo-ripple"; r.style.left = x + "px"; r.style.top = y + "px"; document.body.append(r); setTimeout(() => r.remove(), 700); },
    caption(t) { cap.textContent = t || ""; cap.style.opacity = t ? 1 : 0; },
  };
  window.__demo.cur(640, 420);
})()`;

let pos = { x: 640, y: 420 };
const caption = async (text, ms = 0) => { await cdp.ev(`window.__demo.caption(${JSON.stringify(text)})`); if (ms) await sleep(ms); };

async function moveTo(x, y, ms = 650) {
  const steps = Math.max(10, Math.round(ms / 18)), from = pos;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
    const nx = from.x + (x - from.x) * e, ny = from.y + (y - from.y) * e;
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: nx, y: ny });
    await cdp.ev(`window.__demo.cur(${nx},${ny})`);
    await sleep(ms / steps);
  }
  pos = { x, y };
}
async function clickAt(x, y, { ms = 650, pause = 450 } = {}) {
  await moveTo(x, y, ms);
  await cdp.ev(`window.__demo.click(${x},${y})`);
  for (const type of ["mousePressed", "mouseReleased"]) await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  await sleep(pause);
}
async function wheelAt(x, y, deltaY, modifiers = 2) { await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY, modifiers }); }
async function key(k, code, vk, modifiers = 0) { for (const type of ["keyDown", "keyUp"]) await cdp.send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk, modifiers }); }
const escape = () => key("Escape", "Escape", 27);

/** Centre of the first element of the app window matching `selector` (visible), in window coordinates. */
async function centre(selector, { index = 0, text } = {}) {
  return cdp.ev(`(() => { const re = ${text ? `new RegExp(${JSON.stringify(text)}, "i")` : "null"}; const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && (!re || re.test(e.innerText || e.title || "")); }); const e = els[${index}]; if (!e) return null; e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
}
async function click(selector, o = {}) {
  const c = await centre(selector, o);
  if (!c) throw new Error(`not found: ${selector}`);
  await clickAt(c.x, c.y, o);
}
const exists = (selector) => cdp.ev(`!!document.querySelector(${JSON.stringify(selector)})`);
const setSelect = (selector, value) => cdp.ev(`(() => { const s = document.querySelector(${JSON.stringify(selector)}); if (!s) return false; s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);

async function typeText(text, delay = 28) { for (const ch of text) { await cdp.send("Input.insertText", { text: ch }); await sleep(delay); } }
async function typeInto(selector, text, delay) { await click(selector); await typeText(text, delay); }

// ---- inside the mockup (the <webview>): coordinates are scaled by the canvas zoom
const guest = (js, frame = 0) => cdp.ev(`document.querySelectorAll("webview")[${frame}].executeJavaScript(${JSON.stringify(js)})`);
async function guestPoint(finderBody, frame = 0) {
  return cdp.ev(`(async () => { const wv = document.querySelectorAll("webview")[${frame}]; if (!wv) return null; const wr = wv.getBoundingClientRect();
    const g = await wv.executeJavaScript(${JSON.stringify(`(() => { const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 18 && r.height > 14 && r.top >= 0 && r.top < innerHeight - 30 && r.left >= 0 && r.left < innerWidth - 10 && getComputedStyle(e).visibility !== "hidden"; };
      const e = (() => { ${finderBody} })(); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, iw: innerWidth }; })()`)});
    if (!g) return null; const s = wr.width / g.iw; return { x: wr.left + g.x * s, y: wr.top + g.y * s }; })()`);
}
const BUTTON = (re) => `const re = ${re}; const all = [...document.querySelectorAll("button")].filter(vis); return all.find((b) => re.test(b.innerText)) || all[0];`;
async function guestClick(finderBody, frame = 0, o = {}) {
  const p = await guestPoint(finderBody, frame);
  if (!p) throw new Error("nothing to click in the mockup");
  await clickAt(p.x, p.y, o); return p;
}
async function guestType(text, delay = 40, frame = 0) {
  await guest(`(() => { const i = [...document.querySelectorAll("input[type=text], input:not([type]), textarea")].find((e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 10 && r.top >= 0 && r.top < innerHeight; }); if (i) i.focus(); })()`, frame);
  await guestTypeActive(text, delay, frame);
}
/** Types into the field that has the focus (a real click put it there), one character at a time. */
async function guestTypeActive(text, delay = 40, frame = 0) {
  for (let n = 1; n <= text.length; n++) {
    await guest(`(() => { const i = document.activeElement; if (!i || !("value" in i)) return; const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), "value").set; set.call(i, ${JSON.stringify(text.slice(0, n))}); i.dispatchEvent(new Event("input", { bubbles: true })); })()`, frame);
    await sleep(delay);
  }
}

// ---------------------------------------------------------------- steps
const frameCount = () => cdp.ev(`document.querySelectorAll(".frame").length`);
async function waitFor(fn, { timeout = 30000, every = 400 } = {}) { const s = Date.now(); while (Date.now() - s < timeout) { if (await fn()) return true; await sleep(every); } return false; }
const preparedFiles = () => (opts.prepared ? fs.readdirSync(opts.prepared).filter((f) => f.endsWith(".html")).sort() : []);

/** Sends the prompt typed so far and waits until the agent is done (or, in rehearsal mode, drops a ready-made screen into the project). */
async function submitAndWait(screenIndex) {
  const before = await frameCount();
  if (opts.prepared) {
    const f = preparedFiles()[screenIndex];
    await click("#send"); await sleep(1500);
    await caption(T.cap.working);
    await fast(async () => { await sleep(4000); if (f) fs.copyFileSync(path.join(opts.prepared, f), path.join(projectsDir, T.project, f)); if (screenIndex === 0) fs.writeFileSync(path.join(projectsDir, T.project, "BUSINESS_RULES.md"), RULES_SAMPLE); await waitFor(async () => (await frameCount()) > before, { timeout: 60000 }); await sleep(2500); });
    return;
  }
  await click("#send");
  await caption(T.cap.working);
  await fast(async () => {
    await waitFor(async () => !(await cdp.ev(`document.getElementById("working").hidden`)), { timeout: 60000 }); // the agent started
    await waitFor(async () => cdp.ev(`document.getElementById("working").hidden`), { timeout: 20 * 60 * 1000, every: 1000 }); // ... and finished
    await waitFor(async () => (await frameCount()) > before, { timeout: 60000 });
    await sleep(3000);
  });
}

/** Draws a wireframe of the screen and pastes it into the prompt the way a real paste does (clipboard event with an image file). */
const pasteSketch = () => cdp.ev(`(async () => {
  const L = ${JSON.stringify(T.sketch)}, c = document.createElement("canvas"); c.width = 1200; c.height = 720; const g = c.getContext("2d");
  const box = (x, y, w, h, r = 8, fill = "#fff", line = "#9aa3b2") => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); g.strokeStyle = line; g.lineWidth = 2; g.stroke(); };
  const text = (t, x, y, size = 22, color = "#374151", weight = "500") => { g.fillStyle = color; g.font = weight + " " + size + "px -apple-system, Segoe UI, sans-serif"; g.fillText(t, x, y); };
  g.fillStyle = "#f3f4f6"; g.fillRect(0, 0, 1200, 720);
  text(L.title, 60, 90, 40, "#111827", "700");
  box(60, 130, 230, 52); text(L.building + " ▾", 80, 164); box(310, 130, 230, 52); text(L.type + " ▾", 330, 164);
  box(900, 126, 240, 60, 10, "#dbeafe", "#2563eb"); text(L.add, 934, 164, 24, "#1d4ed8", "700");
  box(60, 220, 1080, 440, 12); const xs = [90, 260, 470, 690, 900];
  L.cols.forEach((t, i) => text(t, xs[i], 268, 22, "#111827", "700")); g.fillStyle = "#d1d5db"; g.fillRect(60, 290, 1080, 2);
  for (let r = 0; r < 4; r++) { const y = 340 + r * 78;
    text(["A-101", "A-110", "A-204", "B-205"][r], xs[0], y, 22); g.fillStyle = "#cbd5e1"; g.fillRect(xs[1], y - 16, 120 + (r % 2) * 40, 14);
    box(xs[2], y - 28, 110, 36, 18, ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3"][r], "#9aa3b2"); g.fillStyle = "#cbd5e1"; g.fillRect(xs[3], y - 16, 60, 14);
    box(xs[4], y - 26, 36, 32, 16, r === 2 ? "#fff" : "#bbf7d0", "#6b7280"); box(1070, y - 30, 40, 40, 8); text("🗑", 1078, y, 22);
    g.fillStyle = "#e5e7eb"; if (r < 3) g.fillRect(80, y + 22, 1040, 2); }
  const blob = await new Promise((r) => c.toBlob(r, "image/png")), dt = new DataTransfer();
  dt.items.add(new File([blob], "sketch.png", { type: "image/png" }));
  const p = document.getElementById("prompt"); p.focus();
  p.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
})()`);

const badgeCount = () => cdp.ev(`(() => { const b = document.getElementById("rulesbadge"); return b && !b.hidden ? Number(b.textContent) || 0 : 0; })()`);

const steps = [
  ["intro", async () => { await caption(T.cap.intro, 2600); }],
  ["project", async () => {
    await caption(T.cap.project);
    await click("#projbtn"); await click('#projmenu [data-act="new"]'); await sleep(400);
    await typeInto("#dlg-input", T.project, 60); await sleep(500); await click("#dlg-ok"); await sleep(1800);
    await caption("", 200);
  }],
  ["glass on", async () => {
    await caption(T.cap.glass);
    if (!(await cdp.ev(`/Mac/.test(navigator.platform)`))) throw new Error("the glass switch exists on macOS only");
    await cdp.ev(`window.studio.toggleGlass()`); await sleep(1500);   // View > Appearance > Glass Effect
    await click("#chatmode"); await sleep(1400);                                                    // the chat floats over the canvas: translucent and blurred, for the whole video
    await caption("", 200);
  }],
  ["project description", async () => {
    await caption(T.cap.desc);
    await click("#ds-main"); await sleep(600);                        // the cursor is already in the project field
    await typeText(T.projDesc, 24); await sleep(900);
    await click("#descdlg .dd-close"); await sleep(1400);             // leaving the field saves it
  }],
  ["git", async () => {
    await caption(T.cap.git);
    await click("#projbtn"); await click('#projmenu [data-act="repo-link"]'); await sleep(2400);
    await click("#rs-branch"); await sleep(2400);                    // the branches: Claude can read any of them as a read-only snapshot
    await click("#log"); await sleep(500);
  }],
  ["prompt", async () => {
    await caption(T.cap.sketch);
    await click("#prompt"); await pasteSketch(); await sleep(2800);                 // the sketch appears as an attachment of the request
    await caption(T.cap.prompt);
    await typeText(T.prompt1, 12); await sleep(500);
    await submitAndWait(0);
    await caption(T.cap.done, 1600);
  }],
  ["interact", async () => {
    // the first click selects the screen, the second reaches the mockup: open the form with the "add" button
    await guestClick(`return document.querySelector("body")`, 0, { pause: 600 });
    const SEL = `'[role=dialog], dialog, [class*=modal], [class*=Modal]'`; // several dialogs may exist in the page, only the open (visible) one counts
    const VIS = `const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 18 && r.height > 14 && r.top >= 0 && r.top < innerHeight - 30 && r.left >= 0 && r.left < innerWidth - 10 && getComputedStyle(e).visibility !== "hidden"; };`;
    // buttons and fields of the open dialog: a closed dialog can leave an empty container behind, so look at all visible candidates and prefer those inside a dialog
    // every field of the open form (also those below the fold: the form can be taller than the screen), scrolled into view when it is used
    const FIELDS = `const sized = (e) => { const r = e.getBoundingClientRect(); return r.width > 18 && r.height > 10 && getComputedStyle(e).visibility !== "hidden"; }; const ok = (e) => sized(e) && !e.disabled && !/^(hidden|checkbox|radio|submit|button|file)$/.test(e.type); const allF = [...document.querySelectorAll("input, textarea, select")].filter(ok); const inM = allF.filter((e) => e.closest(${SEL})); const f = inM.length ? inM : allF;`;
    // a button of the open dialog (its Save button can sit below the fold of a tall form), scrolled into view
    const PICK = (re) => `const re = ${re}; const sized = (e) => { const r = e.getBoundingClientRect(); return r.width > 18 && r.height > 14 && getComputedStyle(e).visibility !== "hidden"; }; const all = [...document.querySelectorAll("button")].filter(sized); const inM = all.filter((b) => b.closest(${SEL})); const pool = inM.length ? inM : all.filter(vis); const hit = [...pool].reverse().find((b) => re.test(b.innerText)) || pool[0]; hit?.scrollIntoView({ block: "center" }); return hit;`;
    const modalOpen = () => guest(`(() => { ${VIS} return [...document.querySelectorAll(${SEL})].some(vis); })()`);
    const SUBMIT = PICK("/(ulo[žz]|ode[šs]|submit|save|přidat|add|vytvo|create)/i");
    const CONFIRM = PICK("/(delete|remove|smazat|odstranit|yes|ano|confirm|potvrdit|ok)/i");
    const rows = () => guest(`document.querySelectorAll("tbody tr, [role=row]").length`);
    await guestClick(BUTTON("/(přidat|nov[ýáé]|vytvo|add|create|new)/i"), 0, { pause: 1300 });
    if (!(await modalOpen())) return;
    await caption(T.cap.form);
    const before = await rows();
    await guestClick(SUBMIT, 0, { pause: 1900 }).catch(() => {});                // an empty form: the validation shows
    // fill every field of the form, one after another (a text value by turns, a number, the first real option of a select)
    const kinds = await guest(`(() => { ${VIS} ${FIELDS} return f.map((e) => (e.tagName === "SELECT" ? "select" : e.type === "number" ? "number" : "text")); })()`);
    let t = 0;
    for (let i = 0; i < (kinds ?? []).length; i++) {
      const p = await guestPoint(`${FIELDS} f[${i}]?.scrollIntoView({ block: "center" }); return f[${i}];`).catch(() => null); if (!p) continue;
      await clickAt(p.x, p.y, { pause: 250, ms: 450 });
      await guest(`document.activeElement?.select?.()`).catch(() => {});                       // a prefilled value is replaced, not extended
      if (kinds[i] === "select") await guest(`(() => { const s = document.activeElement; if (!s || s.tagName !== "SELECT") return; const o = [...s.options].find((x) => x.value && !x.disabled) || s.options[0]; s.value = o.value; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
      else await guestTypeActive(kinds[i] === "number" ? T.number : t === 0 ? T.typed : T.values[(t - 1) % T.values.length], 55), t += kinds[i] === "text" ? 1 : 0;
      await sleep(250);
    }
    await sleep(500);
    await guestClick(SUBMIT, 0, { pause: 1800 }).catch(() => {});                  // submit: the record is added to the table
    // the form must not stay open on the screen (the inspector would probe the page behind it): close it by its own button, then Escape inside the page
    if (await modalOpen()) await guestClick(PICK("/(cancel|close|zav[řr]|zru[šs]|storno|×|✕)/i"), 0, { pause: 700 }).catch(() => {});
    if (await modalOpen()) { await guest(`document.activeElement?.blur?.(); for (const t of ["keydown", "keyup"]) document.dispatchEvent(new KeyboardEvent(t, { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }))`).catch(() => {}); await sleep(700); }
    if (await modalOpen()) log("  ! the form is still open");
    // show the new record: scroll the page to it, so the viewer sees it was really added
    await guest(`(() => { const e = [...document.querySelectorAll("body *")].find((n) => !n.children.length && n.textContent.includes(${JSON.stringify(T.typed)}) && n.getBoundingClientRect().width > 0); e?.scrollIntoView({ block: "center", behavior: "smooth" }); })()`).catch(() => {});
    await sleep(2200);
    log(`  rows: ${before} -> ${await rows()}`);
    await guest(`window.scrollTo({ top: 0, behavior: "smooth" })`).catch(() => {}); await sleep(900);
    log(`  new record visible: ${await guest(`document.body.innerText.includes(${JSON.stringify(T.typed)})`).catch(() => false)}`);
    await sleep(1200);
    // delete the new record: its trash button, then the confirmation
    // the trash button of the new row. uu5 rows can be `display: contents` (no size), so find the icon-only delete buttons and use the row only to tell them apart
    const TRASH = `const re = /(delete|remove|trash|smazat|odstranit)/i; const btns = [...document.querySelectorAll("button, [role=button]")].filter((b) => !b.innerText.trim() && re.test((b.getAttribute("aria-label") || "") + (b.title || "") + b.className + b.innerHTML.slice(0, 600))); const mine = btns.filter((b) => b.closest("tr, [role=row]")?.innerText.includes(${JSON.stringify(T.typed)})); const pick = mine[mine.length - 1]; /* only the trash button of the record that was just added: nothing else on the page is clicked */`;
    const hasTrash = await guest(`(() => { ${TRASH} return Boolean(pick); })()`).catch(() => false);   // a page without such a row (no trash buttons) skips the deletion
    if (hasTrash) { await caption(T.cap.del); await guest(`(() => { ${TRASH} pick?.scrollIntoView({ block: "center" }); })()`); await sleep(600); }
    if (hasTrash) await guestClick(`${TRASH.replace('const btns = [...document.querySelectorAll("button, [role=button]")]', 'const btns = [...document.querySelectorAll("button, [role=button]")].filter(vis)')} return pick;`, 0, { pause: 1500 }).catch(() => {});
    if (hasTrash) await guestClick(CONFIRM, 0, { pause: 1600 }).catch(() => {});
    log(`  rows after delete: ${await rows()}`);
    await sleep(900);
    await caption("", 200);
  }],
  ["rules", async () => {
    await caption(T.cap.rules);
    await waitFor(async () => (await badgeCount()) > 0, { timeout: 4000 }); await sleep(1800);   // the toast "Business rules updated" and the badge on the icon
    await click("#rulesbtn"); await sleep(600);
    if (!(await exists("#rules .rc-item"))) {                                                    // the agent did not write any rule: add two by hand
      for (const r of opts.lang === "en" ? ["A room code is unique", "Capacity is at least 1"] : ["Kód místnosti je unikátní", "Kapacita je alespoň 1"]) { await typeInto("#rules .rc-new", r, 22); await key("Enter", "Enter", 13); await sleep(700); }
    }
    await sleep(1400);
    await caption(T.cap.rulesEdit);
    await click("#rules .rc-text"); await key("End", "End", 35); await typeText(T.ruleEdit, 30); await key("Enter", "Enter", 13); await sleep(1200);
    await click("#rules .rc-toggle"); await sleep(2400);                                         // code view: the Markdown file
    await click("#rules .rc-toggle"); await sleep(1200);
    await click("#rules .rc-close"); await sleep(700);
    await caption("", 200);
  }],
  ["screen description and rule", async () => {
    await caption(T.cap.screen);
    if (!(await exists(".frame.sel"))) await guestClick(`return document.querySelector("body")`, 0, { pause: 600 });
    await click("#morebtn"); await click("#ctxmenu button", { text: "Description" }); await sleep(600);
    await typeText(T.screenDesc, 24); await sleep(800);
    await click("#descdlg .dd-close"); await sleep(900);
    await click("#fit"); await sleep(900);                                                       // the description now sits below the screen: keep it clear of the caption
    const cv = (await centre("#canvas")) ?? { x: 900, y: 500 }; await wheelAt(cv.x, cv.y, 70, 0); await sleep(1800);
    await caption("", 200);
  }],
  ["second screen", async () => {
    await caption(T.cap.second);
    const [before, after] = T.prompt2.split("@");
    await click("#prompt"); await typeText(before, 14);
    await typeText("@", 100); await sleep(700);                                                  // the mention list: screens of the project (and files of the repository)
    if (await centre("#mentions button")) await click("#mentions button"); else await typeText("@", 50);
    await typeText((await cdp.ev(`document.getElementById("prompt").value`)).endsWith(" ") ? after.trimStart() : after, 14); await sleep(500);
    await submitAndWait(1);
    await caption(T.cap.arrange); await cdp.ev(`__menuAction("view:arrange")`); await sleep(2400);
  }],
  ["fullscreen and note", async () => {
    await caption(T.cap.fullscreen);
    await click("#fit"); await sleep(600);
    await guestClick(`return document.querySelector("body")`, 0, { pause: 600 });                // select a screen
    if (!(await exists(".frame.sel .fexp"))) throw new Error("no screen selected");
    const c = await centre(".frame.sel .fexp");
    if (c) await clickAt(c.x, c.y); else await cdp.ev(`document.querySelector(".frame.sel .fexp").click()`);
    await sleep(2400);
    await click("#fsnotebtn"); await sleep(700);                                                  // a sticky note for this screen, the cursor is in it
    await typeText(T.note, 26); await sleep(1600);
    await click("#fsclose"); await sleep(1400);                                                   // Esc does not leave fullscreen: the shrink button does
    if (await cdp.ev(`!document.getElementById("fs").hidden`)) throw new Error("fullscreen did not close");
    await click("#fit"); await sleep(1500);                                                       // all screens and the note beside this one, clear of the floating chat
    await caption(T.cap.note); await sleep(2600);                                                 // the note now sits beside the screen on the canvas
    await caption("", 200);
  }],
  ["inspector", async () => {
    await caption(T.cap.inspect);
    // the screen with the "Add" button (the list, not the detail): the order of the screens in the page is alphabetical, so look for it
    const ADD = "/(přidat|nov[ýáé]|vytvo|add|create|new)/i";
    const SEE = `const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 18 && r.height > 14 && r.top >= 0 && r.top < innerHeight - 30 && r.left >= 0 && r.left < innerWidth - 10 && getComputedStyle(e).visibility !== "hidden"; };`;
    const count = await cdp.ev(`document.querySelectorAll("webview").length`);
    let fi = 0;
    for (let i = 0; i < count; i++) { if (await guest(`(() => { ${SEE} return [...document.querySelectorAll("button")].filter(vis).some((b) => ${ADD}.test(b.innerText)); })()`, i).catch(() => false)) { fi = i; break; } }
    const first = await cdp.ev(`document.querySelectorAll(".frame .fname")[${fi}]?.textContent ?? ""`);
    await click("#inspect"); await sleep(900);
    await click("#tabs .tab", { text: `^${first}$` }); await sleep(1300);                          // its tab zooms into it, inside the canvas the panel left free
    await guest(`window.scrollTo(0, 0)`, fi).catch(() => {}); await sleep(300);
    // the form is closed: with the inspector on, a click marks the "Add" button instead of pressing it
    await guestClick(BUTTON(ADD), fi, { pause: 1300, ms: 650 });
    const names = await cdp.ev(`[...document.querySelectorAll("#insp-props .prow .pname")].map((n) => n.textContent)`);
    if (!(names.includes("colorScheme") && names.includes("icon"))) throw new Error(`the marked button has no colorScheme and icon (${names.join(", ")}) — ask for a button with both in the prompt`);
    await sleep(1400);
    const row = (name) => cdp.ev(`(() => { const r = [...document.querySelectorAll("#insp-props .prow")].find((x) => x.querySelector(".pname")?.textContent === ${JSON.stringify(name)}); const e = r?.querySelector("select, input"); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await caption(T.cap.color);
    const cs = await row("colorScheme");
    if (cs) {
      await moveTo(cs.x, cs.y);
      for (const v of ["red", "green", "blue"]) {
        await cdp.ev(`(() => { const r = [...document.querySelectorAll("#insp-props .prow")].find((x) => x.querySelector(".pname")?.textContent === "colorScheme"); const s = r.querySelector("select"); if (!s) return; s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
        await sleep(1900);
      }
    }
    await caption(T.cap.icon);
    await click("#insp-props .pico"); await sleep(1300);
    await typeInto("#ib-search", "calendar", 110); await sleep(1000);
    // the icon in use is always listed first (and marked): pick another one, or the click would change nothing
    const was = await cdp.ev(`document.querySelector("#ib-grid .ib-icon.on")?.title?.split("\\n")[0] ?? null`);
    const picked = await cdp.ev(`document.querySelector("#ib-grid .ib-icon:not(.on)")?.title?.split("\\n")[0] ?? null`);
    if (!picked) throw new Error("the icon dialog shows no other icon");
    await click("#ib-grid .ib-icon:not(.on)", { pause: 2200 });
    log(`  icon: ${was} -> ${picked}`);
    await caption("", 300);
    await click("#inspect"); await sleep(600);                                                   // leave the inspector
  }],
  ["share", async () => {
    await caption(T.cap.share);
    if (!(await exists(".frame.sel"))) await guestClick(`return document.querySelector("body")`, 0, { pause: 600 });
    await click('#selbar [data-menu="share"]'); await sleep(2800);                              // image, HTML file, the whole project as ZIP
    await cdp.ev(`document.body.click()`); await sleep(400);
  }],
  ["plugins", async () => {
    await caption(T.cap.plugins);
    // the account e-mail is shown in a neutral form: the video must not carry the real address of whoever records it
    const hideEmail = () => cdp.ev(`(() => { for (const el of document.querySelectorAll("#setup-text, #setup-steps *")) for (const n of el.childNodes) if (n.nodeType === 3) n.textContent = n.textContent.replace(/[\\w.+-]+@[\\w.-]+\\.\\w+/g, "you@university.example"); })()`);
    await cdp.ev(`__menuAction("claude:setup")`); await sleep(500); await hideEmail(); await sleep(1700);  // Claude Code, sign-in and plugins at a glance
    if (await centre("#setup-updates")) { await sleep(1200); await click("#setup-updates"); await hideEmail(); await caption("", 0); await sleep(2800); }  // the caption steps aside for the toast  // "Plugins are up to date" (or the update strip)
    if (await centre("#setup-close")) await click("#setup-close");
    await sleep(500);
  }],
  ["updates", async () => {
    await caption(T.cap.update);
    await cdp.ev(`__menuAction("update:check")`); await sleep(1800);       // the app asks the release feed: a newer version
    await waitFor(async () => exists("#appupdate:not([hidden])"), { timeout: 8000 }); await sleep(3200); // the strip: Download, Notes, Later
  }],
  ["glass showcase", async () => {
    await caption(T.cap.glass2);
    const c = (await centre("#canvas")) ?? { x: 900, y: 500 }; await moveTo(c.x, c.y, 500);
    for (let i = 0; i < 14; i++) { await wheelAt(c.x, c.y, 18, 0); await sleep(60); }              // the screen passes under the floating toolbar
    await sleep(2600);
  }],
  ["outro", async () => { await caption(T.cap.outro, 3500); await caption("", 300); }],
];

// ---------------------------------------------------------------- main
async function main() {
  log(`recording ${opts.prepared ? "(rehearsal with prepared screens)" : "(live, Claude generates the screens)"} -> ${opts.out}`);
  await launch();
  await cdp.ev(OVERLAY);
  // rehearsal: the Send button works visually, but the message is swallowed (nothing is sent to Claude, no tokens are used); the prompt and the attached sketch are released as a real send would
  if (opts.prepared) await cdp.ev(`addEventListener("submit", (e) => { if (e.target.id !== "form") return; e.preventDefault(); e.stopImmediatePropagation(); const p = document.getElementById("prompt"); p.value = ""; p.dispatchEvent(new Event("input", { bubbles: true })); document.querySelectorAll("#attachments button").forEach((b) => b.click()); /* a real send releases the attachments too */ }, true)`);
  await startRecording();
  await sleep(1200);
  for (const [name, fn] of steps) {
    log("step:", name, `(video ${(now() / 1000).toFixed(0)} s)`);
    try { await fn(); } catch (e) { log(`  ! ${name} skipped: ${e.message}`); await cdp.ev(`window.__demo?.caption("")`).catch(() => {}); await escape().catch(() => {}); }
  }
  await sleep(800);
  const end = now();
  await cdp.send("Page.stopScreencast").catch(() => {});
  recording = false;
  cdp.close(); app.kill(); apiServer?.close();
  log(`captured ${frames.length} frames, ${(end / 1000).toFixed(0)} s of recording`);
  if (!frames.length) throw new Error("No frames were captured.");
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  const manifest = path.join(work, "manifest.json");
  fs.writeFileSync(manifest, JSON.stringify({ width: size.width, height: size.height, fps: 30, end, frames, segments }));
  await new Promise((resolve, reject) => spawn("npx", ["electron", path.join(here, "encode.mjs"), manifest, opts.out], { cwd: repo, stdio: "inherit" }).on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`encoder exited with ${c}`)))));
  if (!opts.keep) fs.rmSync(work, { recursive: true, force: true }); else log(`frames kept in ${work}`);
  log("done:", opts.out);
}
main().catch((e) => { console.error(e); try { app?.kill(); } catch {} process.exit(1); });
