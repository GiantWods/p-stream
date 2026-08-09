/**
 * Finds the elements directional navigation is allowed to land on.
 *
 * Everything here is deliberately old-Chromium-safe. The TV floor is Chromium
 * 76 (Tizen 6.0) / 79 (webOS 6.0), which rules out `checkVisibility()`
 * (Chromium 105), `:focus-visible` (86), `inert` (102), and `:not()` holding
 * anything more than a single simple selector (88). Everything below is CSS3
 * and DOM Level 2.
 */

/**
 * Elements that can take focus by default, minus the ones that have opted out.
 *
 * `[tabindex="-1"]` is excluded on purpose. Those elements are programmatically
 * focusable but not tabbable, and the difference matters here: `MediaCard`
 * wraps a `tabIndex={-1}` `<Link>` around a `tabIndex={0}` inner element, so
 * treating -1 as a candidate would yield two overlapping candidates per card
 * and let the resolver pick the one that does nothing on Enter.
 *
 * Deliberately not included: `iframe` (focusable, but focus crosses into a
 * document we cannot navigate — Turnstile is the case here), and
 * `audio`/`video[controls]` (the player ships its own controls, and the native
 * ones are not part of the app's navigable surface). Add them when something
 * actually needs them, with a note saying what.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"]):not([type="hidden"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]:not([contenteditable="false"]):not([tabindex="-1"])',
].join(",");

/**
 * Whether `el` is actually on screen and worth moving focus to.
 *
 * Ordered cheapest-first, because this runs once per candidate and
 * `getComputedStyle` is the only call in it that can force a style recalc.
 * `getClientRects()` reads layout, but layout is flushed once for the whole
 * batch and then reused, so the per-element cost is small.
 *
 * Note this does not lead with `offsetParent`, which the usual recipe does and
 * which A6 originally specified. `offsetParent === null` is a proxy for
 * `display: none` that also fires for `position: fixed` elements, so it needs
 * a `getComputedStyle` rescue to stay correct. Measured against both variants
 * across Home, Discover, Search, Bookmarks, Settings and the details modal
 * (`pnpm website:navcount`), all three agree on every candidate and run within
 * noise of each other — 0.7ms over 196 elements on the busiest page. So this
 * is not a performance choice: with nothing to separate them, it is the one
 * without the special case. Worth knowing that the naive form is a latent trap
 * rather than a current bug — nothing focusable in this app is itself fixed
 * today, and the first control that is would silently disappear.
 */
export function isFocusableVisible(el: HTMLElement): boolean {
  // Empty for `display: none` (on the element or any ancestor), for detached
  // nodes, and for content inside a collapsed `<details>`.
  if (el.getClientRects().length === 0) return false;

  // Zero-size elements are focusable but invisible. `OverlayPortal` renders one
  // on purpose — an empty `tabIndex={0}` spacer that exists only to stop
  // focus-trap erroring when a modal has no content yet. Landing on it would
  // look like focus vanishing.
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  // `visibility` inherits, so reading the computed value covers hidden
  // ancestors without walking up the tree. Tested against "visible" rather
  // than against the two hiding values, both because it stays correct if a
  // third is ever added and because Tailwind scans this file for class names:
  // writing the other value as a bare string literal here is enough to add a
  // rule for it to the production stylesheet.
  if (window.getComputedStyle(el).visibility !== "visible") return false;

  return true;
}

/**
 * Every visible focusable inside `scope`, in document order.
 *
 * `scope` is an element for a modal or popout (see `getActiveScope` in
 * `focusScopes.ts`) and the document otherwise. Note that an element scope
 * excludes itself, which is what we want — the scope is a wrapper, not a
 * target.
 */
export function collectFocusables(
  scope: HTMLElement | Document = document,
): HTMLElement[] {
  const nodes = scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const out: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    if (isFocusableVisible(nodes[i])) out.push(nodes[i]);
  }
  return out;
}
