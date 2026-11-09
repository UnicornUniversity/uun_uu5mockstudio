/** "Variants…": how many and what should differ. The request itself is built by variants.js. */
import { addDialogClose } from "./dialogChrome.js";
import { VARIANT_ASPECTS, VARIANT_COUNTS } from "./variants.js";
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? "", textContent: text ?? "" });

export function createVariantsDialog({ onDone }) {
  const box = el("div"); box.id = "varbox"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="vr-title">
    <h2 id="vr-title"></h2><p class="vr-text mute">The agent writes the variants as new screens next to the original (which stays as it is). Compare them side by side, keep the best and delete the rest.</p>
    <div class="vr-label">How many?</div><div class="vr-counts" role="radiogroup" aria-label="How many"></div>
    <div class="vr-label">What should differ?</div><div class="vr-aspects" role="radiogroup" aria-label="What should differ"></div>
    <input class="vr-custom" placeholder="e.g. one with a left menu, one with tabs" aria-label="What should differ" hidden>
    <div class="row"><button class="vr-cancel" type="button">Cancel</button><span class="grow"></span><button class="vr-go" type="button">Make variants</button></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  let file = "", count = 3, aspect = "layout";
  const paint = () => {
    q(".vr-counts").replaceChildren(...VARIANT_COUNTS.map((n) => { const b = el("button", `vr-opt${n === count ? " on" : ""}`, String(n)); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(n === count)); b.onclick = () => { count = n; paint(); }; return b; }));
    q(".vr-aspects").replaceChildren(...Object.entries(VARIANT_ASPECTS).map(([id, a]) => { const b = el("button", `vr-aspect${id === aspect ? " on" : ""}`); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(id === aspect)); b.append(el("b", "", a.label), el("small", "", a.hint)); b.onclick = () => { aspect = id; paint(); }; return b; }));
    q(".vr-custom").hidden = aspect !== "custom";
  };
  const close = () => { box.hidden = true; };
  q(".vr-cancel").onclick = close;
  addDialogClose(q(".card"), close);
  q(".vr-go").onclick = () => { const c = q(".vr-custom").value; if (aspect === "custom" && !c.trim()) return q(".vr-custom").focus(); close(); onDone?.({ file, count, aspect, custom: c }); };
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  return { open(f) { file = f; q("#vr-title").textContent = `Variants of ${f.replace(/\.html$/, "")}`; paint(); box.hidden = false; q(".vr-go").focus(); }, isOpen: () => !box.hidden };
}
