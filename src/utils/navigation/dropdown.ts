/**
 * The arrow keys around a dropdown, for input that has nothing but arrow keys.
 *
 * Headless UI's `Listbox` implements the ARIA listbox pattern, where ↑ and ↓ on
 * the closed button open the menu. That is correct for a keyboard and wrong for
 * a D-pad: there the arrows are the only way to travel, so every dropdown on the
 * page is something you fall into on the way past rather than something you
 * chose to open. Measured on `/settings`: focus the language button, press ↓
 * once, and the menu is open with focus inside it.
 *
 * Getting back out is the same bug from the other side. ←/→ mean nothing to a
 * single-column list, so Headless UI ignores them and directional navigation
 * moves focus to whatever sits beside the *open* menu — which stays open,
 * floating over the page, and whose options are then the nearest thing in the
 * direction you came from, so the next press pulls focus straight back in.
 *
 * So: the arrows travel, Enter opens, and ←/→ close the menu and hand focus back
 * to its button. ↑ and ↓ inside an open menu are still the menu's, because that
 * is the one place they have somewhere of their own to go.
 *
 * **Must be registered capture-phase**, on `document`. Headless UI's opener is a
 * React prop, dispatched from React's own listener on the root container — by
 * the time the event bubbles back out to `window`, where the engine listens, the
 * menu is already open. Capture at `document` is the last point that is still
 * before it.
 */

import { directionForKey, isNavSkipped, moveFocus } from "./engine";

/** The wrapper `Dropdown` marks, and the only subtree this applies to. */
const ROOT_SELECTOR = "[data-nav-dropdown]";

/**
 * The button that owns the menu.
 *
 * Headless UI sets this itself, on the real element, in every shape the wrapper
 * can render — including `customButton`, where the props are cloned onto whatever
 * the caller passed. That makes it a more reliable handle than a ref through
 * `as={Fragment}` and a more honest one than a class name.
 */
const TRIGGER_SELECTOR = '[aria-haspopup="listbox"]';

/**
 * One key press around a dropdown. Returns whether it was answered here.
 *
 * `isEnabled` is the same directional-navigation gate the engine uses, and it is
 * deliberately the deciding check: on a desktop keyboard the ARIA pattern is the
 * right behaviour and Tab is still there to leave with, so nothing changes for
 * anyone who did not ask for arrow-key navigation.
 */
export function handleDropdownKeydown(
  event: KeyboardEvent,
  isEnabled: () => boolean,
): boolean {
  if (event.defaultPrevented) return false;

  const target = event.target;
  if (!(target instanceof Element)) return false;
  const root = target.closest<HTMLElement>(ROOT_SELECTOR);
  if (root === null) return false;

  // The player's caption settings use the same wrapper, and in there all four
  // arrows are volume and seek. Swallowing one would lose the press twice over:
  // the menu would not open and the player would not hear it either.
  if (isNavSkipped(target)) return false;

  const direction = directionForKey(event);
  if (direction === null) return false;
  if (!isEnabled()) return false;

  const trigger = root.querySelector<HTMLElement>(TRIGGER_SELECTOR);
  if (trigger === null) return false;

  const open = trigger.getAttribute("aria-expanded") === "true";
  const vertical = direction === "up" || direction === "down";

  // Open, we own ←/→; closed, we own ↑/↓. The other half of each is already
  // right: an open menu drives its active option by ↑/↓, and ←/→ past a closed
  // one is an ordinary move that nothing interferes with.
  if (open ? vertical : !vertical) return false;

  // Ours from here. Stopping propagation is the whole mechanism: it is what keeps
  // Headless UI's opener — and the engine's own listener, further out again —
  // from acting on a press this has already answered.
  event.stopPropagation();

  if (open) {
    event.preventDefault();
    // Closing through the button's own click is closing the way the component
    // already closes, focus hand-back included, rather than a second exit to
    // keep in step with the first.
    trigger.click();
    return true;
  }

  // Exactly what the engine would have done with this press, had it been allowed
  // to see it. A move with nowhere to go stays unclaimed, so the arrow still
  // scrolls the page natively.
  if (!moveFocus(direction)) return false;
  event.preventDefault();
  return true;
}
