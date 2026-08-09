/**
 * The player's two input modes, and the keys that move between them.
 *
 * Everywhere else in the app an arrow key has no other job, so the engine can
 * simply take it. The player is the one surface where all four already mean
 * something: `KeyboardEvents.tsx` binds ↑/↓ to volume and ←/→ to a locked 5s
 * seek, on `window`, and the volume branch does not call `preventDefault` — so
 * the engine's usual "stand down if someone claimed this key" check cannot even
 * see it. Sharing the arrows is therefore not on the table; one of the two has
 * to be off.
 *
 * - **Transport mode** is the default and is today's player exactly. The root
 *   carries `data-nav-skip`, the engine never looks inside, and nothing in
 *   `KeyboardEvents.tsx` runs differently.
 * - **Widget mode** is entered with OK and swaps the two: the skip comes off,
 *   the root becomes a scope, and the transport handler returns early. Arrows
 *   move between controls until Back or a stretch of silence puts it back.
 *
 * This module is the decision half — predicates over a key press and the state
 * of focus, with no React and no store. `usePlayerWidgetMode` owns the rest.
 */

import { isBackKey } from "./back";
import { needsEntryPoint } from "./entryPoint";

/**
 * How long widget mode survives without a key press.
 *
 * Long enough that reading the episode list is not a race, short enough that a
 * remote put down mid-film gives volume and seek back before anyone reaches for
 * it. Anything shorter competes with the 3s control auto-hide and the mode would
 * appear to drop out from under the user while they were still looking at it.
 */
export const WIDGET_IDLE_MS = 10000;

/**
 * The OK press that opens widget mode.
 *
 * Enter and nothing else. Space is play/pause and is locked, `k` is play/pause,
 * and every arrow is transport — OK is the only key on a remote that the player
 * does not already spend. Tizen and webOS both report their centre button as
 * `Enter`, so there is no keycode to add.
 */
export function isWidgetEntryKey(event: KeyboardEvent): boolean {
  if (event.key !== "Enter") return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  return !event.repeat;
}

/** The press that closes it again. Escape, or a remote's back button. */
export function isWidgetExitKey(event: KeyboardEvent): boolean {
  return isBackKey(event);
}

/**
 * Whether an OK press should be read as "show me the controls".
 *
 * Only when focus is nowhere. If it is already on a control — a mouse user who
 * clicked Pause and then pressed Enter — that control activates on this very
 * press, and changing mode underneath it would make one key do two unrelated
 * things. From `<body>`, which is where a remote user always is in transport
 * mode, there is nothing else the press could have meant.
 */
export function canEnterWidgetMode(): boolean {
  return needsEntryPoint();
}
