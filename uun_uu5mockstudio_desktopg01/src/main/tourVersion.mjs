/**
 * The welcome tour opens on its own until it is closed once. When its cards change in a way people should see (new features), raise
 * TOUR_VERSION: everybody who closed an older version sees the new one once more. `app-state.json` keeps the version that was seen
 * (`tourSeen`); an older app wrote `true`, which counts as version 1.
 */
export const TOUR_VERSION = 2; // 2: Annotate, Plan, the sitemap, Plus4U documents (0.31.0)

/** Was the current tour seen? `saved` is what app-state.json holds. */
export const tourSeenNow = (saved, version = TOUR_VERSION) => (saved === true ? 1 : Number.isFinite(saved) ? saved : 0) >= version;
