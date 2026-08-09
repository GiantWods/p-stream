/**
 * Enter/Space activation for elements the browser will not activate itself.
 *
 * `<button>` and `<a href>` already do this natively, and 30-odd places in this
 * app are hand-rolled `[tabindex]` divs that listen for Enter themselves (A9
 * counted seven). Both groups must be left alone: synthesizing a click on top
 * of either fires the action twice, and A9 measured what that looks like — the
 * navbar dropdown opens on the synthesized click and its own handler shuts it
 * again, so pressing OK on a remote appears to do nothing at all.
 *
 * What is left is the group that has a `tabindex`, is not natively activatable,
 * and has no keyboard handler of its own. Those are unreachable without this.
 */

import { ownsKeyboardInput } from "@/utils/browser/keyboardTarget";

import { isNavSkipped } from "./engine";

/**
 * Tags the browser activates on Enter or Space by itself.
 *
 * `a` without `href` is not in fact activatable, but it is also not focusable
 * without a `tabindex`, and if it has one it is a hand-rolled control like any
 * other div — so the anchor case is decided by `href` below rather than here.
 */
const NATIVE_ACTIVATION = [
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "SUMMARY",
  "OPTION",
  "LABEL",
  "AUDIO",
  "VIDEO",
];

/** Whether the browser will fire a click on this element without our help. */
export function isNativelyActivatable(el: Element): boolean {
  if (NATIVE_ACTIVATION.indexOf(el.nodeName) !== -1) return true;
  if (el.nodeName === "A" || el.nodeName === "AREA") {
    return el.hasAttribute("href");
  }
  return false;
}

/**
 * One key press, all the way to a click. Returns whether it synthesized one.
 *
 * **Must be registered bubble-phase**, on `document` or `window`. Every check
 * below except the first is cheap and local; the first one — `defaultPrevented`
 * — is the entire safety mechanism, and in the capture phase it is still false
 * because the element's own handler has not run yet. A9 reproduced that: the
 * same code, capture instead of bubble, double-fires on all seven.
 */
export function handleActivationKeydown(
  event: KeyboardEvent,
  isEnabled: () => boolean,
): boolean {
  // The element handled its own key. This is what A9's fix made every
  // hand-rolled Enter handler in the app announce, and what Headless UI has
  // always done.
  if (event.defaultPrevented) return false;

  if (event.key !== "Enter" && event.key !== " ") return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  // Held OK on a remote is one activation, not a stream of them. Same guard
  // A7 and A9 put on the hand-rolled handlers, for the same reason.
  if (event.repeat) return false;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;

  // A field: Space is a character and Enter submits. Both are the browser's.
  if (ownsKeyboardInput(target)) return false;

  // The player binds Space to play/pause and is not ours to activate into.
  if (isNavSkipped(target)) return false;

  if (isNativelyActivatable(target)) return false;
  if (!target.hasAttribute("tabindex")) return false;

  if (!isEnabled()) return false;

  target.click();

  // Space scrolls the page and Enter can submit an enclosing form. Neither is
  // wanted once this has stood in for the activation.
  event.preventDefault();
  return true;
}
