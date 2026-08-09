/**
 * Flag check for the navigation debug probe.
 *
 * Kept separate from the probe itself so the probe can be a dynamic import:
 * what ships in the normal bundle is the few bytes below, and the overlay code
 * is a chunk nobody fetches unless they ask for it. That matters more than a
 * build-time `NODE_ENV` gate would, because the measurements this probe exists
 * to take have to be taken on the TV — and the TV runs a production build.
 */

/**
 * True when the probe should run.
 *
 * `?navdebug=1` is the everyday form. The `localStorage` form exists because a
 * TV app has no address bar: on Tizen or webOS you attach the remote inspector
 * and run `localStorage.navdebug = "1"` followed by a reload. Reading
 * `localStorage` can throw outright when storage is blocked, hence the catch.
 */
export function isNavDebugEnabled(): boolean {
  try {
    if (window.location.search.indexOf("navdebug=1") !== -1) return true;
    return window.localStorage.getItem("navdebug") === "1";
  } catch {
    return false;
  }
}

/** Loads and starts the probe if the flag is set. Otherwise does nothing. */
export function initNavDebug(): void {
  if (!isNavDebugEnabled()) return;
  import("./navDebugProbe")
    .then((probe) => probe.startNavDebug())
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[navdebug] failed to load", err);
    });
}
