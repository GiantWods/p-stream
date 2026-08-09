/**
 * Tracks whether the user is currently driving the app with a pointer or with
 * keys, and publishes it as `data-input-modality` on `<html>`.
 *
 * This is a hand-rolled `:focus-visible`. That pseudo-class needs Chromium 86,
 * and the TV floor is Chromium 76 (Tizen 6.0) / 79 (webOS 6.0), where the
 * selector fails to parse and the rule using it is dropped whole — so TV users
 * get no focus ring at all and cannot see where they are. An attribute
 * selector works everywhere.
 */

export type InputModality = "pointer" | "key";

const ATTRIBUTE = "data-input-modality";

/**
 * Pressing a modifier on its own isn't navigation — the player uses a Shift
 * hold to swap the fullscreen button, and holding it shouldn't light up focus
 * rings. `:focus-visible` ignores these too.
 */
const MODIFIER_KEYS = ["Shift", "Control", "Alt", "Meta", "AltGraph"];

let current: InputModality | null = null;

function set(modality: InputModality) {
  if (current === modality) return;
  current = modality;
  document.documentElement.setAttribute(ATTRIBUTE, modality);
}

/**
 * The last input the user made, or `null` before they have made any. Left
 * deliberately null until then: on load nothing should be ringed, which is
 * what `:focus-visible` does too.
 */
export function getInputModality(): InputModality | null {
  return current;
}

function handleKeyDown(event: KeyboardEvent) {
  // Browser and OS shortcuts aren't the user navigating the page
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (MODIFIER_KEYS.indexOf(event.key) !== -1) return;
  set("key");
}

function handlePointerDown() {
  set("pointer");
}

function handleGamepad() {
  // Chrome only fires this once a button is actually pressed, so it does mean
  // "the user reached for the controller", not just "one is plugged in".
  set("key");
}

/**
 * Records key-like input from a source that doesn't produce key events — a
 * gamepad button or a D-pad read from a polling loop.
 *
 * `gamepadconnected` fires once per controller per session, so it can't carry
 * this on its own: someone who reaches for a controller, uses the mouse, then
 * picks the controller back up would otherwise navigate with no focus ring.
 *
 * Deliberately not a general `setInputModality`. Nothing should be able to
 * assert `"pointer"` — that is a claim only a real pointer event can make, and
 * a wrong one silently strips the ring off a user who can't see their cursor.
 */
export function noteKeyModality() {
  set("key");
}

/**
 * Starts tracking. Call once, as early as possible. Returns a teardown for
 * tests; the app never needs it.
 */
export function initInputModality(): () => void {
  // Capture phase, so a handler that stops propagation can't leave the
  // attribute stale and strand the ring in the wrong state.
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("pointerdown", handlePointerDown, true);
  window.addEventListener("gamepadconnected", handleGamepad);

  return () => {
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("pointerdown", handlePointerDown, true);
    window.removeEventListener("gamepadconnected", handleGamepad);
    current = null;
    document.documentElement.removeAttribute(ATTRIBUTE);
  };
}
