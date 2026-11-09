/**
 * One look for closing a dialog: a cross at the right end of the header, the same in every dialog (Esc and a click on the
 * background close it too). A button in the footer is only for a real choice ("Cancel" next to the action it cancels), never a
 * second way to close.
 */
const CROSS = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;

/** The cross button; `onClick` closes the dialog. */
export function closeButton(onClick) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "dlg-x icon"; b.title = "Close (Esc)"; b.setAttribute("aria-label", "Close"); b.innerHTML = CROSS;
  b.onclick = onClick;
  return b;
}

/**
 * Puts the cross into the header of `card` (the dialog's first <h2> is the header; it is wrapped in `.dlg-head` when it is not yet);
 * when something stands above the title it sits in the top right corner of the card instead.
 * Does nothing when the dialog already has one.
 */
export function addDialogClose(card, onClick) {
  if (!card || card.querySelector(".dlg-x")) return;
  const h2 = card.querySelector("h2");
  if (!h2) return;
  if (card.firstElementChild !== h2 && !h2.parentElement.classList.contains("dlg-head")) { card.append(closeButton(onClick)); card.querySelector(":scope > .dlg-x").classList.add("corner"); return; } // something stands above the title (a step, a picture): the cross goes to the corner of the card
  let head = h2.parentElement;
  if (!head.classList.contains("dlg-head")) {
    head = document.createElement("div"); head.className = "dlg-head";
    h2.replaceWith(head); head.append(h2);
  }
  head.append(closeButton(onClick));
}
