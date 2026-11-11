/**
 * Settings > Integrations > Picture generation: the switch for the agent's generate_image tool and the OpenAI API key it needs.
 * The key is typed here once; the app keeps it encrypted by the operating system and never shows it again (only
 * "a key is stored"). With the switch off the agent is told so and uses SVG or placeholders.
 */
import { addDialogClose } from "./dialogChrome.js";

export function createImageGenDialog({ toast }) {
  const box = document.createElement("div");
  box.id = "imgenbox"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="ig-title">
    <h2 id="ig-title">Picture generation</h2>
    <p class="ig-text">The agent can create a picture for a design (a hero image, an illustration, a background) with the OpenAI image model and save it into the <b>assets</b> folder of the project. It is for pictures only; icons and simple graphics are drawn without it.</p>
    <p class="ig-warn"><b>What leaves your computer:</b> the description of the picture the agent writes goes to OpenAI. Every picture is paid by the OpenAI account of the key (cents per picture); at most 4 pictures are made for one message and the same description is never paid twice.</p>
    <label class="ig-switch"><input type="checkbox" id="ig-on"> Allow the agent to generate pictures</label>
    <label class="ig-field">OpenAI API key<input type="password" id="ig-key" autocomplete="off" spellcheck="false" placeholder="sk-…"></label>
    <label class="ig-field">Model<input type="text" id="ig-model" autocomplete="off" spellcheck="false" list="ig-models"><datalist id="ig-models"><option value="gpt-image-2"><option value="gpt-image-1.5"><option value="gpt-image-1-mini"></datalist></label>
    <p class="ig-hint" id="ig-hint"></p>
    <p class="ig-state" id="ig-state" role="status"></p>
    <div class="row"><button type="button" id="ig-clear">Remove stored key</button><span class="grow"></span><button type="button" id="ig-save" class="primary">Save</button></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  const close = () => { q("#ig-key").value = ""; box.hidden = true; };
  addDialogClose(q(".card"), close);
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  function show(s) {
    q("#ig-on").checked = Boolean(s.enabled);
    q("#ig-clear").hidden = s.source !== "app";
    q("#ig-key").placeholder = s.source === "app" ? "A key is stored (type a new one to replace it)" : "sk-…";
    q("#ig-state").textContent = s.source === "env" ? "A key from the OPENAI_API_KEY environment variable is used." : s.hasKey ? "" : s.canStore ? "No key yet: the agent cannot generate pictures until you enter one." : "This computer cannot encrypt the key, so it cannot be stored here. Set the OPENAI_API_KEY environment variable and restart the app.";
    q("#ig-key").disabled = !s.canStore;
    q("#ig-model").value = s.model || ""; q("#ig-model").placeholder = s.defaultModel;
    q("#ig-hint").textContent = `Empty means ${s.defaultModel}. If OpenAI says the model does not exist, your key does not have it: type another name (the models your key can use are listed in your OpenAI account).`;
  }
  const apply = async (p) => { const r = await p; if (r?.error) { toast(r.error, { err: true }); return null; } show(r); return r; };

  q("#ig-save").onclick = async () => {
    const r = await apply(window.studio.imageGenSave(q("#ig-on").checked, q("#ig-key").value, q("#ig-model").value));
    if (!r) return;
    q("#ig-key").value = "";
    toast(r.enabled && r.hasKey ? "Picture generation is on." : r.enabled ? "Switched on, but there is no key yet." : "Picture generation is off.");
    if (r.enabled === q("#ig-on").checked && (r.hasKey || !r.enabled)) close();
  };
  q("#ig-clear").onclick = async () => { if (await apply(window.studio.imageGenClearKey())) toast("The key was removed."); };

  return {
    async open() {
      const r = await apply(window.studio.imageGenStatus());
      if (!r) return;
      box.hidden = false; q("#ig-key").value = ""; q(r.canStore ? "#ig-key" : "#ig-on").focus();
    },
    isOpen: () => !box.hidden,
  };
}
