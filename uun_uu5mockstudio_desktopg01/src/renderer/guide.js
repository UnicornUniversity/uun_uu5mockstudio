/**
 * "Guide me": a few questions that turn into one good request for the agent, for people who do not know how to describe a page
 * (a portal of their unit, a home page, a landing page, a web page) and for those who already have the content (text, a list, a link).
 * Pure data and a pure function; the dialog is guideDialog.js.
 */
export const GUIDE_TYPES = {
  portal: {
    label: "A portal of my team or unit", short: "Portal", template: "page-portal", level: "page",
    hint: "A hub with links to applications and documents, news and contacts",
    sections: ["News", "Applications and documents", "Contacts", "Calendar of events", "Useful links"],
  },
  home: {
    label: "The home page of a web site", short: "Home page", template: "web-home", level: "web",
    hint: "The front page: what you offer and where to go next",
    sections: ["What we offer", "Why choose us", "A reference or testimonial", "News", "Contact"],
  },
  landing: {
    label: "A landing page for one offer", short: "Landing page", template: "web-landing", level: "web",
    hint: "One offer and one action: sign up, order, ask",
    sections: ["Benefits", "How it works", "Pricing", "Questions and answers", "A reference or testimonial", "Sign-up form"],
  },
  page: {
    label: "A page of a web site", short: "Web page", template: "web-page", level: "web",
    hint: "A standard content page: a topic in a few sections",
    sections: ["Introduction", "Text in sections", "Photos", "Documents to download", "A contact person", "Related links"],
  },
};
export const GUIDE_TYPE_IDS = Object.keys(GUIDE_TYPES);
export const GUIDE_TONES = { friendly: "friendly and plain", formal: "formal and precise", lively: "lively and persuasive" };
export const GUIDE_LANGS = { cs: "Czech", en: "English" };

const clean = (s) => String(s ?? "").replace(/\s+\n/g, "\n").trim();

/** The request for the agent from the answers: { type, audience, action, sections: [], content, tone, lang }. */
export function buildGuidePrompt(a = {}) {
  const t = GUIDE_TYPES[a.type] ?? GUIDE_TYPES.page;
  const sections = (a.sections ?? []).map((x) => String(x).trim()).filter(Boolean);
  const parts = [`Create ${t.label[0].toLowerCase()}${t.label.slice(1)}.`];
  if (clean(a.audience)) parts.push(`It is for: ${clean(a.audience)}.`);
  if (clean(a.action)) parts.push(`What a visitor should do on it: ${clean(a.action)}.`);
  if (sections.length) parts.push(`It should have these parts: ${sections.join(", ")}.`);
  parts.push(`Write in a ${GUIDE_TONES[a.tone] ?? GUIDE_TONES.friendly} tone, in ${GUIDE_LANGS[a.lang] ?? GUIDE_LANGS.cs}.`);
  const head = parts.join(" ");
  if (clean(a.content)) return `${head}\n\nUse this content as it is and do not invent facts that are not in it (write short, realistic text only where something is missing, and tell me in one sentence what to check):\n\n${clean(a.content)}`;
  return `${head} There is no content yet: write realistic sample content and tell me in one sentence what to replace.`;
}

/** The first question's answer chooses the template of the dashboard. */
export const guideTemplate = (type) => ({ template: (GUIDE_TYPES[type] ?? GUIDE_TYPES.page).template, level: (GUIDE_TYPES[type] ?? GUIDE_TYPES.page).level });
