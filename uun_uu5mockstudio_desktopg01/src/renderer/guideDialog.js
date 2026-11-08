/**
 * "Guide me…": four short steps (what, for whom, what on it, what you already have) that end in a request put into the
 * message field of the dashboard (nothing is sent: the user reads it and presses Enter). Esc and Cancel close it.
 */
import { GUIDE_TYPES, GUIDE_TYPE_IDS, GUIDE_TONES, GUIDE_LANGS } from "./guide.js";

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? "", textContent: text ?? "" });

export function createGuideDialog({ onDone }) {
  const box = el("div"); box.id = "guidebox"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="gd-title">
    <div class="gd-step mute"></div><h2 id="gd-title"></h2><p class="gd-text"></p><div class="gd-body"></div>
    <div class="gd-dots" aria-hidden="true"></div>
    <div class="row"><button class="gd-cancel" type="button">Cancel</button><span class="grow"></span><button class="gd-back" type="button">Back</button><button class="gd-next" type="button">Next</button></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  const lang = (navigator.language ?? "en").toLowerCase().startsWith("cs") ? "cs" : "en";
  let i = 0, a;
  const fresh = () => ({ type: "page", audience: "", action: "", sections: [], extra: "", content: "", tone: "friendly", lang });

  const STEPS = [
    { title: "What do you need?", text: "Pick what is closest. You can change everything later in the chat.", build(body) {
      body.append(...GUIDE_TYPE_IDS.map((id) => {
        const t = GUIDE_TYPES[id], b = el("button", `gd-opt${a.type === id ? " on" : ""}`); b.type = "button";
        b.append(el("b", "", t.label), el("small", "", t.hint));
        b.onclick = () => { a.type = id; a.sections = []; show(i); };
        return b;
      }));
    } },
    { title: "Who is it for, and what should they do?", text: "A sentence each is enough. Leave a field empty if you are not sure.", build(body) {
      body.append(field("Who will read it?", "input", "audience", "e.g. new students and their parents"), field("What should they do on it?", "input", "action", "e.g. apply, call us, find a document"));
    } },
    { title: "What should be on it?", text: "Tick what you want. The agent adds what is missing.", build(body) {
      const t = GUIDE_TYPES[a.type], list = el("div", "gd-checks");
      for (const s of t.sections) {
        const l = el("label", "gd-check"), c = el("input"); c.type = "checkbox"; c.checked = a.sections.includes(s);
        c.onchange = () => { a.sections = c.checked ? [...a.sections, s] : a.sections.filter((x) => x !== s); };
        l.append(c, el("span", "", s)); list.append(l);
      }
      body.append(list, field("Anything else?", "input", "extra", "e.g. a map, a price list"));
    } },
    { title: "Do you already have the content?", text: "Paste text, a list, or a link to a page you want to start from (a uuBookKit page, a document, any web page). Leave it empty and the agent writes realistic sample text.", build(body) {
      const ta = field("Your text or link", "textarea", "content", "Paste here…");
      const tone = select("Tone", "tone", GUIDE_TONES), lg = select("Language", "lang", GUIDE_LANGS), row = el("div", "gd-row2");
      row.append(tone, lg); body.append(ta, row);
    } },
  ];

  function field(label, kind, key, ph) {
    const w = el("label", "gd-field"), f = el(kind); w.append(el("span", "", label), f);
    f.value = key === "extra" ? a.extra : a[key] ?? ""; f.placeholder = ph; if (kind === "textarea") f.rows = 6;
    f.oninput = () => { a[key] = f.value; };
    return w;
  }
  function select(label, key, options) {
    const w = el("label", "gd-field"), s = el("select"); w.append(el("span", "", label), s);
    for (const [v, text] of Object.entries(options)) s.append(Object.assign(el("option"), { value: v, textContent: text }));
    s.value = a[key]; s.onchange = () => { a[key] = s.value; };
    return w;
  }
  function show(n) {
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    const s = STEPS[i], body = q(".gd-body");
    q(".gd-step").textContent = `Step ${i + 1} of ${STEPS.length}`; q("#gd-title").textContent = s.title; q(".gd-text").textContent = s.text;
    body.replaceChildren(); s.build(body);
    q(".gd-dots").innerHTML = STEPS.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    q(".gd-back").hidden = i === 0; q(".gd-next").textContent = i === STEPS.length - 1 ? "Write the request" : "Next";
  }
  function close() { box.hidden = true; }
  function finish() {
    const answers = { ...a, sections: [...a.sections, ...(a.extra.trim() ? [a.extra.trim()] : [])] };
    close(); onDone?.(answers);
  }
  q(".gd-cancel").onclick = close;
  q(".gd-back").onclick = () => show(i - 1);
  q(".gd-next").onclick = () => (i === STEPS.length - 1 ? finish() : show(i + 1));
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  return { open() { a = fresh(); show(0); box.hidden = false; q(".gd-opt")?.focus(); }, isOpen: () => !box.hidden };
}
