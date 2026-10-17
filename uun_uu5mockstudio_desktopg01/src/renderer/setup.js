const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n; };
const STATE_MARK = { ok: "✓", disabled: "⚠", outdated: "⚠", missing: "✕" };

/**
 * First-run wizard and plugin updates: Claude Code (install) -> Sign in -> Plugins (install). Opens by itself when something is missing,
 * and any time from the Help menu to see the state. Plugin updates are only ever offered (strip under the chat header), never applied silently.
 */
export function createSetup({ api, toast, isBusy, onStatus }) {
  let status = null, manual = false, working = false, poll = null, logLines = [];
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
    $("setup-close").hidden = Boolean(active) && !manual; $("setup-updates").hidden = Boolean(active) || !manual;
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
    manual = show && !needs ? true : manual && !needs ? manual : false;
    if (show) manual = true;
    box.hidden = !needs && !manual;
    if (!box.hidden) await render();
    if (!needs) { manual = manual && !box.hidden; }
    return status;
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
    if (!status || working) return;
    const act = steps(status).find((s) => !s.ok)?.key ?? "plugins";
    if (act === "claude") await runInstall(); else if (act === "login") await runLogin(); else await runPlugins();
  };
  $("setup-cancel").onclick = async () => { await api.claudeCancel("install"); await api.claudeCancel("login"); clearPoll(); say("Cancelled."); };
  $("setup-recheck").onclick = () => check(true, { show: manual });
  $("setup-close").onclick = () => { manual = false; box.hidden = true; };
  $("setup-link").onclick = (e) => api.openExternal(e.currentTarget.dataset.href);
  $("setup-copy").onclick = async () => { try { await navigator.clipboard.writeText($("setup-copy").dataset.text ?? ""); toast("Command copied."); } catch { toast("Could not copy.", { err: true }); } };
  $("setup-updates").onclick = () => checkUpdates(true, { fromWizard: true });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape" && manual) { e.stopPropagation(); $("setup-close").click(); } });
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

  return { check, checkUpdates, open: () => check(true, { show: true }), paintStrip, ready: () => status?.state === "ready" };
}
