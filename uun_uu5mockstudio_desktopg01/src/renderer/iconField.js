import { iconGlyph, isBmlCode } from "./iconPicker.js";

/** The icon of the button that opens the icon catalog: the same one wherever an icon is chosen. */
export const ICON_PICK_SVG = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/></svg>`; // "choose from a catalog of shapes" (the old square glyph looked like a Stop button);

/**
 * The control of an icon prop, the same in the inspector and in the dialog of the actions: the icon itself (when its font is loaded), the
 * name (empty when there is none: nothing is suggested), and the button that opens the catalog.
 * `o` = { value, glyphs, title, onText(string) (the name typed), onPick(): Promise<string|null> }.
 */
export function iconField({ value, glyphs, title = "Choose an icon (uuGDS or uuBml)", onText, onPick }) {
  const cur = value ? String(value) : "";
  const input = Object.assign(document.createElement("input"), { type: "text", value: cur, spellcheck: false, autocomplete: "off" });
  input.onchange = () => onText(input.value.trim());
  input.onkeydown = (e) => { if (e.key === "Enter") input.blur(); };
  const btn = Object.assign(document.createElement("button"), { type: "button", className: "pedit pico", title, innerHTML: ICON_PICK_SVG, onclick: async () => { const v = await onPick(); if (v) onText(v); } });
  const row = Object.assign(document.createElement("div"), { className: "pcode" });
  if (cur && (glyphs || isBmlCode(cur))) row.append(iconGlyph(cur));
  row.append(input, btn);
  return { row, input };
}
