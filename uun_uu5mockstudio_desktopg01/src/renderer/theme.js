// Runs before the page paints so there is no dark flash in light mode. Preference: "auto" | "light" | "dark".
(() => {
  const KEY = "uu5studio.theme";
  const get = () => { try { return localStorage.getItem(KEY) || "auto"; } catch { return "auto"; } };
  const resolve = (pref) => (pref === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : pref);
  const apply = () => { document.documentElement.dataset.theme = resolve(get()); };
  window.__theme = {
    get,
    set(pref) { try { localStorage.setItem(KEY, pref); } catch {} apply(); },
    next() { const order = ["auto", "light", "dark"]; const n = order[(order.indexOf(get()) + 1) % 3]; this.set(n); return n; },
  };
  apply();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
})();
