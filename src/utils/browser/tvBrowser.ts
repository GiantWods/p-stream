/**
 * Is this a television?
 *
 * Deliberately narrow: Tizen (Samsung) and webOS (LG), which are the two
 * platforms whose only input device is a D-pad remote. Directional navigation
 * is force-enabled on them because there is nothing to opt in *with* — no
 * pointer, no Tab key, no settings screen reachable without arrows.
 *
 * The broad "is this a TV" list in `hooks/useIsTv.ts` is the wrong test for
 * that. It matches `SamsungBrowser` and `Silk`, which are a phone and a
 * tablet, and force-enabling there would take the arrow keys away from users
 * who never asked and have a perfectly good touchscreen.
 *
 * Kept out of `detectFeatures.ts` — that is where the rest of the environment
 * detection lives, but it imports hls.js and fscreen at module scope, and this
 * is read during app startup by code that must not drag the player's
 * dependencies into the eager bundle.
 */

/**
 * webOS spells itself two ways in the wild: `Web0S` with a zero on the 4.x/5.x
 * builds, `webOS` on others. Both, case-insensitively.
 */
const TV_USER_AGENT = /Tizen|Web[0O]S/i;

export function isTvBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return TV_USER_AGENT.test(navigator.userAgent || "");
}
