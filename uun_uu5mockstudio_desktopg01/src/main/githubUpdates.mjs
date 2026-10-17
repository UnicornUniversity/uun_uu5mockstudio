import { compareVersions } from "./prerequisites.mjs";

/**
 * "Check for Updates" against the releases of the GitHub repository: the newest published release is compared with the running
 * version and, when it is newer, the installer for this system is offered for download in the browser. No code signing and no update
 * feed files are needed (installing through electron-updater, see updater.mjs, would need a signed app on macOS).
 */
export const DEFAULT_REPO = "UnicornUniversity/uun_uu5mockstudio";

/** `v0.2.1` -> `0.2.1` */
export const parseTag = (tag) => String(tag ?? "").trim().replace(/^v/i, "");

/** The installer of a release for this system: the .dmg of the right architecture on macOS (the .zip as a fallback), .exe on Windows, .AppImage on Linux. */
export function pickAsset(assets = [], platform = process.platform, arch = process.arch) {
  const list = assets.filter((a) => a?.name && a.browser_download_url);
  const archOk = (n) => (arch === "arm64" ? /arm64/i.test(n) : !/arm64/i.test(n));
  const by = (re, needArch = true) => list.find((a) => re.test(a.name) && (!needArch || archOk(a.name)));
  const found = platform === "darwin" ? by(/\.dmg$/i) ?? by(/\.zip$/i) : platform === "win32" ? by(/\.exe$/i, false) : by(/\.AppImage$/i, false);
  return found ? { name: found.name, url: found.browser_download_url, size: found.size ?? null, digest: found.digest ?? null } : null;
}

/** The .zip of the right architecture (macOS installs an update from it by itself, see selfUpdate.mjs), or null. */
export const pickZip = (assets = [], arch = process.arch) => {
  const z = assets.find((a) => a?.name && a.browser_download_url && /\.zip$/i.test(a.name) && (arch === "arm64" ? /arm64/i.test(a.name) : !/arm64/i.test(a.name)));
  return z ? { name: z.name, url: z.browser_download_url, size: z.size ?? null, digest: z.digest ?? null } : null;
};

/** The GitHub API answer for a release -> { version, url, notes, asset } or null (drafts, pre-releases and releases without a tag are ignored). */
export function parseRelease(json, { platform, arch } = {}) {
  if (!json || json.draft || json.prerelease) return null;
  const version = parseTag(json.tag_name);
  if (!/^\d+(\.\d+)*/.test(version)) return null;
  return { version, url: json.html_url ?? null, notes: String(json.body ?? "").slice(0, 4000), asset: pickAsset(json.assets, platform, arch), zip: pickZip(json.assets, arch) };
}

/** Only pages and files of this repository on github.com are ever opened for the user. */
export const isRepoUrl = (url, repo = DEFAULT_REPO) => typeof url === "string" && url.startsWith(`https://github.com/${repo}/`);

/**
 * `fetchJson(url)` resolves { status, json, remaining } (remaining = the rate limit left). Resolves
 * { status: "available", ...release } | { status: "current", version } | { status: "error", message }; never throws.
 */
export async function checkGithub({ current, repo = DEFAULT_REPO, platform = process.platform, arch = process.arch, fetchJson, api = "https://api.github.com" }) {
  try {
    const r = await fetchJson(`${api}/repos/${repo}/releases/latest`);
    if (r.status === 404) return { status: "error", message: "No release has been published yet." };
    if (r.status === 403 || r.status === 429) return { status: "error", message: "GitHub is limiting requests right now, try again later." };
    if (r.status < 200 || r.status >= 300) return { status: "error", message: `GitHub answered ${r.status}.` };
    const rel = parseRelease(r.json, { platform, arch });
    if (!rel) return { status: "error", message: "The latest release could not be read." };
    return compareVersions(current, rel.version) < 0 ? { status: "available", ...rel } : { status: "current", version: current };
  } catch (e) {
    return { status: "error", message: e?.name === "TimeoutError" ? "GitHub did not answer in time." : "Could not reach GitHub (are you online?)." };
  }
}
