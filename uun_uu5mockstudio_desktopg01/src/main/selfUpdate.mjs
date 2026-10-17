import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

/**
 * Installing an update without a Developer ID certificate (macOS): the app downloads the .zip of the release itself (a file that
 * the app downloads gets no quarantine flag, so Gatekeeper has nothing to object to), checks it, quits, and a small shell script
 * replaces the bundle and starts the new one. electron-updater cannot do this for an unsigned app, it needs a stable signature.
 */
const run = promisify(execFile);

/** `/Applications/uu5Mock Studio.app/Contents/MacOS/uu5Mock Studio` -> `/Applications/uu5Mock Studio.app` (null outside a bundle). */
export function bundlePath(execPath) {
  const m = String(execPath ?? "").match(/^(.*?\.app)\/Contents\/MacOS\/[^/]+$/);
  return m ? m[1] : null;
}

/** Self-update works for a packaged macOS app whose folder the user can write to (a bundle replaces itself next to where it is). */
export async function canSelfUpdate({ platform = process.platform, packaged, execPath = process.execPath, hasFeed = false }) {
  if (platform !== "darwin" || !packaged || hasFeed) return false;
  const bundle = bundlePath(execPath);
  if (!bundle) return false;
  try { await fs.promises.access(path.dirname(bundle), fs.constants.W_OK); await fs.promises.access(bundle, fs.constants.W_OK); return true; } catch { return false; }
}

/**
 * Downloads `url` into `file`. `fetchFn(url)` is a fetch (net.fetch in the app). Resolves { size, sha256 }; rejects when the size or the
 * checksum (`sha256`, the hex of the release asset digest) differ from what the release announced, and removes the partial file.
 */
export async function downloadTo(file, url, { fetchFn = fetch, size = null, sha256 = null, onProgress = () => {}, signal } = {}) {
  const res = await fetchFn(url, { signal, headers: { "User-Agent": "uu5Mock-Studio" } });
  if (!res.ok || !res.body) throw new Error(`The download failed (${res.status}).`);
  const total = Number(res.headers.get("content-length")) || size || 0, hash = crypto.createHash("sha256");
  let got = 0, last = -1;
  const counter = async function* (src) {
    for await (const chunk of src) {
      hash.update(chunk); got += chunk.length;
      const pct = total ? Math.min(99, Math.floor((got / total) * 100)) : 0;
      if (pct !== last) { last = pct; onProgress(pct); }
      yield chunk;
    }
  };
  try {
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(file));
    const digest = hash.digest("hex");
    if (size && got !== size) throw new Error(`The downloaded file has a wrong size (${got} of ${size} bytes).`);
    if (sha256 && digest !== sha256.toLowerCase()) throw new Error("The downloaded file does not match the checksum of the release.");
    return { size: got, sha256: digest };
  } catch (e) { await fs.promises.rm(file, { force: true }); throw e; }
}

/** The checksum GitHub shows for a release asset (`sha256:<hex>`), or null. */
export const digestHex = (digest) => (/^sha256:([0-9a-f]{64})$/i.exec(String(digest ?? "")) ?? [])[1] ?? null;

/**
 * Unpacks the zip into `stageDir` and checks that it holds one app of this product in the expected version, with an intact signature.
 * Resolves the path of the unpacked .app.
 */
export async function unpackAndCheck(zipPath, stageDir, { bundleId, version, exec = run } = {}) {
  await fs.promises.mkdir(stageDir, { recursive: true });
  await exec("/usr/bin/ditto", ["-x", "-k", zipPath, stageDir]);
  const apps = (await fs.promises.readdir(stageDir)).filter((n) => n.endsWith(".app"));
  if (apps.length !== 1) throw new Error("The update does not contain exactly one application.");
  const app = path.join(stageDir, apps[0]), plist = path.join(app, "Contents", "Info.plist");
  const key = async (k) => (await exec("/usr/bin/plutil", ["-extract", k, "raw", "-o", "-", plist])).stdout.trim();
  if ((await key("CFBundleIdentifier")) !== bundleId) throw new Error("The update is a different application.");
  if (version && (await key("CFBundleShortVersionString")) !== version) throw new Error("The update has a different version than announced.");
  await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]).catch(() => { throw new Error("The signature of the update is damaged."); });
  return app;
}

/**
 * Waits for the app (pid) to quit, swaps the bundle (the old one is kept until the new one is in place and restored when that fails),
 * removes the staging folder and starts the app (`$RELAUNCH`, `open` by default). Arguments: pid target staged stageDir backup.
 */
export const SWAP_SCRIPT = `#!/bin/sh
PID="$1"; TARGET="$2"; STAGED="$3"; STAGE_DIR="$4"; BACKUP="$5"
OPEN="\${RELAUNCH:-open}"
i=0
while kill -0 "$PID" 2>/dev/null; do i=$((i+1)); [ "$i" -gt 150 ] && exit 1; sleep 0.2; done
if mv "$TARGET" "$BACKUP"; then
  if mv "$STAGED" "$TARGET"; then rm -rf "$BACKUP"; xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
  else mv "$BACKUP" "$TARGET"; fi
fi
rm -rf "$STAGE_DIR"; rm -f "$0"
exec $OPEN "$TARGET"
`;

/** Starts the swap script detached; the caller quits the app right after. */
export function startSwap({ target, staged, stageDir, pid = process.pid, relaunch }) {
  const script = path.join(os.tmpdir(), `uu5mock-swap-${process.pid}-${Date.now()}.sh`);
  fs.writeFileSync(script, SWAP_SCRIPT, { mode: 0o700 });
  const backup = `${stageDir}.old`;
  const child = spawn("/bin/sh", [script, String(pid), target, staged, stageDir, backup], { detached: true, stdio: "ignore", env: { ...process.env, ...(relaunch ? { RELAUNCH: relaunch } : {}) } });
  child.unref();
  return { script, backup };
}
