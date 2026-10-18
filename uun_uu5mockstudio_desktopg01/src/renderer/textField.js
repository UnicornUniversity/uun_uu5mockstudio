/**
 * The control of a text that is a literal somewhere in the file – a string, or an LSI with one text per language – however it is reached
 * (`{ cs: "…", en: "…" }`, `t("Ano", "Yes")`, `<T lsi={…} />`, a constant, `ph.title` of useLsi). It always shows the text itself: one input for a
 * string, and for an LSI a switch of the languages above the input of the chosen one. Editing changes the text where it is written.
 * `resolved` = { kind, via, langs: [{ lang, value }] } (as the main process describes it).
 */
let uiLang = null; // the language looked at last: the fields start on it, so that switching once switches the whole form

export function textField({ resolved, runtime, onText, onLang }) {
  const langs = resolved.langs, many = langs.length > 1 || Boolean(langs[0]?.lang);
  const byUi = uiLang == null ? -1 : langs.findIndex((l) => l.lang === uiLang);
  const byRuntime = typeof runtime === "string" ? langs.findIndex((l) => l.value === runtime) : -1;
  const idx = byUi >= 0 ? byUi : byRuntime >= 0 ? byRuntime : 0, cur = langs[idx];
  const box = Object.assign(document.createElement("div"), { className: "tf" });
  if (many) {
    const sw = Object.assign(document.createElement("div"), { className: "tf-langs", role: "tablist" });
    langs.forEach((l, i) => sw.append(Object.assign(document.createElement("button"), { type: "button", className: i === idx ? "on" : "", textContent: l.lang ?? "?", title: `Text for the language ${l.lang}`, onclick: () => { uiLang = l.lang; onLang?.(); } })));
    box.append(sw);
  }
  const input = Object.assign(document.createElement("input"), { type: "text", value: cur.value, spellcheck: false, title: resolved.via ? `${resolved.via}${many ? ` · ${cur.lang}` : ""}: editing changes the text where it is written, every use of it follows.` : "" });
  input.onchange = () => onText(idx, input.value);
  input.onkeydown = (e) => { if (e.key === "Enter") input.blur(); };
  box.append(input);
  if (resolved.via) box.append(Object.assign(document.createElement("span"), { className: "tf-via", textContent: resolved.via, title: input.title }));
  return box;
}
