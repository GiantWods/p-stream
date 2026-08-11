/**
 * Directional navigation, wired to real keys and real elements.
 *
 * B1's resolver is pure geometry. This is the part that reads the DOM, decides
 * whether it is allowed to act at all, and commits the move. It is deliberately
 * framework-free — `hooks/useSpatialNavigation.ts` owns mounting and the
 * activation preference, and everything here is callable from a test with no
 * React in the room.
 *
 * The engine is dormant by default. On the website the arrow keys scroll the
 * page today, and taking that away from people who never asked for it is the
 * single most likely way to break the app for its existing users.
 */

import { collectFocusables } from "@/utils/browser/focusables";
import { ownsArrowKeys } from "@/utils/browser/keyboardTarget";

import {
  confines,
  containerChain,
  crossedContainers,
  NavContainer,
  rememberDescendant,
  resolveContainerEntry,
  resolveSearchRoot,
  stepInDocumentOrder,
  stepInGrid,
} from "./containers";
import { layerOf } from "./obstructions";
import { scrollIntoViewport } from "./scrollIntoViewport";
import { Direction, NavRect, pickCandidate } from "./spatial";

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/**
 * Which way this key press means, if any.
 *
 * Any modifier disqualifies it. Alt+← is the browser's Back on Windows and
 * Linux, Shift+↑ extends a selection, and Ctrl/Cmd+↓ is a scroll or a system
 * gesture depending on the platform. Hijacking a chord we did not mean to bind
 * is indistinguishable from the app being broken.
 */
export function directionForKey(event: KeyboardEvent): Direction | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }
  return KEY_DIRECTIONS[event.key] ?? null;
}

/**
 * Whether `el` sits inside a subtree that has opted out of navigation.
 *
 * Part of the `data-nav-*` vocabulary in `containers.ts`, but it lives here
 * because it is the one hint the candidate census itself needs: a closing
 * overlay keeps its controls in the DOM for ~200 ms after it stops owning focus
 * (A11), and the player binds all four arrows to volume and seek.
 */
export function isNavSkipped(el: Element): boolean {
  return el.closest("[data-nav-skip]") !== null;
}

/**
 * Everywhere focus is allowed to land inside `scope`, in document order.
 *
 * Wraps A6's `collectFocusables` rather than extending it. That function
 * answers "what is focusable", which is what the candidate census and
 * `MediaCard`'s tests want, and it should keep answering exactly that.
 * `data-nav-skip` is navigation *policy* — the player's controls are still
 * focusable, they are just not somewhere this engine may send you.
 */
export function collectNavigationCandidates(
  scope: HTMLElement | Document = document,
): HTMLElement[] {
  const focusables = collectFocusables(scope);
  const out: HTMLElement[] = [];
  for (let i = 0; i < focusables.length; i += 1) {
    if (!isNavSkipped(focusables[i])) out.push(focusables[i]);
  }
  return out;
}

/**
 * Puts focus on `el` and brings it into view. Returns whether focus landed.
 *
 * `focus()` fails silently on an element the browser will not take — inside a
 * closed `<details>`, or a subtree that went `inert` between collection and now
 * — so the result is checked rather than assumed. Every caller here treats "it
 * did not land" as "do not claim the keypress", which is what keeps a failed
 * move from swallowing the key and freezing the page.
 *
 * `preventScroll` because the scroll is ours to do: see `scrollIntoViewport`,
 * which moves the minimum instead of re-centring every ancestor the way the
 * browser would.
 *
 * `direction` is what the move was, and only affects which side of the element
 * the scroll leaves room on. Callers that are placing focus rather than moving it
 * — a route entry point, focus recovery — have no direction and want the
 * symmetric margin they get by leaving it out.
 */
export function focusCandidate(
  el: HTMLElement,
  direction?: Direction,
): boolean {
  el.focus({ preventScroll: true });
  if (document.activeElement !== el) return false;
  rememberDescendant(el);
  scrollIntoViewport(el, direction);
  return true;
}

/**
 * Reads each element's rect at most once per key press.
 *
 * `moveFocus` can consider the same candidate at three tiers, and the busiest
 * surface here has 199 of them. `getBoundingClientRect` is a layout read; doing
 * them all up front once is the difference between one forced reflow per press
 * and three.
 */
function rectReader(): (el: HTMLElement) => NavRect {
  const cache = new Map<HTMLElement, NavRect>();
  return (el) => {
    const hit = cache.get(el);
    if (hit !== undefined) return hit;
    const rect = el.getBoundingClientRect();
    cache.set(el, rect);
    return rect;
  };
}

/**
 * Where focus lands when a move arrives inside a container it was not in.
 *
 * Geometry has already chosen a target; this is the container's chance to say
 * "not that one, this one" — the remembered card rather than whichever one the
 * cursor happened to line up with, or the marked entry point on a first visit.
 */
function resolveEntry(
  origin: HTMLElement,
  target: HTMLElement,
  candidates: readonly HTMLElement[],
): HTMLElement {
  const crossed = crossedContainers(origin, target);
  for (let i = 0; i < crossed.length; i += 1) {
    const container = crossed[i];
    const inside = candidates.filter((el) => container.el.contains(el));
    const entry = resolveContainerEntry(container, inside);
    if (entry !== null) return entry;
  }
  return target;
}

/** Picks inside one confining container, or null if it has nowhere to offer. */
function pickInside(
  container: NavContainer,
  origin: HTMLElement,
  originRect: NavRect,
  inside: readonly HTMLElement[],
  direction: Direction,
  rectOf: (el: HTMLElement) => NavRect,
): HTMLElement | null {
  const at = inside.indexOf(origin);

  // A declared grid steps by index. Only when the origin is itself one of the
  // grid's candidates, though — focus can sit on a control nested inside a cell,
  // and counting columns from a position that is not on the lattice is nonsense.
  if (container.kind === "grid" && container.columns !== null && at !== -1) {
    const next = stepInGrid(at, inside.length, container.columns, direction);
    return next === null ? null : inside[next];
  }

  const index = pickCandidate(originRect, inside.map(rectOf), direction);
  if (index === null) return null;
  return inside[index] === origin ? null : inside[index];
}

/**
 * Moves focus one step in `direction`. Returns whether it actually moved.
 *
 * The return value is load-bearing: the caller only calls `preventDefault()`
 * when this is true, so a direction with nowhere to go falls through to the
 * browser's native arrow-key scrolling instead of dying silently.
 *
 * Three tiers, in order:
 *
 * 1. **Confining containers**, innermost outwards. Each one that constrains this
 *    axis is searched on its own; a `data-nav-scope` that comes up empty ends
 *    the move, and anything else is escaped past — with its descendants removed
 *    from the tiers below, which is what "escape to the container's siblings"
 *    has to mean if it is to mean anything.
 * 2. **The whole search root** — plain geometry, and on an unannotated page the
 *    only tier that runs. Split by positioning layer: the candidates sharing the
 *    origin's `data-nav-obstruct` ancestor are resolved first, and the rest only
 *    if that found nothing. See the comment at the tier itself.
 * 3. **Document order**, and only if a container was escaped in tier 1.
 *    Containment is the one thing here that can strand focus, so it pays for its
 *    own escape hatch; a page with no hints keeps falling through to native
 *    scrolling instead, exactly as before.
 *
 *    Document order rather than something geometric because it is its own
 *    inverse. → off the end of a row lands on whatever follows the row, and ←
 *    from there lands back on where it came from. The move looks arbitrary, but
 *    the one property that makes an arbitrary move survivable — the opposite key
 *    undoes it — holds by construction, which is not true of any "nearest thing
 *    in roughly that direction" rule.
 */
export function moveFocus(direction: Direction): boolean {
  const active = document.activeElement;

  // No origin, no geometry. Focus sits on `<body>` after a route change or
  // after the focused node unmounts; B3 owns putting it somewhere sensible.
  // Until then, doing nothing leaves native scrolling working, which is the
  // safe way to fail.
  if (!(active instanceof HTMLElement) || active === document.body)
    return false;

  // Focus is somewhere the engine does not govern — inside the player, or in
  // an overlay that is on its way out. Moving it would fling the user
  // somewhere they were not looking.
  if (isNavSkipped(active)) return false;

  const root = resolveSearchRoot(active);
  const candidates = collectNavigationCandidates(root);
  if (candidates.length === 0) return false;

  const rectOf = rectReader();
  const originRect = rectOf(active);
  const commit = (target: HTMLElement): boolean => {
    const entry = resolveEntry(active, target, candidates);
    if (entry === active) return false;
    return focusCandidate(entry, direction);
  };

  // Tier 1. `escaped` is subtracted from every later tier: a container we have
  // already failed inside must not get a second chance to win from outside it,
  // or "escape to the container's siblings" collapses back into plain geometry.
  const escaped: HTMLElement[] = [];
  const survives = (el: HTMLElement) =>
    !escaped.some((container) => container.contains(el));

  const chain = containerChain(active, root);
  for (let i = 0; i < chain.length; i += 1) {
    const container = chain[i];
    if (!confines(container, direction)) continue;

    const inside = candidates.filter((el) => container.el.contains(el));
    const target = pickInside(
      container,
      active,
      originRect,
      // A grid's column arithmetic counts positions, so it gets the container's
      // whole list — dropping an escaped subtree out of the middle of a lattice
      // would shift every index after it. Geometry does not care.
      container.kind === "grid" ? inside : inside.filter(survives),
      direction,
      rectOf,
    );
    if (target !== null) return commit(target);

    // A scope is the overlay contract: focus does not leave, full stop.
    if (container.isScope) return false;
    escaped.push(container.el);
  }

  // Tier 2, in two takes: the layer focus is already in, then everything else.
  //
  // Splitting it is what stops a vertical move ending up in the nav bar. The bar
  // is `fixed`, so a scrolled page puts it in the same y band as a card, and from
  // there it is both overlapping the origin — which §8.4 reads as containment and
  // resolves without consulting distance at all — and closer than the row above,
  // which is off screen. Neither reading is wrong about the rects it was given;
  // the rects are describing two layers as if they were one.
  //
  // The second take is what keeps the bar reachable rather than merely losing:
  // the page runs out of candidates in the direction being travelled exactly at
  // its top edge, which is where up into the chrome is the move the user meant.
  const outside =
    escaped.length === 0 ? candidates : candidates.filter(survives);
  const ownLayer = layerOf(active);
  const takes: HTMLElement[][] = [[], []];
  for (let i = 0; i < outside.length; i += 1) {
    takes[layerOf(outside[i]) === ownLayer ? 0 : 1].push(outside[i]);
  }
  for (let take = 0; take < takes.length; take += 1) {
    const tier = takes[take];
    if (tier.length === 0) continue;
    const index = pickCandidate(originRect, tier.map(rectOf), direction);
    if (index !== null && tier[index] !== active) {
      return commit(tier[index]);
    }
  }

  // Tier 3.
  if (escaped.length === 0) return false;
  const at = candidates.indexOf(active);
  if (at === -1) return false;
  const next = stepInDocumentOrder(at, candidates.length, direction);
  if (next === null) return false;
  return commit(candidates[next]);
}

/**
 * The whole pipeline for one key press. Returns whether the engine took it.
 *
 * Order matters and each step is here for a specific caller:
 *
 * 1. `defaultPrevented` — how Headless UI's `Listbox` keeps ↑/↓ while it is
 *    open. Its handler is a React prop, so it has already run by the time this
 *    sees the event.
 * 2. A direction, unmodified.
 * 3. {@link ownsArrowKeys} — the control means something by this key itself.
 *    Asked per key, so a single-line text field gives back every arrow that has
 *    nowhere to put the caret: ↑ and ↓ always, and ←/→ at the ends of the value.
 *    Swallowing them all is what strands a remote in the search bar.
 * 4. Dormant unless activation says otherwise. Checked after the cheap tests
 *    so a disabled engine costs a property read per arrow press.
 */
export function handleNavigationKeydown(
  event: KeyboardEvent,
  isEnabled: () => boolean,
): boolean {
  if (event.defaultPrevented) return false;

  const direction = directionForKey(event);
  if (direction === null) return false;

  if (ownsArrowKeys(event.target, direction)) return false;
  if (!isEnabled()) return false;

  if (!moveFocus(direction)) return false;

  event.preventDefault();
  return true;
}
