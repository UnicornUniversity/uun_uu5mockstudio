import http from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * One Plus4U sign-in for the app and the Plus4U MCP proxy (`uu_aichat_mcputilityg01`, which reads the documents).
 *
 * The proxy signs in on its own: it opens the sign-in page with `open` (macOS) or `xdg-open` (Linux) found on its PATH, in the system browser,
 * and keeps its token in the keychain. The app's account button had no idea of that sign-in, and the proxy none of the app's. The relay puts
 * a small `open` / `xdg-open` of its own first on the proxy's PATH: a Plus4U sign-in page is handed to the app (`onUrl`), which opens it in
 * its sign-in window (the session where the app signs in too), so one sign-in serves both. Any other address goes to the real opener.
 * Windows (`cmd /c start`) is left as it is.
 */

/** Whether `url` is a sign-in page of Plus4U whose answer goes to a loopback address (the proxy's): then the app may open it. */
export function isRelayable(url, issuer) {
  let u, r;
  try { u = new URL(String(url)); r = new URL(u.searchParams.get("redirect_uri") ?? ""); } catch { return false; }
  return u.protocol === "https:" && u.origin === new URL(issuer).origin && u.searchParams.get("response_type") === "code"
    && r.protocol === "http:" && ["localhost", "127.0.0.1"].includes(r.hostname);
}

/** The shell script that stands in for `name` (open / xdg-open): it posts its one argument to the relay, else runs `real`. */
export function shimScript(real) {
  const fallback = real ? `exec "${real}" "$@"` : "exit 1";
  return `#!/bin/sh
# uu5Mock Studio: a Plus4U sign-in page opens in the app's sign-in window (see src/main/signInRelay.mjs), anything else as usual.
if [ -n "$STUDIO_SIGNIN_RELAY" ] && [ "$#" -eq 1 ]; then
  node -e 'fetch(process.env.STUDIO_SIGNIN_RELAY,{method:"POST",body:process.argv[1],signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))' "$1" && exit 0
fi
${fallback}
`;
}

/** The real opener of this platform (outside `skip`), or null. */
function realOpener(name, skip) {
  if (name === "open" && existsSync("/usr/bin/open")) return "/usr/bin/open";
  for (const d of String(process.env.PATH ?? "").split(path.delimiter)) {
    if (!d || path.resolve(d) === path.resolve(skip)) continue;
    const p = path.join(d, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Starts the relay: the shims in `dir` and a loopback server that only answers POST /<secret>. `onUrl(url)` gets each relayable sign-in
 * page. Returns { env(PATH) → the variables for the proxy, close() }, or null on Windows.
 */
export async function createSignInRelay({ dir, issuer, onUrl, platform = process.platform }) {
  if (platform === "win32") return null;
  await mkdir(dir, { recursive: true });
  for (const name of ["open", "xdg-open"]) {
    const file = path.join(dir, name);
    await writeFile(file, shimScript(realOpener(name, dir)), { mode: 0o755 });
    await chmod(file, 0o755);
  }
  const secret = randomBytes(18).toString("base64url");
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== `/${secret}`) { res.writeHead(404).end(); return; }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (d) => { body += d; if (body.length > 16384) req.destroy(); });
    req.on("end", () => {
      const url = body.trim();
      if (!isRelayable(url, issuer)) { res.writeHead(400).end(); return; } // the shim runs the real opener
      res.writeHead(200).end();
      try { onUrl(url); } catch (e) { console.warn(`[plus4u] relay: ${e.message}`); }
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  server.unref();
  const address = `http://127.0.0.1:${server.address().port}/${secret}`;
  return {
    env: (PATH = process.env.PATH) => ({ PATH: [dir, PATH].filter(Boolean).join(path.delimiter), STUDIO_SIGNIN_RELAY: address }),
    close: () => server.close(),
  };
}
