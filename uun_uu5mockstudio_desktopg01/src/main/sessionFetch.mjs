import { net } from "electron";

/**
 * A `fetch` for the downloads of webImages.mjs that uses the cookies of an Electron session (the sign-ins the user made in the app). Redirects are
 * never followed here: a redirect comes back as a 3xx response with its `location`, so the caller checks every address before it is requested
 * (`session.fetch` cannot do that: with `redirect: "manual"` it fails). The body is read up to `max` bytes.
 */
export function sessionFetch(getSession, { max = 12 * 1024 * 1024 } = {}) {
  return (url, { headers = {}, signal } = {}) => new Promise((resolve, reject) => {
    const req = net.request({ url, session: getSession(), redirect: "manual", useSessionCookies: true });
    for (const [k, v] of Object.entries(headers)) { try { req.setHeader(k, v); } catch { /* a header Chromium sets itself */ } }
    let done = false;
    const end = (fn, v) => { if (!done) { done = true; fn(v); } };
    signal?.addEventListener("abort", () => { req.abort(); end(reject, new Error("The download took too long.")); });
    req.on("redirect", (status, _method, to) => { end(resolve, new Response(null, { status: status >= 300 && status < 400 ? status : 302, headers: { location: to } })); req.abort(); });
    req.on("response", (res) => {
      const chunks = []; let size = 0;
      res.on("data", (c) => { size += c.length; if (size > max) { req.abort(); end(reject, new Error(`The file is larger than ${Math.round(max / 1048576)} MB.`)); } else chunks.push(c); });
      res.on("end", () => { const h = new Headers(); for (const [k, v] of Object.entries(res.headers)) { try { h.set(k, Array.isArray(v) ? v.join(", ") : String(v)); } catch { /* not a header a Response can hold */ } } const body = [204, 205, 304].includes(res.statusCode) ? null : Buffer.concat(chunks); end(resolve, new Response(body, { status: res.statusCode, headers: h })); });
      res.on("error", (e) => end(reject, e));
    });
    req.on("error", (e) => end(reject, e));
    req.end();
  });
}
