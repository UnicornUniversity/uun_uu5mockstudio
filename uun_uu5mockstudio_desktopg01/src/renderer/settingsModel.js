/**
 * What the Settings dialog (File/app menu > Settings…, ⌘,) holds, as plain data so it can be tested without a DOM.
 * One place for everything that is set up once and not done to a project: the user, the look, the AI providers, the
 * integrations and the offline cache. A row is one of
 *   { kind: "action", button, action, keepOpen? }   a button that opens a dialog or runs an action
 *   { kind: "choice", key, options: [[value, label]] }   one of a few values
 *   { kind: "toggle", key }                          an on/off switch
 * `value` of a row is filled in by the dialog from the current state (see `rowValue`).
 */

/** `agents`: ids of the AI providers the user can use (null = not known yet, then Claude Code stays: that is where it is set up). */
export function settingsSections({ platform = "darwin", agents = null } = {}) {
  const claude = !agents || !agents.length || agents.includes("claude");
  const codex = Boolean(agents?.includes("codex"));
  const sections = [
    { id: "general", title: "General", rows: [
      { id: "role", title: "Your role", desc: "Sets the starting view, the templates and the first Share format.", kind: "action", button: "Change…", action: "app:role" },
      { id: "folder", title: "Projects folder", desc: "Where the projects are stored on this computer.", kind: "action", button: "Change…", action: "folder:projects-change" },
    ] },
    { id: "appearance", title: "Appearance", rows: [
      { id: "theme", title: "Theme", desc: "Automatic follows the system.", kind: "choice", key: "theme", options: [["auto", "Automatic"], ["light", "Light"], ["dark", "Dark"]] },
      ...(platform === "darwin" ? [{ id: "glass", title: "Glass effect", desc: "A translucent, blurred look of the panels.", kind: "toggle", key: "glass" }] : []),
    ] },
    { id: "ai", title: "AI providers", rows: [
      ...(claude ? [{ id: "claude", title: "Claude Code & Plugins", desc: "What is installed and signed in; installs or repairs it.", kind: "action", button: "Open…", action: "claude:setup" }] : []),
      ...(codex ? [{ id: "codex", title: "Codex & Plugins", desc: "The same for Codex.", kind: "action", button: "Open…", action: "codex:plugins" }] : []),
    ] },
    { id: "integrations", title: "Integrations", rows: [
      { id: "mcp", title: "uuAiChat MCP Server", desc: "Sign-in that lets the agent read Plus4U documents of a territory.", kind: "action", button: "Set up…", action: "docs:territory" },
      { id: "images", title: "Picture generation (OpenAI)", desc: "Lets the agent create pictures for a design. Needs an OpenAI API key; the picture descriptions go to OpenAI.", kind: "action", button: "Set up…", action: "imagegen:open" },
    ] },
    { id: "offline", title: "Offline use", rows: [
      { id: "offline", title: "Offline mode", desc: "Screens load the libraries from the cache only.", kind: "toggle", key: "offline" },
      { id: "warm", title: "Warm up the CDN cache", desc: "Loads the common libraries once, so that they work offline.", kind: "action", button: "Warm up", action: "cdn:warmup", keepOpen: true },
      { id: "clear", title: "Clear the CDN cache", desc: "Empties the cache.", kind: "action", button: "Clear", action: "cdn:clear", keepOpen: true },
    ] },
  ];
  return sections.filter((s) => s.rows.length);
}

/** The short value shown next to a row (the current role, whether picture generation is on). */
export function rowValue(row, state) {
  if (row.id === "role") return state.roleLabel || "not chosen";
  if (row.id === "images") return !state.images ? "" : state.images.enabled && state.images.hasKey ? "on" : state.images.enabled ? "on, no key" : "off";
  return "";
}
