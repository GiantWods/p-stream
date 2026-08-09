/**
 * The bridge from a gamepad action to the rest of the engine.
 *
 * The adapter is a *key source*, not a second engine. B2's `moveFocus`, A9's
 * activation and B3's Back are all reachable directly, and calling them would be
 * the obvious thing — but they are not the only handlers that matter. Headless
 * UI's `Listbox` keeps ↑/↓ for itself while it is open, `focus-trap` keeps
 * Escape, every hand-rolled `[tabindex]` control in the app listens for Enter,
 * and the player binds all four arrows. None of that is reachable by function
 * call. Turning the D-pad into a keydown gets every one of them for free, and
 * means there is exactly one code path to reason about instead of two that have
 * to be kept in agreement.
 *
 * The one thing a synthesized event cannot do is run a default action:
 * `isTrusted` is false, so the browser skips its own behaviour entirely. For the
 * arrows that costs nothing — the engine's move is not a default action. For
 * Enter it is the whole activation, so {@link dispatchGamepadAction} performs
 * that click itself, and only in the case nothing else claimed the press.
 */

import { ownsKeyboardInput } from "@/utils/browser/keyboardTarget";

import { isNativelyActivatable } from "./activation";
import { focusEntryPoint, needsEntryPoint } from "./entryPoint";

/**
 * The actions that are navigation rather than playback, and the key each one is.
 *
 * Everything else in `GAMEPAD_ACTION_LABELS` is the player's — seeking, volume,
 * captions, episodes — and goes to the player's own handler instead. Back is
 * Escape rather than a route change so that it means the same thing the Escape
 * key does: close the popout, or the modal, and only then leave the page.
 */
const ACTION_KEYS: Record<string, string> = {
  "navigate-up": "ArrowUp",
  "navigate-down": "ArrowDown",
  "navigate-left": "ArrowLeft",
  "navigate-right": "ArrowRight",
  confirm: "Enter",
  back: "Escape",
};

export function keyForGamepadAction(action: string): string | null {
  return ACTION_KEYS[action] ?? null;
}

export function isNavigationAction(action: string): boolean {
  return keyForGamepadAction(action) !== null;
}

/** Where a synthesized press should be aimed. */
function pressTarget(): HTMLElement {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.isConnected) return active;
  return document.body;
}

/**
 * Turns one gamepad action into a key press. Returns whether it was ours.
 *
 * `false` means the action is not navigation and the caller should hand it to
 * the player instead — not that the press failed.
 */
export function dispatchGamepadAction(action: string): boolean {
  const key = keyForGamepadAction(action);
  if (key === null) return false;

  // The first press of a session arrives with focus nowhere. `gamepadconnected`
  // is what activates the engine for a controller user, and Chrome does not
  // fire it until a button is actually pressed — so B3's entry point ran for
  // this route while the engine was still dormant, and no further route change
  // is coming to give it a second try. Spend the press on landing somewhere
  // rather than on a move with no origin, which would do nothing at all.
  //
  // Not for Back, which is about leaving rather than arriving.
  if (key !== "Escape" && needsEntryPoint()) {
    focusEntryPoint();
    return true;
  }

  const target = pressTarget();
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);

  // The default action the browser will not run for us. Only when nothing
  // claimed the press: a hand-rolled control and A9's activation both announce
  // themselves by preventing default, and clicking on top of either fires the
  // action twice.
  if (
    key === "Enter" &&
    !event.defaultPrevented &&
    target !== document.body &&
    !ownsKeyboardInput(target) &&
    isNativelyActivatable(target)
  ) {
    target.click();
  }

  return true;
}
