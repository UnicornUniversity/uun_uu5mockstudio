/**
 * Roles: who the user is decides the starting point (the level of templates, Eco, Plan, the format of Share) and how much of the
 * technical side is shown. A role only presets things: it is applied once when it is chosen, later manual choices stay (they live in
 * localStorage under their own keys). Pure data, used by the renderer, by the main process (the sentence for the agent) and by the tests.
 */
export const ROLE_IDS = ["uiux", "mkt", "architect", "other"];
export const DEFAULT_ROLE = "other"; // what "Skip" chooses: the simplest view

export const ROLES = {
  uiux: {
    label: "UI/UX designer",
    hint: "Applications, routes, components, web sites and portals: screens, states and flows",
    level: "route", plan: false, eco: false, simple: false, share: "png",
    ideas: "forms, lists, detail and dashboards",
    prompt: "The user is a UI/UX designer who designs anything from a component to a whole application, a web site or a portal, and knows the uu5 components well. Keep answers short and visual: say what changed on the screen, not how the code works. Prefer showing the states of a screen (empty, loading, error, no permission) when they matter.",
  },
  mkt: {
    label: "Web and marketing",
    hint: "Landing pages, product pages, articles, campaigns",
    level: "web", plan: false, eco: true, simple: true, share: "html",
    ideas: "home page, landing page, web page",
    prompt: "The user works in marketing and designs web pages. Write finished, readable content (headings, benefits, calls to action) instead of placeholder text. Do not use technical terms (component, prop, uu5String) in your answers; describe the page in plain words.",
  },
  architect: {
    label: "Solution architect",
    hint: "Structure of an application, routes and components before they are built",
    level: "component", plan: false, eco: false, simple: false, share: "zip",
    ideas: "applications, routes and components",
    prompt: "The user is a software designer or solution architect. Name components exactly, mention the business rules a screen implies and ask the decisions that matter before building a large change; they may want a plan for it.",
  },
  other: {
    label: "Quick start",
    hint: "I need a page or a portal fast, without design or technical details",
    level: "page", plan: false, eco: true, simple: true, share: "png",
    ideas: "a portal, a home page, a team page",
    prompt: "The user wants a result quickly and may not know design or technical terms, for example a portal of their team or organisational unit. Use plain language without technical terms, pick sensible defaults and ask at most one short question when something essential is missing. Offer one next step at the end of your answer.",
  },
};

export const isRole = (r) => ROLE_IDS.includes(r);
export const roleOf = (r) => ROLES[isRole(r) ? r : DEFAULT_ROLE];

/** The sentence about the user that goes to the agent ("" when no role is known). */
export const rolePrompt = (r) => (isRole(r) ? ROLES[r].prompt : "");

/** For Plan: the architect plans big levels first (Application, Route), a component directly. */
export const planFirst = (r, level) => r === "architect" && (level === "app" || level === "route");

/** The tour texts that differ by role: the simple roles do not need tokens, context and the model. */
export const TOUR_TEXT = {
  economy: {
    simple: "Under each answer the agent says what it did. If a conversation gets very long, a bar offers a fresh one: your screens and notes stay. Eco (the leaf under the message box) keeps the agent brief and makes only the change you asked for; it is on for you, switch it off when you want a bigger redesign. Tokens, the model and Plan are under Advanced.",
  },
  inspector: {
    simple: "Switch on the inspector (the crosshair) and click any part of the page to change its text, colour or icon without writing anything. Shift-click marks several parts to talk about them together in the chat.",
  },
};
