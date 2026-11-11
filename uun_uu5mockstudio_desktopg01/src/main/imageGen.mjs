import { readFile, writeFile, mkdir, rm, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { saveAssets, sniff, MAX_BYTES } from "./attachments.mjs";

/**
 * The OpenAI model used for generation. The names of the image models change faster than this app (gpt-image-1 is no longer offered
 * to every key), so the user can set the model in Settings; then STUDIO_IMAGE_MODEL; then this default.
 */
export const DEFAULT_MODEL = "gpt-image-2";
export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
export const MAX_PER_RUN = 4;
export const SIZES = ["1024x1024", "1536x1024", "1024x1536"];
export const QUALITIES = ["low", "medium", "high"];
const ENDPOINT = "https://api.openai.com/v1/images/generations";

/**
 * The OpenAI API key. The user types it in the app and it is kept encrypted with the operating system (Electron safeStorage),
 * never in app-state.json and never handed to the renderer. OPENAI_API_KEY is a fallback for developers.
 * `safeStorage` = { isEncryptionAvailable, encryptString, decryptString }; `file` = where the encrypted key is written.
 */
export function createKeyStore({ file, safeStorage, env = process.env }) {
  const stored = async () => {
    try {
      const raw = await readFile(file, "utf8");
      return safeStorage.decryptString(Buffer.from(raw.trim(), "base64")) || null;
    } catch { return null; }
  };
  return {
    /** { key, source: "app" | "env" } or null */
    async get() {
      const k = await stored();
      if (k) return { key: k, source: "app" };
      const e = String(env.OPENAI_API_KEY ?? "").trim();
      return e ? { key: e, source: "env" } : null;
    },
    async set(key) {
      const k = String(key ?? "").trim();
      if (!/^[\x21-\x7e]{20,}$/.test(k)) throw new Error("This does not look like an OpenAI API key.");
      if (!safeStorage.isEncryptionAvailable()) throw new Error("The operating system cannot encrypt the key here, so the app does not store it. Set the OPENAI_API_KEY environment variable instead.");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, safeStorage.encryptString(k).toString("base64"), { mode: 0o600 });
    },
    async clear() { await rm(file, { force: true }); },
    async status() {
      const k = await this.get();
      return { hasKey: Boolean(k), source: k?.source ?? null, canStore: Boolean(safeStorage.isEncryptionAvailable()) };
    },
  };
}

/** What the API said, in words the user can act on. */
function apiError(status, body) {
  const msg = body?.error?.message ? ` (${String(body.error.message).slice(0, 300)})` : "";
  if (status === 401) return new Error("OpenAI rejected the API key. Check it in the image generation settings.");
  if (status === 403) return new Error(`OpenAI refused the request${msg}. The account may not be allowed to use image models.`);
  if (status === 429) return new Error(`OpenAI limit or credit reached${msg}. Try again later or check the billing of the account.`);
  if (body?.error?.code === "content_policy_violation" || body?.error?.code === "moderation_blocked") return new Error(`OpenAI did not generate the picture because of its content policy${msg}. Change the description.`);
  return new Error(`OpenAI returned ${status}${msg}.`);
}

/** One picture from OpenAI as a PNG/JPEG/WebP Buffer. */
export async function generateImage({ prompt, size = "1024x1024", quality = "medium", transparent = false }, { key, model = process.env.STUDIO_IMAGE_MODEL || DEFAULT_MODEL, fetchImpl = fetch } = {}) {
  if (!key) throw new Error("There is no OpenAI API key.");
  const text = String(prompt ?? "").trim();
  if (!text) throw new Error("The description of the picture is empty.");
  if (text.length > 4000) throw new Error("The description of the picture is too long (4000 characters at most).");
  const body = { model, prompt: text, n: 1, size: SIZES.includes(size) ? size : "1024x1024", quality: QUALITIES.includes(quality) ? quality : "medium" };
  if (transparent) { body.background = "transparent"; body.output_format = "png"; }
  let res;
  try {
    res = await fetchImpl(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  } catch (e) {
    throw new Error(e?.name === "TimeoutError" ? "OpenAI did not answer in time." : `Cannot reach OpenAI: ${e.message}`);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw apiError(res.status, json);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no picture.");
  const buf = Buffer.from(b64, "base64");
  if (buf.length > MAX_BYTES) throw new Error("The generated picture is larger than 10 MB.");
  const mime = sniff(buf);
  if (!mime) throw new Error("OpenAI returned something that is not a picture.");
  return { buf, mime };
}

const cacheKey = (a) => createHash("sha256").update(JSON.stringify([a.prompt.trim(), a.size, a.quality, Boolean(a.transparent), a.model])).digest("hex").slice(0, 24);

/**
 * The tool behind `generate_image`: a picture is generated, saved into <project>/assets and its path returned.
 * The same description is never paid for twice (index .studio/generated-images.json), and one run of the agent
 * (one message of the user) can create at most `maxPerRun` pictures. `reset()` starts a new run.
 */
export function createImageGenerator({ keyStore, isEnabled, fetchImpl, maxPerRun = MAX_PER_RUN, getModel = async () => process.env.STUDIO_IMAGE_MODEL || DEFAULT_MODEL }) {
  let used = 0;
  return {
    reset() { used = 0; },
    async generate(projectDir, { prompt, name, size, quality, transparent }) {
      if (!(await isEnabled())) return "Picture generation is switched off. Ask the user to turn it on in the menu (Settings > Integrations > Picture generation) and enter an OpenAI API key; until then use SVG, a placeholder or a downloaded picture.";
      const k = await keyStore.get();
      if (!k) return "Picture generation has no OpenAI API key. Ask the user to enter it in the menu (Settings > Integrations > Picture generation); until then use SVG, a placeholder or a downloaded picture.";
      const model = (await getModel()) || DEFAULT_MODEL;
      const args = { prompt: String(prompt ?? ""), size: SIZES.includes(size) ? size : "1024x1024", quality: QUALITIES.includes(quality) ? quality : "medium", transparent: Boolean(transparent), model };
      const indexFile = path.join(projectDir, ".studio", "generated-images.json");
      const index = await readFile(indexFile, "utf8").then(JSON.parse).catch(() => ({}));
      const id = cacheKey(args);
      if (index[id] && (await access(path.join(projectDir, index[id])).then(() => true, () => false))) return `Already generated earlier, reused: ${index[id]}`;
      if (used >= maxPerRun) return `At most ${maxPerRun} pictures can be generated for one request of the user. Use the pictures you have, or ask the user to continue in a new message.`;
      const { buf, mime } = await generateImage(args, { key: k.key, model, fetchImpl });
      used++; // counted once the API accepted the request (it is billed)
      const [file] = await saveAssets(projectDir, [{ mime, data: buf.toString("base64"), name: name || args.prompt.slice(0, 40) }]);
      await mkdir(path.dirname(indexFile), { recursive: true });
      await writeFile(indexFile, JSON.stringify({ ...index, [id]: file }));
      return `Saved: ${file}`;
    },
  };
}
