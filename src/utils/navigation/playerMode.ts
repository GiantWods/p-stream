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
 * - **Widget mode** is entered with OK or with any arrow, and swaps the two: the
 *   skip comes off, the root becomes a scope, and the transport handler returns
 *   early. Arrows move between controls until Back or a stretch of silence puts
 *   it back.
 *
 * Which of the two owns the arrows is decided by the engine's own gate, not by
 * the mode: with directional navigation on, an arrow is a UI key everywhere else
 * in the app and there is no reason the player should be the exception. So the
 * first arrow press opens the mode instead of seeking, and `KeyboardEvents.tsx`
 * gives all four up for the length of the session. With the engine off nothing
 * here runs and every arrow is transport, exactly as it is today.
 *
 * This module is the decision half — predicates over a key press and the state
 * of focus, with no React and no store. `usePlayerWidgetMode` owns the rest.
 */

import {
  ArrowKeyDirection,
  ownsArrowKeys,
} from "@/utils/browser/keyboardTarget";

import { isBackKey } from "./back";
import { needsEntryPoint } from "./entryPoint";

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

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
 * One of the four arrows, whatever is held with it.
 *
 * Modifier-agnostic on purpose: this is the question the transport handler asks
 * — "is this a key I have to give up?" — and Shift+→ seeking five seconds while
 * →  navigates would be the same surprise from a chord nobody meant to bind.
 */
export function isArrowKey(event: KeyboardEvent): boolean {
  return ARROW_KEYS.indexOf(event.key) !== -1;
}

/**
 * The OK press that opens widget mode.
 *
 * Enter and nothing else. Space is play/pause and is locked, and `k` is
 * play/pause. Tizen and webOS both report their centre button as `Enter`, so
 * there is no keycode to add.
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

/**
 * The arrow press that opens widget mode.
 *
 * Unmodified, and repeats count — a held arrow on a remote arrives with `repeat`
 * set from the second tick on, and a tick that fell through to transport would
 * seek. Re-entering a mode that is already open is not a concern here: the
 * caller only asks while it is closed.
 */
export function isWidgetArrowEntry(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  return isArrowKey(event);
}

/**
 * Whether an arrow press should be read as "let me at the controls".
 *
 * Looser than {@link canEnterWidgetMode}, because an arrow has no second meaning
 * to collide with the way OK does. Focus nowhere is the remote's state; focus
 * *inside the player* is the mouse user's, and it is the one this exists for —
 * having clicked Pause, they would otherwise be stuck with an arrow that seeks
 * and an OK that only ever re-clicks the button under it.
 *
 * Refused when focus is outside the player, so an arrow being used to navigate
 * the page behind a widget-mode-less player does not drag the mode open, and
 * when the target drives its value by *this* arrow — a field keeps the keys that
 * move its caret and gives back the ones that cannot, which is the same rule the
 * engine applies everywhere else. Asking without a direction refuses all four.
 */
export function canEnterWidgetModeByArrow(
  target: EventTarget | null,
  root: HTMLElement | null,
  direction?: ArrowKeyDirection,
): boolean {
  if (ownsArrowKeys(target, direction)) return false;
  if (needsEntryPoint()) return true;
  const active = document.activeElement;
  return root !== null && active !== null && root.contains(active);
}
