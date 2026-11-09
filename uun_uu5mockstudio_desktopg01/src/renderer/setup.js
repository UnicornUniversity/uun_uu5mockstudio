const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n; };
const STATE_MARK = { ok: "✓", disabled: "⚠", outdated: "⚠", missing: "✕" };

/**
 * First-run wizard and plugin updates: Claude Code (install) -> Sign in -> Plugins (install). Opens by itself when something is missing,
 * and any time from the Help menu to see the state. Plugin updates are only ever offered (strip under the chat header), never applied silently.
 */
export function createSetup({ api, toast, isBusy, onStatus }) {
  let status = null, manual = false, dismissed = false, working = false, poll = null, logLines = [], mode = "claude"; // the same dialog shows the state of Claude Code or of Codex
  const box = $("setup");
  const clearPoll = () => { clearInterval(poll); poll = null; };

  const steps = (st) => {
    const claudeOk = st.state !== "missing", loginOk = claudeOk && st.state !== "loggedOut", pluginsOk = loginOk && st.state !== "pluginsMissing";
    return [
      { key: "claude", title: "Claude Code", ok: claudeOk, detail: claudeOk ? `Version ${st.version}` : "Not found on this computer" },
      { key: "login", title: "Sign in", ok: loginOk, detail: loginOk ? (st.email ? `Signed in as ${st.email}` : "Signed in") : claudeOk ? "Not signed in" : "After Claude Code is installed" },
      { key: "plugins", title: "Plugins", ok: pluginsOk, detail: loginOk ? (pluginsOk ? "uu5 plugins are installed" : "Required plugins are missing") : "After signing in" },
    ];
  };

  function paintLog() { const log = $("setup-log"); log.hidden = !logLines.length; log.textContent = logLines.slice(-14).join("\n"); log.scrollTop = log.scrollHeight; }
  function say(msg, err = false) { const m = $("setup-msg"); m.textContent = msg; m.classList.toggle("err", err); }

  async function render() {
    const st = status; if (!st) return;
    const list = steps(st), active = list.find((s) => !s.ok)?.key ?? null;
    $("setup-steps").replaceChildren(...list.map((s) => el("li", { className: `${s.ok ? "done" : s.key === active ? "active" : ""}` },
      el("span", { className: "st", textContent: s.ok ? "✓" : s.key === active ? "●" : "○" }), el("div", {}, el("b", { textContent: s.title }), el("span", { className: "sd", textContent: s.detail })))));
    const plugins = $("setup-plugins"); plugins.hidden = !(st.plugins?.length) || active === "claude" || active === "login";
    plugins.replaceChildren(...(st.plugins ?? []).map((p) => el("li", { className: p.state }, el("span", { className: "pm", textContent: STATE_MARK[p.state] ?? "?" }), `${p.name}`, el("small", { textContent: `${p.kind === "recommended" ? "recommended" : "required"}${p.version ? ` · ${p.version}` : ""}${p.state === "disabled" ? " · disabled" : p.state === "outdated" ? " · update needed" : p.state === "missing" ? " · not installed" : ""}` }))));

    const title = $("setup-title"), text = $("setup-text"), action = $("setup-action"), copy = $("setup-copy"), code = $("setup-code"), link = $("setup-link"), more = $("setup-more");
    code.hidden = true; copy.hidden = true; link.hidden = true; more.hidden = true; action.hidden = false; action.disabled = working; $("setup-cancel").hidden = !working; $("setup-recheck").disabled = working;
    $("setup-close").hidden = !(active && !manual); $("setup-close").textContent = "Continue without chat"; // otherwise the cross closes it $("setup-updates").hidden = Boolean(active) || !manual;
    if (active === "claude") {
      const info = await api.claudeInstallerInfo();
      title.textContent = "Claude Code is needed"; text.textContent = "uu5Mock Studio works through Claude Code installed on this computer, with your own sign-in. Install it here, then continue with signing in.";
      code.hidden = false; code.textContent = info.shown; copy.hidden = false; copy.dataset.text = info.shown; link.hidden = false; link.dataset.href = "https://docs.claude.com/en/docs/claude-code/setup"; link.textContent = "Installation guide";
      action.textContent = working ? "Installing…" : "Install Claude Code";
      if (!working && !logLines.length) say(`Clicking Install runs the official installer from claude.ai: ${info.shown}`);
    } else if (active === "login") {
      title.textContent = "Sign in to Claude"; text.textContent = "Signing in happens in your browser, the same way as in Claude Desktop. uu5Mock Studio never sees your password.";
      more.hidden = false; action.textContent = working ? "Waiting for the browser…" : "Sign in";
      if (!working) say("");
    } else if (active === "plugins") {
      title.textContent = "uu5 plugins are needed"; text.textContent = "The mockups are built with the uu5-mockup and uugds plugins of Claude Code. They come from the uuCodebase plugin marketplace and need access to uuCodebase (an SSH key).";
      action.textContent = working ? "Installing…" : "Install plugins";
      if (!working && !logLines.length) say("");
    } else {
      title.textContent = "Claude Code is ready"; text.textContent = `Claude Code ${st.version} · ${st.email ?? "signed in"}. ${st.plugins?.some((p) => p.state !== "ok") ? "Some recommended plugins are missing." : "All plugins are installed."}`;
      action.hidden = st.plugins?.some((p) => p.state !== "ok") ? false : true; action.textContent = "Install plugins"; if (!working) say("");
    }
    paintLog();
  }

  async function check(refresh = true, { show = false } = {}) {
    status = await api.claudeStatus(refresh);
    onStatus?.(status);
    const needs = status.state !== "ready";
    const codexOk = needs && !show && (await api.agents(refresh).catch(() => [])).some((a) => a.provider === "codex"); // Codex works: Claude Code is not pushed on the user
    if (needs) mode = "claude"; // Claude Code is missing: its wizard takes over
    else if (mode === "codex") return status; // the dialog of Codex stays as it is
    manual = show && !needs ? true : manual && !needs ? manual : false;
    if (show) manual = true;
    box.hidden = (!needs || codexOk || (dismissed && !show)) && !manual; // closed by the user: the wizard does not come back by itself, the chat stays off
    if (!box.hidden) await render();
    if (!needs) { manual = manual && !box.hidden; }
    return status;
  }

  // ----- Codex: the same dialog with its own content (installed, signed in, plugins), opened from Help > Codex & Plugins
  let codexState = null;
  async function renderCodex() {
    const r = codexState; if (!r) return;
    const st = r.status, plugins = r.plugins ?? [], bad = plugins.some((p) => p.state !== "ok");
    const list = [
      { key: "codex", title: "Codex", ok: st.installed, detail: st.installed ? (st.version ? `Version ${st.version}` : "Installed on this computer") : "Not found on this computer" },
      { key: "login", title: "Sign in", ok: st.loggedIn, detail: st.loggedIn ? (st.text || "Signed in") : st.installed ? "Not signed in" : "After Codex is installed" },
      { key: "plugins", title: "Plugins", ok: !bad && st.installed && st.loggedIn, detail: st.loggedIn ? (bad ? "Plugins are missing or outdated" : "uu5 plugins are installed") : "After signing in" },
    ];
    const active = list.find((x) => !x.ok)?.key ?? null;
    $("setup-steps").replaceChildren(...list.map((x) => el("li", { className: x.ok ? "done" : x.key === active ? "active" : "" },
      el("span", { className: "st", textContent: x.ok ? "✓" : x.key === active ? "●" : "○" }), el("div", {}, el("b", { textContent: x.title }), el("span", { className: "sd", textContent: x.detail })))));
    const pl = $("setup-plugins"); pl.hidden = !plugins.length || !st.installed || !st.loggedIn;
    pl.replaceChildren(...plugins.map((p) => el("li", { className: p.state }, el("span", { className: "pm", textContent: STATE_MARK[p.state] ?? "?" }), p.name,
      el("small", { textContent: `${p.kind} · ${p.installed ?? "not installed"}${p.state === "outdated" ? ` → ${p.available}` : ""}` }))));
    for (const id of ["setup-code", "setup-copy", "setup-link", "setup-more", "setup-cancel", "setup-log"]) $(id).hidden = true;
    $("setup-close").hidden = true; $("setup-recheck").disabled = working;
    $("setup-updates").hidden = Boolean(active); $("setup-updates").disabled = working; // like Claude Code: a check that only looks, the answer comes as a message
    const action = $("setup-action"), missing = plugins.some((p) => p.state === "missing");
    action.hidden = !(st.installed && st.loggedIn && bad); action.disabled = working;
    action.textContent = working ? "Installing…" : missing ? "Install plugins" : "Update plugins";
    $("setup-title").textContent = !st.installed ? "Codex is not installed" : !st.loggedIn ? "Sign in to Codex" : bad ? "Codex plugins are needed" : "Codex is ready";
    $("setup-text").textContent = !st.installed ? "uu5Mock Studio can also work through Codex (OpenAI) installed on this computer, with your own sign-in. Install the Codex CLI or the ChatGPT app, then check again."
      : !st.loggedIn ? "Sign in by running `codex login` in a terminal (or in the ChatGPT app), then check again. uu5Mock Studio never sees your password."
      : bad ? "The mockups are built with the uu5-mockup, uugds and uu5-development plugins. They are installed into Codex from the marketplace that the uuAiMarketplace extension keeps in sync; Codex does not update them by itself."
      : `Codex${st.version ? ` ${st.version}` : ""} · ${st.text || "signed in"}. All plugins are installed.`;
  }
  async function loadCodex() {
    codexState = await api.codexPluginsState().catch((e) => ({ status: { installed: false, loggedIn: false, text: String(e?.message ?? e) }, plugins: [] }));
    await renderCodex();
  }
  async function openCodex() {
    mode = "codex"; manual = true; working = false; logLines = []; say("");
    box.hidden = false;
    await loadCodex();
  }
  /** "Check for plugin updates": only looks (the marketplace folder against what Codex has) and says what it found. */
  async function checkCodexUpdates() {
    await loadCodex();
    const ps = codexState.plugins ?? [], outdated = ps.filter((p) => p.state === "outdated").length;
    toast(outdated ? `${outdated} plugin update${outdated > 1 ? "s" : ""} available.` : ps.some((p) => p.state === "missing") ? "Some plugins are not installed yet." : "Plugins are up to date.");
  }
  async function runCodexPlugins() {
    working = true; say("Installing into Codex…"); await renderCodex();
    const r = await api.codexPluginsCheck().catch((e) => ({ error: String(e?.message ?? e) }));
    working = false; say("");
    if (r?.error) say(r.error, true);
    else if (r.failed?.length) say(`${r.failed[0].id.split("@")[0]}: ${r.failed[0].message}`, true);
    else toast("Plugins updated. Codex uses them from your next message.");
    await loadCodex();
  }

  // ----- actions
  async function runInstall() {
    working = true; logLines = []; say("Installing… this can take a minute."); await render();
    const r = await api.claudeInstall();
    working = false;
    if (r?.ok) { logLines = []; say("Claude Code is installed."); }
    else say(r?.error ? `The installer could not be started: ${r.error}` : `The installer failed (exit ${r?.code}). Last output is shown above; you can also run the command in a terminal.`, true);
    await check(true);
  }
  async function runLogin() {
    const method = box.querySelector('input[name="setup-method"]:checked')?.value ?? "claudeai", email = $("setup-email").value.trim();
    working = true; say("Finish signing in in your browser…"); await render();
    clearPoll(); poll = setInterval(async () => { const st = await api.claudeStatus(true); if (st.state !== "loggedOut" && st.state !== "missing") { clearPoll(); await api.claudeCancel("login"); } }, 2000);
    await api.claudeLogin({ method, email: email || undefined });
    clearPoll(); working = false; await check(true);
  }
  async function runPlugins() {
    working = true; logLines = []; say("Installing plugins…"); await render();
    const r = await api.claudeInstallPlugins();
    working = false;
    if (r?.ok) { logLines = []; say("Plugins are installed. Claude uses them from your next message."); }
    else { say(r?.error?.message ?? r?.error ?? "The installation failed.", true); if (r?.error?.kind === "ssh") logLines = ["Try this in a terminal to see the details:", "git ls-remote ssh://git@uucodebase.plus4u.net:9422/ec65742216410afe7eced8e5ede01102/uu-technical-products-mp.git"]; }
    await check(true);
  }

  $("setup-action").onclick = async () => {
    if (mode === "codex") return working ? undefined : runCodexPlugins();
    if (!status || working) return;
    const act = steps(status).find((s) => !s.ok)?.key ?? "plugins";
    if (act === "claude") await runInstall(); else if (act === "login") await runLogin(); else await runPlugins();
  };
  $("setup-cancel").onclick = async () => { await api.claudeCancel("install"); await api.claudeCancel("login"); clearPoll(); say("Cancelled."); };
  $("setup-recheck").onclick = () => (mode === "codex" ? openCodex() : check(true, { show: manual }));
  $("setup-close").onclick = () => { dismissed = true; manual = false; box.hidden = true; mode = "claude"; };
  $("setup-link").onclick = (e) => api.openExternal(e.currentTarget.dataset.href);
  $("setup-copy").onclick = async () => { try { await navigator.clipboard.writeText($("setup-copy").dataset.text ?? ""); toast("Command copied."); } catch { toast("Could not copy.", { err: true }); } };
  $("setup-updates").onclick = () => (mode === "codex" ? (working ? undefined : checkCodexUpdates()) : checkUpdates(true, { fromWizard: true }));
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); $("setup-close").click(); } });
  api.onClaudeProgress((p) => {
    if (p.kind === "install" && p.line) { logLines.push(p.line); paintLog(); }
    else if (p.kind === "plugins") { if (p.state === "run") say(`${p.label}… (${p.index + 1}/${p.total})`); logLines.push(`${p.state === "ok" ? "✓" : p.state === "bad" ? "✕" : "…"} ${p.label}`); paintLog(); }
  });

  // ---------------------------------------------------------------- plugin updates (a strip under the chat header)
  let updates = [];
  const strip = $("updatestrip");
  function paintStrip() {
    strip.hidden = !updates.length;
    if (!updates.length) return;
    $("us-text").textContent = `Plugin update${updates.length > 1 ? "s" : ""} available: ${updates.map((u) => `${u.name} ${u.installed} → ${u.latest}`).join(", ")}`;
    const busy = isBusy();
    $("us-update").disabled = busy; $("us-update").title = busy ? "Claude is working: update when it has finished" : "Update the plugins now (Claude uses the new version from your next message)";
  }
  async function checkUpdates(force = false, { fromWizard = false } = {}) {
    const r = await api.pluginsCheck(force);
    if (r?.error) { if (force) toast(r.error, { err: true }); return; }
    updates = r.updates ?? []; paintStrip();
    if (force) toast(updates.length ? `${updates.length} plugin update${updates.length > 1 ? "s" : ""} available.` : r.checked === false ? "The plugin marketplace is not configured in Claude Code yet: install the plugins first." : "Plugins are up to date.", { err: false });
  }
  $("us-update").onclick = async () => {
    if (isBusy() || !updates.length) return;
    $("us-update").disabled = true; $("us-text").textContent = "Updating plugins…";
    const r = await api.pluginsUpdate(updates.map((u) => u.id));
    if (r?.ok) { updates = []; toast("Plugins updated. Claude uses them from your next message."); }
    else toast(r?.error?.message ?? r?.error ?? "The update failed.", { err: true });
    paintStrip(); if (updates.length) paintStrip(); await check(true);
  };
  $("us-later").onclick = async () => { await api.pluginsLater(updates); updates = []; paintStrip(); };

  return { check, checkUpdates, open: () => { mode = "claude"; return check(true, { show: true }); }, openCodex, paintStrip, ready: () => status?.state === "ready" };
}
