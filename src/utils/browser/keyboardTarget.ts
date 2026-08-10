/**
 * Shared "should this key reach an app shortcut?" test.
 *
 * Anything binding keys on `document` or `window` needs to step aside while
 * the user is typing. Each handler used to roll its own version of the check
 * — always `nodeName === "INPUT"`, which misses `<textarea>`, `<select>` and
 * rich-text editors.
 */

/**
 * `<input>` types that never accept typed text.
 *
 * Anything not listed here counts as a text field, including types this list
 * predates. That is the conservative default: a new input type is far more
 * likely to accept text than not.
 */
const NON_TEXT_INPUT_TYPES = [
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
];

function asElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function isEditableElement(el: HTMLElement): boolean {
  if (el.nodeName === "TEXTAREA") return true;

  if (el.nodeName === "INPUT") {
    // `.type` is normalised and lowercased by the DOM, and defaults to "text"
    // when the attribute is missing or unrecognised.
    return NON_TEXT_INPUT_TYPES.indexOf((el as HTMLInputElement).type) === -1;
  }

  if (el.isContentEditable) return true;

  // `isContentEditable` isn't implemented in jsdom, and the attribute usually
  // sits on a wrapper rather than on the node that receives the event, so fall
  // back to walking up for it.
  if (el.closest('[contenteditable]:not([contenteditable="false"])')) {
    return true;
  }

  return el.closest('[role="textbox"]') !== null;
}

/**
 * True when the target is a text-entry surface: a text-like `<input>`, a
 * `<textarea>`, a `contenteditable` region, or an ARIA textbox.
 *
 * This is the narrow test — it says "the user is typing", nothing more. Use it
 * where a key would compete with a character being entered.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = asElement(target);
  return el !== null && isEditableElement(el);
}

/**
 * `<input>` types the arrow keys drive the *value* of.
 *
 * Not a guess — each of these is a control where an arrow press changes what
 * the user has entered, so a directional engine acting on the same press would
 * both move focus and edit the value.
 */
const ARROW_DRIVEN_INPUT_TYPES = [
  "range",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
];

/** Which pair of arrows is being asked about. */
export type ArrowAxis = "horizontal" | "vertical";

/**
 * True when the target consumes the arrow keys itself.
 *
 * Sits between the other two predicates, and exists because neither is right
 * for directional navigation:
 *
 * - {@link isEditableTarget} is too narrow. It lets the engine act on a
 *   `<select>` and on `<input type="range">`, both of which the arrows drive
 *   natively — the volume slider would change *and* focus would leave it.
 * - {@link ownsKeyboardInput} is too wide. It covers every `<input>`, so a
 *   D-pad user who lands on a checkbox can never arrow off it again. Being
 *   stranded on a control with no pointer to escape with is worse than any
 *   shortcut conflict.
 *
 * So this asks the only question a directional engine actually cares about:
 * does this element already mean something by ↑↓←→? Checkboxes, radios and
 * buttons do not and stay navigable; text fields do, because the arrows move
 * the caret.
 *
 * `axis` narrows that to the pair actually pressed, and the reason is the same
 * "stranded is worse" argument one paragraph up. A single-line text field is the
 * one control here that owns half the arrows: ← and → move the caret through the
 * value, and ↑ and ↓ have nothing to move it to. Without the distinction,
 * arrowing up into the search bar is the end of the session for anyone holding a
 * remote — the field swallows all four keys and only Back gets out. Multi-line
 * editing keeps all four, because there ↑ and ↓ really do move the caret.
 */
export function ownsArrowKeys(
  target: EventTarget | null,
  axis?: ArrowAxis,
): boolean {
  const el = asElement(target);
  if (el === null) return false;
  if (el.nodeName === "SELECT") return true;
  if (
    el.nodeName === "INPUT" &&
    ARROW_DRIVEN_INPUT_TYPES.indexOf((el as HTMLInputElement).type) !== -1
  ) {
    return true;
  }
  if (!isEditableElement(el)) return false;
  if (axis !== "vertical") return true;
  return el.nodeName !== "INPUT";
}

/**
 * True when the target handles the key press itself, and so a global shortcut
 * must not also act on it.
 *
 * Wider than {@link isEditableTarget}: it covers every `<input>` and `<select>`
 * regardless of type. A range slider isn't a text field, but it does consume
 * the arrow keys — and the player binds ArrowUp/ArrowDown to volume, so
 * without this the two would fire at once on the playback-speed slider.
 */
export function ownsKeyboardInput(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (el === null) return false;
  if (el.nodeName === "INPUT" || el.nodeName === "SELECT") return true;
  return isEditableElement(el);
}
