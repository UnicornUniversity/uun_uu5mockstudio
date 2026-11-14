/**
 * The Plus4U account button (dashboard header next to New Project, and the project toolbar). Signed out: a person icon, a click signs in
 * (the sign-in window of Plus4U). Signed in: the photo of the person (personalCard/loadPhoto, loaded by the main process), else the initials;
 * a click opens a small menu with the name, the uuIdentity and Sign out. Signed in means a usable token: when the last one expires the button
 * goes back to the signed-out look by itself (its title says the sign-in expired) and a click signs in again. It looks again whenever the
 * main process says the sign-in changed (a sign-in started by Upload, the lock, a publish …); `onStatus(st)` tells the rest of the app, which
 * shows the Plus4U features only while signed in. The tokens never reach the renderer.
 */
const PERSON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a6.5 6.5 0 0 1 11.6 0"/></svg>';

export const initialsOf = (name) => String(name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

export function createAccountButton({ buttons, api = window.studio, toast = () => {}, dismissMenus = () => {}, onStatus = () => {} }) {
  let st = { signedIn: false }, photo = null, photoOf = null, busy = false, expiryTimer = null;
  const menu = Object.assign(document.createElement("div"), { id: "acctmenu", hidden: true });
  menu.setAttribute("role", "menu");
  document.body.append(menu);

  function paint() {
    for (const b of buttons) {
      b.classList.add("acctbtn");
      b.classList.toggle("busy", busy);
      b.disabled = busy;
      b.replaceChildren();
      if (st.signedIn && photo) {
        b.append(Object.assign(document.createElement("img"), { src: photo, alt: "" }));
      } else if (st.signedIn) {
        b.append(Object.assign(document.createElement("span"), { className: "acct-ini", textContent: initialsOf(st.name) }));
      } else b.innerHTML = PERSON;
      const label = busy ? "Signing in to Plus4U…" : st.signedIn ? `Plus4U: ${st.name} (${st.uuIdentity})` : st.expired ? `Your Plus4U sign-in expired (${st.name}). Click to sign in again.` : "Sign in to Plus4U";
      b.title = label; b.setAttribute("aria-label", label);
      b.setAttribute("aria-haspopup", st.signedIn ? "menu" : "false");
    }
  }

  async function refresh() {
    const r = await api.plus4uStatus().catch(() => null);
    st = r && !r.error ? r : { signedIn: false };
    if (!st.signedIn) menu.hidden = true;
    if (photoOf !== st.uuIdentity) { photo = null; photoOf = null; } // keep the photo of the same person (no flicker on every look)
    paint();
    onStatus(st); // the Plus4U features show only while signed in
    // back to the signed-out look the moment the token stops being usable
    clearTimeout(expiryTimer);
    if (st.signedIn && Number.isFinite(st.expiresAt)) expiryTimer = setTimeout(refresh, Math.min(2 ** 31 - 1, Math.max(1000, st.expiresAt - Date.now() + 500)));
    if (st.signedIn && !photo) { const p = await api.plus4uPhoto().catch(() => null); if (typeof p === "string" && p.startsWith("data:image/")) { photo = p; photoOf = st.uuIdentity; paint(); } }
  }

  async function signIn() {
    busy = true; paint();
    try {
      const r = await api.plus4uLogin();
      if (r?.error) { if (!/cancelled/i.test(r.error)) toast(`Plus4U sign-in failed: ${r.error}`, { err: true }); }
      else toast(`Signed in to Plus4U as ${r.name}.`);
    } finally { busy = false; await refresh(); }
  }

  async function signOut() {
    menu.hidden = true;
    const r = await api.plus4uLogout();
    if (r?.error) toast(`Sign out failed: ${r.error}`, { err: true });
    await refresh();
  }

  function openMenu(anchor) {
    menu.replaceChildren();
    const head = Object.assign(document.createElement("div"), { className: "acct-head" });
    const pic = photo ? Object.assign(document.createElement("img"), { src: photo, alt: "" }) : Object.assign(document.createElement("span"), { className: "acct-ini", textContent: initialsOf(st.name) });
    const who = document.createElement("div");
    who.append(Object.assign(document.createElement("b"), { textContent: st.name }), Object.assign(document.createElement("span"), { className: "mute", textContent: st.uuIdentity }));
    head.append(pic, who);
    const out = Object.assign(document.createElement("button"), { type: "button", textContent: "Sign out of Plus4U" });
    out.setAttribute("role", "menuitem");
    out.onclick = (e) => { e.stopPropagation(); signOut(); };
    menu.append(head, Object.assign(document.createElement("span"), { className: "pm-sep" }), out);
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
  }

  for (const b of buttons) b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (busy) return;
    const wasOpen = !menu.hidden; dismissMenus();
    if (!st.signedIn) { signIn(); return; }
    if (!wasOpen) openMenu(b);
  });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { menu.hidden = true; e.stopPropagation(); } }, true);

  let soon = null;
  api.onPlus4uChanged?.(() => { clearTimeout(soon); soon = setTimeout(refresh, 200); });
  addEventListener("focus", () => refresh()); // a laptop that slept past the expiry
  paint();
  refresh();
  return { refresh, status: () => st };
}
