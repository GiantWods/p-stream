/**
 * Bring a newly focused element into view without moving anything that did not
 * need to move.
 *
 * `Element.scrollIntoView()` is the obvious call and is wrong here. It walks
 * every scrollable ancestor *including the viewport* and applies its own
 * alignment to each, so focusing an item two pixels below the fold of a
 * carousel also re-centres the page. That is the standard cause of "the whole
 * thing jumped", and on a TV — where every keypress moves focus — it makes the
 * app feel like it is lurching.
 *
 * This walks the same ancestors and adjusts each one per axis by the smallest
 * amount that brings the element inside, then does the viewport last. An
 * ancestor already showing the element is left completely alone.
 *
 * Scrolling is instant rather than smooth on purpose: the TV floor is Chromium
 * 76, a keypress can arrive before the previous animation finishes, and
 * instant is also the honest answer for `prefers-reduced-motion`.
 */

/**
 * Breathing room, in px, kept between the element and the edge it is nearest.
 *
 * Without it a focused item ends up flush against the edge of its scroller,
 * which reads as "this is the last one" when it is not — and on a TV the focus
 * ring itself is drawn outside the border box, so a flush item has its ring
 * clipped.
 */
const EDGE_MARGIN = 24;

/**
 * The smallest scroll delta along one axis that puts `[min, max]` inside
 * `[boundsMin, boundsMax]`, keeping `margin` clear of both edges. 0 when it
 * already is.
 *
 * Exported for its own tests: this is all of the arithmetic, and testing it
 * through the DOM would mean asserting on scroll positions jsdom does not
 * really have.
 */
export function scrollDelta(
  min: number,
  max: number,
  boundsMin: number,
  boundsMax: number,
  margin = EDGE_MARGIN,
): number {
  const leadingGap = min - (boundsMin + margin);
  const trailingGap = max - (boundsMax - margin);

  // Wider than the space it has to fit in. Chasing both edges would flip the
  // scroller back and forth on every keypress, so align the leading edge and
  // let the far end overflow — that is the end the user is reading away from.
  if (max - min > boundsMax - boundsMin - margin * 2) return leadingGap;

  if (leadingGap < 0) return leadingGap;
  if (trailingGap > 0) return trailingGap;
  return 0;
}

function scrolls(el: Element, horizontal: boolean): boolean {
  const style = window.getComputedStyle(el);
  const overflow = horizontal ? style.overflowX : style.overflowY;
  if (overflow !== "auto" && overflow !== "scroll") return false;
  return horizontal
    ? el.scrollWidth > el.clientWidth
    : el.scrollHeight > el.clientHeight;
}

/**
 * Scrolls the ancestors of `el` the minimum needed to reveal it.
 *
 * Re-reads the element's rect between each adjustment: scrolling an inner
 * carousel changes where the element sits inside the page, so the outer
 * scroller has to be measured against the new position rather than the one the
 * walk started with.
 */
export function scrollIntoViewport(el: HTMLElement, margin = EDGE_MARGIN) {
  let node: HTMLElement | null = el.parentElement;

  while (node && node !== document.body && node !== document.documentElement) {
    const bounds = node.getBoundingClientRect();

    if (scrolls(node, false)) {
      const rect = el.getBoundingClientRect();
      const dy = scrollDelta(
        rect.top,
        rect.bottom,
        bounds.top,
        bounds.bottom,
        margin,
      );
      if (dy !== 0) node.scrollTop += dy;
    }
    if (scrolls(node, true)) {
      const rect = el.getBoundingClientRect();
      const dx = scrollDelta(
        rect.left,
        rect.right,
        bounds.left,
        bounds.right,
        margin,
      );
      if (dx !== 0) node.scrollLeft += dx;
    }

    node = node.parentElement;
  }

  // The viewport last, and only by what is still missing after the scrollers
  // above have done their part. This is the step `scrollIntoView` gets wrong.
  const rect = el.getBoundingClientRect();
  const dx = scrollDelta(rect.left, rect.right, 0, window.innerWidth, margin);
  const dy = scrollDelta(rect.top, rect.bottom, 0, window.innerHeight, margin);
  if (dx !== 0 || dy !== 0) window.scrollBy(dx, dy);
}
