/**
 * The Back key: Escape on a keyboard, the dedicated button on a remote.
 *
 * There is already a handler that closes the top modal on Escape
 * (`useGlobalKeyboardEvents.ts`), and B3 says to defer to it rather than
 * duplicate it. Deferring is harder than it sounds, because that handler is
 * registered first and runs first — by the time anything of ours sees the same
 * event, the modal it closed is already out of the store. Asking "is a modal
 * open?" in the bubble phase therefore always answers "no", and answering it
 * that way would send the user back a route every time they dismissed a dialog.
 *
 * So the decision is split: {@link snapshotBackContext} runs in the capture
 * phase, while the answer is still true, and {@link resolveBack} runs in the
 * bubble phase, where `defaultPrevented` is finally meaningful.
 */

import { getScopeDepth } from "@/utils/browser/focusScopes";

/**
 * TV back-key codes, from `src/tv/platform/keymap.ts` (Tizen 10009, webOS 461).
 *
 * Duplicated rather than imported: that file is TV-side and this one ships to
 * the website. Both are small tables of numbers that vendors do not change.
 * These keys have no meaningful `event.key` — Tizen reports `"Unidentified"` —
 * so the code is the only thing to match on.
 */
const BACK_KEY_CODES = [10009, 461];

export function isBackKey(event: KeyboardEvent): boolean {
  if (event.key === "Escape") return true;
  return BACK_KEY_CODES.indexOf(event.keyCode) !== -1;
}

export type BackAction =
  /** Something else owns this press. Do nothing. */
  | "none"
  /** A modal was open; the existing global handler closes it. */
  | "defer"
  /** Nothing on screen to close, and there is somewhere to go back to. */
  | "history";

export interface BackContext {
  /** Whether a modal was open *before* this event started propagating. */
  hadModal: boolean;
}

/**
 * Whether `history.back()` stays inside the app.
 *
 * React Router v6 stamps a monotonic `idx` into `history.state` on every
 * navigation it makes. Index 0 means the entry the user arrived on, so going
 * back from there leaves the site — which, from a Back *button*, reads as the
 * app closing itself. On a TV that is the correct behaviour and Phase C's
 * platform layer owns it (Tizen and webOS both want an explicit exit call);
 * here, doing nothing is right.
 */
export function canGoBack(): boolean {
  const state = window.history.state;
  if (state === null || typeof state !== "object") return false;
  const idx = (state as { idx?: unknown }).idx;
  return typeof idx === "number" && idx > 0;
}

/** Captures what the bubble phase will no longer be able to see. */
export function snapshotBackContext(hasModal: boolean): BackContext {
  return { hadModal: hasModal };
}

export function resolveBack(
  event: KeyboardEvent,
  context: BackContext,
): BackAction {
  // A dropdown, a Headless UI `Listbox`, a `focus-trap` — anything that closed
  // itself on this press said so here. Going back on top of that would undo a
  // navigation the user never asked to undo.
  if (event.defaultPrevented) return "none";

  if (context.hadModal) return "defer";

  // A live focus scope with no modal behind it is a player popout or an
  // overlay mid-transition. Neither is ours to close, and neither is a good
  // moment to change route.
  if (getScopeDepth() > 0) return "none";

  return canGoBack() ? "history" : "none";
}
