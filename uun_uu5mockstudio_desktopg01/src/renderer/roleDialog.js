/**
 * The dialog "What describes your work best?": four cards, one per role (role.js). Opened before the welcome tour on the first run
 * and from Help > Your Role…. A click chooses the role; Skip (or Esc) on the first run chooses the simplest one.
 */
import { ROLES, ROLE_IDS } from "./role.js";

const ICONS = {
  uiux: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18M8 21h8M12 18v3"/>',
  mkt: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  architect: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  other: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
};

export function createRoleDialog({ onChoose, onSkip }) {
  const box = document.createElement("div");
  box.id = "rolebox"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="rl-title">
    <h2 id="rl-title">What describes your work best?</h2>
    <p class="rl-text">The app starts in the right place for you: the kind of template, how much it shows and what Share offers first. You can change it any time (Help → Your Role…); what you set by hand afterwards stays.</p>
    <div class="rl-cards" role="radiogroup" aria-label="Role">${ROLE_IDS.map((id) => `<button type="button" role="radio" aria-checked="false" data-role="${id}"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg><b>${ROLES[id].label}</b><small>${ROLES[id].hint}</small></button>`).join("")}</div>
    <div class="row"><button class="rl-skip" type="button">Skip</button><span class="grow"></span></div></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  let first = true;

  function close() { box.hidden = true; }
  function skip() { if (box.hidden) return; close(); if (first) onSkip?.(); }
  q(".rl-skip").onclick = skip;
  for (const b of box.querySelectorAll("[data-role]")) b.onclick = () => { close(); onChoose?.(b.dataset.role); };
  box.addEventListener("mousedown", (e) => { if (e.target === box) skip(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); skip(); } });

  return {
    /** `current`: the role chosen before (marks it); on the first run (no role yet) Skip chooses the simplest. */
    open(current) {
      first = !current;
      for (const b of box.querySelectorAll("[data-role]")) b.setAttribute("aria-checked", String(b.dataset.role === current));
      q(".rl-skip").textContent = first ? "Skip" : "Cancel";
      box.hidden = false; (q(`[data-role="${current}"]`) ?? q("[data-role]")).focus();
    },
    isOpen: () => !box.hidden,
  };
}
