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
 * Two things make "the smallest amount" larger than it sounds:
 *
 *   - The viewport step measures against {@link safeViewport}, not against
 *     `innerHeight`. Coming to rest 24px from the top of a page whose nav bar
 *     occupies the first 86px of it means coming to rest underneath the nav bar.
 *   - Along the axis being travelled it keeps a band clear *ahead* of the
 *     element, so the page moves with the selection instead of only when the
 *     selection would otherwise leave the screen. Minimum-scroll is right for the
 *     axis you are not travelling along, and on the axis you are it means the
 *     next row only ever appears at the instant you need it.
 *
 * Scrolling is instant rather than smooth on purpose: the TV floor is Chromium
 * 76, a keypress can arrive before the previous animation finishes, and
 * instant is also the honest answer for `prefers-reduced-motion`.
 */

import { Direction } from "./spatial";
import { safeViewport } from "./obstructions";

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
 * How much of a scroller to keep clear beyond the element, along the axis being
 * travelled, as a fraction of that scroller's own size.
 *
 * A quarter puts a focused row at about three quarters of the way down the
 * screen while travelling down, which is roughly one row of lookahead at this
 * app's card sizes and is the shape every TV interface settles on. It is also
 * the smallest value that guarantees the *next* candidate in the direction of
 * travel is on screen before the key that reaches it is pressed, which is what
 * makes the move look like it was aimed rather than discovered.
 */
const LOOKAHEAD = 0.25;

/**
 * The smallest scroll delta along one axis that puts `[min, max]` inside
 * `[boundsMin, boundsMax]`, keeping the given margins clear of each edge. 0 when
 * it already is.
 *
 * `marginMax` defaults to `marginMin`, so the symmetric two-margin call is still
 * the plain "keep it off both edges" one. Asymmetry is how lookahead is
 * expressed: a large margin on the edge being travelled towards.
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
  marginMin = EDGE_MARGIN,
  marginMax = marginMin,
): number {
  let low = marginMin;
  let high = marginMax;

  // Lookahead is a comfort, not a constraint. An element too big for the band it
  // asked for gets the bare edge margin back before anything else is decided —
  // otherwise a tall card would be shoved off the far edge to satisfy a margin
  // that only existed to show what is coming next.
  if (max - min > boundsMax - boundsMin - low - high) {
    low = Math.min(low, EDGE_MARGIN);
    high = Math.min(high, EDGE_MARGIN);
  }

  const leadingGap = min - (boundsMin + low);
  const trailingGap = max - (boundsMax - high);

  // Wider than the space it has to fit in. Chasing both edges would flip the
  // scroller back and forth on every keypress, so align the leading edge and
  // let the far end overflow — that is the end the user is reading away from.
  if (max - min > boundsMax - boundsMin - low - high) return leadingGap;

  if (leadingGap < 0) return leadingGap;
  if (trailingGap > 0) return trailingGap;
  return 0;
}

/**
 * The two margins for one axis, given which way along it the move is going.
 *
 * `null` is "not this axis" and gets the symmetric pair — that is the orthogonal
 * axis of any move, and every caller that has no direction at all.
 */
function axisMargins(
  size: number,
  towardsMax: boolean | null,
  margin: number,
): [number, number] {
  if (towardsMax === null) return [margin, margin];
  const band = Math.max(margin, size * LOOKAHEAD);
  return towardsMax ? [margin, band] : [band, margin];
}

/** Whether `direction` travels towards the high end of each axis, or is not on it. */
function axisSense(direction: Direction | undefined) {
  if (direction === undefined) return { x: null, y: null };
  return {
    x: direction === "right" ? true : direction === "left" ? false : null,
    y: direction === "down" ? true : direction === "up" ? false : null,
  };
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
export function scrollIntoViewport(
  el: HTMLElement,
  direction?: Direction,
  margin = EDGE_MARGIN,
) {
  const sense = axisSense(direction);
  let node: HTMLElement | null = el.parentElement;

  while (node && node !== document.body && node !== document.documentElement) {
    const bounds = node.getBoundingClientRect();

    if (scrolls(node, false)) {
      const rect = el.getBoundingClientRect();
      const [top, bottom] = axisMargins(node.clientHeight, sense.y, margin);
      const dy = scrollDelta(
        rect.top,
        rect.bottom,
        bounds.top,
        bounds.bottom,
        top,
        bottom,
      );
      if (dy !== 0) node.scrollTop += dy;
    }
    if (scrolls(node, true)) {
      const rect = el.getBoundingClientRect();
      const [left, right] = axisMargins(node.clientWidth, sense.x, margin);
      const dx = scrollDelta(
        rect.left,
        rect.right,
        bounds.left,
        bounds.right,
        left,
        right,
      );
      if (dx !== 0) node.scrollLeft += dx;
    }

    node = node.parentElement;
  }

  // The viewport last, and only by what is still missing after the scrollers
  // above have done their part. This is the step `scrollIntoView` gets wrong.
  const safe = safeViewport();
  const rect = el.getBoundingClientRect();
  const [left, right] = axisMargins(safe.right - safe.left, sense.x, margin);
  const [top, bottom] = axisMargins(safe.bottom - safe.top, sense.y, margin);
  const dx = scrollDelta(
    rect.left,
    rect.right,
    safe.left,
    safe.right,
    left,
    right,
  );
  const dy = scrollDelta(
    rect.top,
    rect.bottom,
    safe.top,
    safe.bottom,
    top,
    bottom,
  );
  if (dx !== 0 || dy !== 0) window.scrollBy(dx, dy);
}
