/**
 * The geometry half of directional navigation: given where focus is and every
 * place it could go, decide where ↑ ↓ ← → lands.
 *
 * This implements the W3C CSS Spatial Navigation Level 1 §8.4 algorithm
 * (https://www.w3.org/TR/css-nav-1/) rather than approximating it. The obvious
 * approximation — pick the nearest centre in roughly the right direction — is
 * the usual reason hand-rolled resolvers never quite converge, because the two
 * terms that fix its failures are the two that get dropped first:
 *
 *   - `alignment` rewards candidates that line up with the origin across the
 *     direction of travel. Without it, pressing ↓ from a card drifts sideways
 *     into whichever neighbour happens to sit a few pixels closer.
 *   - `overlap` handles boxes that intersect the origin. Without it, a wide
 *     element spanning a whole row (a section header, the search bar) reads as
 *     "far away" because its centre is far away, even though its edge is
 *     directly under the cursor.
 *
 * Pure and DOM-free on purpose: no reads, no focus calls, no scrolling. B2 owns
 * all of that. This module can be tested against real captured layouts without
 * a browser, which is what `fixtures/` is for.
 */

export type Direction = "up" | "down" | "left" | "right";

/**
 * The part of `DOMRect` this needs.
 *
 * Structural rather than `DOMRect` itself so callers can pass plain objects: a
 * `DOMRect` cannot be built without a DOM, and the point of this module is
 * that it does not need one. Every `DOMRect` satisfies this.
 */
export interface NavRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Slack for float comparisons. Coordinates arrive from one layout pass, so
 * elements that share an edge share it exactly and this is effectively an
 * exact test; it exists for the *distance* comparison, where two genuinely
 * tied candidates can differ in the last bits of a sum of squares and roots.
 * Distances here run to a few thousand, so 1e-6 absolute is ~1e-10 relative —
 * far above double-precision noise, far below anything a layout produces.
 */
const EPSILON = 1e-6;

/** §8.4: 30 across a horizontal move, 2 across a vertical one. */
const ORTHOGONAL_WEIGHT_HORIZONTAL = 30;
const ORTHOGONAL_WEIGHT_VERTICAL = 2;

/** §8.4: `alignment = alignBias * alignWeight`. */
const ALIGN_WEIGHT = 5;

function isHorizontal(direction: Direction): boolean {
  return direction === "left" || direction === "right";
}

/**
 * Signed gap between two 1-D intervals — positive when `b` is after `a`,
 * negative when before, and exactly 0 when they overlap at all.
 *
 * This is what makes the resolver edge-based rather than centre-based: two
 * boxes that share a column are at distance 0 on the horizontal axis no matter
 * how differently sized they are.
 */
function axisGap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): number {
  if (bMin > aMax) return bMin - aMax;
  if (bMax < aMin) return bMax - aMin;
  return 0;
}

/** Length shared by two 1-D intervals, 0 if they are disjoint. */
function overlapLength(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): number {
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

function intersectionArea(a: NavRect, b: NavRect): number {
  return (
    overlapLength(a.left, a.right, b.left, b.right) *
    overlapLength(a.top, a.bottom, b.top, b.bottom)
  );
}

/**
 * §8.4's distance function, verbatim:
 *
 * ```
 * distance = euclidean + displacement - alignment - sqrt(overlap)
 * ```
 *
 * The spec defines `euclidean` over "the points P1 inside the boundary box of
 * reference and P2 inside the boundary box of candidate that minimize the
 * distance function", which it leaves as an optimisation rather than a
 * formula. It has a closed form. The only point-dependent terms are
 * `euclidean` and the orthogonal component of `displacement`, and both are
 * non-decreasing in |Δx| and in |Δy| separately, while P1 and P2 range
 * independently over two rectangles — so the minimum is at the smallest
 * feasible |Δx| *and* the smallest feasible |Δy|, which is exactly the
 * per-axis gap between the boxes. Hence `axisGap` above, and no search.
 *
 * Exported because a scoring function that can only be observed through its
 * arg-min is hard to test and harder to debug: B2's overlay wants to print it.
 */
export function navigationDistance(
  origin: NavRect,
  candidate: NavRect,
  direction: Direction,
): number {
  const dx = axisGap(
    origin.left,
    origin.right,
    candidate.left,
    candidate.right,
  );
  const dy = axisGap(
    origin.top,
    origin.bottom,
    candidate.top,
    candidate.bottom,
  );
  const euclidean = Math.sqrt(dx * dx + dy * dy);

  const horizontal = isHorizontal(direction);

  // The orthogonal axis is the one you are *not* travelling along, and it is
  // weighted 15x harder across a horizontal move than a vertical one. That
  // asymmetry is deliberate in the spec and matches how layouts read: rows are
  // wide and shallow, so drifting a row while pressing → is a much worse
  // outcome than drifting a column while pressing ↓.
  const orthogonalDistance = Math.abs(horizontal ? dy : dx);
  const orthogonalBias = (horizontal ? origin.height : origin.width) / 2;
  const orthogonalWeight = horizontal
    ? ORTHOGONAL_WEIGHT_HORIZONTAL
    : ORTHOGONAL_WEIGHT_VERTICAL;
  const displacement = (orthogonalDistance + orthogonalBias) * orthogonalWeight;

  // How much of the origin's cross-section the candidate covers, in [0, 1]:
  // a full-width row under a narrow button scores 1, a button off to the side
  // scores 0.
  const projectedOverlap = horizontal
    ? overlapLength(origin.top, origin.bottom, candidate.top, candidate.bottom)
    : overlapLength(origin.left, origin.right, candidate.left, candidate.right);
  const referenceDimension = horizontal ? origin.height : origin.width;
  const alignBias =
    referenceDimension > 0 ? projectedOverlap / referenceDimension : 0;
  const alignment = alignBias * ALIGN_WEIGHT;

  const overlap = intersectionArea(origin, candidate);

  return euclidean + displacement - alignment - Math.sqrt(overlap);
}

/**
 * Whether `candidate`'s leading edge is past the origin's own leading edge —
 * §8.4's test for a candidate that overlaps the search origin.
 *
 * Note this is the *same* edge on both boxes, not opposite ones: pressing ↓
 * onto something that starts lower than you do is a move down even if it also
 * starts before you end.
 */
function advancesLeadingEdge(
  origin: NavRect,
  candidate: NavRect,
  direction: Direction,
): boolean {
  switch (direction) {
    case "down":
      return candidate.top > origin.top + EPSILON;
    case "up":
      return candidate.bottom < origin.bottom - EPSILON;
    case "right":
      return candidate.left > origin.left + EPSILON;
    default:
      return candidate.right < origin.right - EPSILON;
  }
}

/** How far past the origin's leading edge the candidate's leading edge sits. */
function leadingEdgeOffset(
  origin: NavRect,
  candidate: NavRect,
  direction: Direction,
): number {
  switch (direction) {
    case "down":
      return candidate.top - origin.top;
    case "up":
      return origin.bottom - candidate.bottom;
    case "right":
      return candidate.left - origin.left;
    default:
      return origin.right - candidate.right;
  }
}

/**
 * Whether `candidate` is wholly past the origin — §8.4's test for the
 * non-overlapping case, against the *trailing* edge this time.
 */
function isBeyond(
  origin: NavRect,
  candidate: NavRect,
  direction: Direction,
): boolean {
  switch (direction) {
    case "down":
      return candidate.top >= origin.bottom - EPSILON;
    case "up":
      return candidate.bottom <= origin.top + EPSILON;
    case "right":
      return candidate.left >= origin.right - EPSILON;
    default:
      return candidate.right <= origin.left + EPSILON;
  }
}

/**
 * Where focus goes when `direction` is pressed from `origin`, as an index into
 * `candidates`, or `null` when there is nowhere to go.
 *
 * `candidates` is in document order — that is both what `collectFocusables()`
 * returns and what the tie-break depends on. The origin's own rect may be in
 * the list; it can never be chosen, because every test below is strict.
 *
 * §8.4 runs in two passes, and the split matters:
 *
 *   1. **Candidates that intersect the origin.** Decided by which one starts
 *      soonest in `direction`, not by distance — the distance function is
 *      meaningless here, since overlapping boxes have a euclidean term of 0
 *      and an arbitrarily large `sqrt(overlap)` bonus, so the biggest overlap
 *      would win regardless of where it sits. This is the nested case: a card
 *      containing a button, a row containing a card.
 *   2. **Only if there are none**, candidates wholly past the origin, scored
 *      by {@link navigationDistance}.
 *
 * Two deliberate departures from the letter of the spec, both because this
 * takes a raw candidate list where the spec takes a pre-filtered one:
 *
 *   - The spec short-circuits "if candidates contains a single item, return
 *     that item". Safe there, since its caller has already dropped everything
 *     not in `direction`; here it would return a candidate *behind* you on any
 *     page with one focusable left. Not implemented.
 *   - The tie-break is document order only. The spec prefers a tied candidate
 *     that overlaps and paints above, which needs stacking contexts — not
 *     something a rect carries. Reaching a tie at all needs two candidates at
 *     equal distance to 1e-6, which real layouts produce only for boxes that
 *     are also identically placed.
 */
export function pickCandidate(
  origin: NavRect,
  candidates: readonly NavRect[],
  direction: Direction,
): number | null {
  let best: number | null = null;
  let bestScore = Infinity;

  // Pass 1 — overlapping the origin.
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!advancesLeadingEdge(origin, candidate, direction)) continue;
    if (intersectionArea(origin, candidate) <= 0) continue;
    const offset = leadingEdgeOffset(origin, candidate, direction);
    if (offset < bestScore - EPSILON) {
      best = i;
      bestScore = offset;
    }
  }
  if (best !== null) return best;

  // Pass 2 — clear of the origin.
  bestScore = Infinity;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!isBeyond(origin, candidate, direction)) continue;
    const score = navigationDistance(origin, candidate, direction);
    if (score < bestScore - EPSILON) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}
