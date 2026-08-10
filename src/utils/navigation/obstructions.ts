/**
 * The chrome that floats over the page, and the two things the engine owes it.
 *
 * A `position: fixed` bar is in the layout twice over: it occupies a band of the
 * viewport permanently, and it sits at whatever document position the current
 * scroll offset puts it at. Geometry reads the second one, which is why the nav
 * bar can end up looking like the nearest thing above a card — the overlap is an
 * artifact of the scroll offset and does not exist in the flow the user sees.
 *
 * Reconstructing that flow is not possible: a fixed element has no in-flow
 * position to read, and `rect.top + scrollY` just puts it back under the
 * viewport's top edge. So this does the reachable thing instead and treats the
 * chrome as a *layer*:
 *
 *   - {@link layerOf} lets the resolver prefer candidates in the layer focus is
 *     already in, so a vertical move through a fixed bar's y band goes to the
 *     row behind it rather than into the bar. The bar stays reachable, because
 *     "prefer" is not "exclude" — it wins once the page has nothing left to
 *     offer in that direction, which is exactly the top of the page.
 *   - {@link safeViewport} keeps a focused element from being parked underneath
 *     it, which is what put a card in the bar's y band in the first place.
 *
 * `data-nav-obstruct` is declared rather than sniffed. `getComputedStyle` per
 * candidate is a style read on a surface with 199 of them, and "is this chrome"
 * is a question the component can answer and a rect cannot: an absolutely
 * positioned overlay inside a card is not chrome, and a `position: sticky`
 * sidebar that occupies real flow space is not either.
 */

const OBSTRUCT_SELECTOR = "[data-nav-obstruct]";

/**
 * The layer `el` belongs to — a marked ancestor, or null for the page itself.
 *
 * Compared by identity, so nothing needs to name a layer. Two controls in the
 * same bar share it; a card and a bar button do not.
 */
export function layerOf(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>(OBSTRUCT_SELECTOR);
}

/** The viewport, minus the bands the chrome is sitting on. */
export interface ViewportBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Whether `gap` — the distance from an obstruction to a viewport edge — is small
 * enough that the strip between the two is not worth anything.
 *
 * Measured against the obstruction's own size along that axis rather than a
 * constant, because that is the thing being asked: a 45px pill floating 16px off
 * the bottom leaves nowhere useful under it, while a 95px notice 172px down from
 * the top has the whole space above it still in play. Anything that does not
 * reach an edge contributes no inset at all — there is no scroll position that
 * clears an obstruction stranded in the middle of the screen, and pretending
 * otherwise would inset the viewport to nothing.
 */
function hugsEdge(gap: number, size: number): boolean {
  return gap < size;
}

/**
 * Where a focused element is allowed to come to rest.
 *
 * Each obstruction insets one axis: the one it is thin along, measured as a
 * fraction of the viewport rather than in px so that the comparison holds at any
 * size. A full-width bar is thin vertically and takes a top or bottom inset; a
 * sidebar is thin horizontally and takes a left or right one. Without that split
 * a bar spanning the full width would hug the left edge and the right edge too,
 * and inset the viewport to nothing.
 *
 * Insets are taken per edge and the largest wins, so two bars stacked at the top
 * give one inset below both. Note that a small centred obstruction insets the
 * whole edge rather than the columns it covers: scrolling is one number per axis,
 * so there is no narrower answer available, and the cost of the coarse one is
 * that focus stops a few px earlier than it strictly had to.
 */
export function safeViewport(): ViewportBounds {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const bounds: ViewportBounds = {
    top: 0,
    right: width,
    bottom: height,
    left: 0,
  };

  const nodes = document.querySelectorAll<HTMLElement>(OBSTRUCT_SELECTOR);
  for (let i = 0; i < nodes.length; i += 1) {
    const rect = nodes[i].getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    if (rect.height / height <= rect.width / width) {
      if (hugsEdge(rect.top, rect.height)) {
        bounds.top = Math.max(bounds.top, rect.bottom);
      }
      if (hugsEdge(height - rect.bottom, rect.height)) {
        bounds.bottom = Math.min(bounds.bottom, rect.top);
      }
    } else {
      if (hugsEdge(rect.left, rect.width)) {
        bounds.left = Math.max(bounds.left, rect.right);
      }
      if (hugsEdge(width - rect.right, rect.width)) {
        bounds.right = Math.min(bounds.right, rect.left);
      }
    }
  }

  return bounds;
}
