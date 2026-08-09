/**
 * Structure the resolver cannot see from rects alone.
 *
 * B1's geometry is correct and still not sufficient, because a rect does not
 * say what a thing *is*. A carousel keeps every item in the DOM with a real
 * position and scrolls by transform, so ~15 of 20 cards sit off-screen with
 * perfectly good geometry; pressing → from card 15 of one row will happily land
 * on card 16 of the row below when that happens to score better, and both are
 * invisible. No distance function fixes that. The row has to say it is a row.
 *
 * Six attributes, all inert HTML. With the engine dormant they are dead
 * characters in a class list — which is what makes them safe to add to
 * components this repo does not own:
 *
 * | Attribute | Effect |
 * |---|---|
 * | `data-nav-row` | left/right confined to descendants; up/down exits |
 * | `data-nav-grid="<cols>"` | both axes confined; up/down moves by row |
 * | `data-nav-scope` | focus scope, same semantics as an overlay |
 * | `data-nav-remember` | re-entering restores the last-focused descendant |
 * | `data-nav-skip` | subtree excluded from candidates (lives in `engine.ts`) |
 * | `data-nav-first` | preferred entry point (also read by `entryPoint.ts`) |
 *
 * This module is DOM-reading but focus-free: nothing here moves focus or
 * collects candidates. It answers questions, and `engine.ts` acts on them.
 */

import { getActiveScope } from "@/utils/browser/focusScopes";

import { Direction } from "./spatial";

const CONTAINER_SELECTOR =
  "[data-nav-row],[data-nav-grid],[data-nav-scope],[data-nav-remember]";

export interface NavContainer {
  el: HTMLElement;
  /**
   * How movement inside is constrained. `"none"` is a container that only
   * remembers — `data-nav-remember` on its own says nothing about geometry.
   */
  kind: "row" | "grid" | "none";
  /** Declared column count, or null on a grid that did not give a usable one. */
  columns: number | null;
  remembers: boolean;
  /** A hard boundary: focus may not leave, exactly like an open overlay. */
  isScope: boolean;
}

/**
 * Reads `data-nav-grid`. Null unless it is a positive integer.
 *
 * A grid whose column count is missing, zero, or `"auto"` still confines both
 * axes — it just falls back to geometry inside, which is the same thing an
 * unannotated grid does today. Refusing to treat it as a container at all would
 * turn a typo into a navigation change somewhere else on the page.
 */
function parseColumns(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return null;
  return value;
}

/** The container `el` declares itself to be, or null if it declares none. */
export function readContainer(el: HTMLElement): NavContainer | null {
  const isGrid = el.hasAttribute("data-nav-grid");
  const isRow = el.hasAttribute("data-nav-row");
  const isScope = el.hasAttribute("data-nav-scope");
  const remembers = el.hasAttribute("data-nav-remember");
  if (!isGrid && !isRow && !isScope && !remembers) return null;

  let kind: NavContainer["kind"] = "none";
  if (isGrid) kind = "grid";
  else if (isRow) kind = "row";

  return {
    el,
    kind,
    columns: isGrid ? parseColumns(el.getAttribute("data-nav-grid")) : null,
    remembers,
    isScope,
  };
}

/**
 * Every container `origin` sits inside, innermost first, stopping at `root`.
 *
 * Innermost first because that is the order they are tried in: a card inside a
 * row inside a grid should exhaust the row before the grid gets a say.
 */
export function containerChain(
  origin: HTMLElement,
  root: HTMLElement | Document = document,
): NavContainer[] {
  const out: NavContainer[] = [];
  let node = origin.closest<HTMLElement>(CONTAINER_SELECTOR);

  while (node !== null) {
    if (root instanceof HTMLElement && !root.contains(node)) break;

    const container = readContainer(node);
    if (container !== null) out.push(container);
    if (node === root) break;

    const parent: HTMLElement | null = node.parentElement;
    node =
      parent === null ? null : parent.closest<HTMLElement>(CONTAINER_SELECTOR);
  }

  return out;
}

/**
 * The outer bound on where a move from `origin` may land.
 *
 * `data-nav-scope` and the overlay stack mean the same thing, so the narrower
 * of the two wins: a settings panel marked as a scope inside an open modal
 * should confine to the panel, and a marked scope on the page behind a modal
 * must not widen anything. When the marked element is not inside the live
 * overlay it is behind it, and the overlay is the answer.
 */
export function resolveSearchRoot(origin: HTMLElement): HTMLElement | Document {
  const overlay = getActiveScope();
  const marked = origin.closest<HTMLElement>("[data-nav-scope]");
  if (marked !== null && (overlay === null || overlay.contains(marked))) {
    return marked;
  }
  return overlay ?? document;
}

/** Whether `container` refuses to let `direction` out of it. */
export function confines(
  container: NavContainer,
  direction: Direction,
): boolean {
  if (container.isScope) return true;
  if (container.kind === "grid") return true;
  if (container.kind === "row") {
    return direction === "left" || direction === "right";
  }
  return false;
}

/**
 * Where `direction` goes from position `index` in a grid of `columns`, as an
 * index into the same list, or null when it leaves the grid.
 *
 * Index arithmetic rather than geometry, because a declared column count is
 * information geometry does not have. It is what makes ↓ from the last row land
 * outside instead of on some card that happens to score well, and what makes →
 * at the end of a row stop instead of wrapping to the start of the next one —
 * wrapping reads as "focus jumped backwards and left" to anyone watching.
 */
export function stepInGrid(
  index: number,
  count: number,
  columns: number,
  direction: Direction,
): number | null {
  const column = index % columns;
  switch (direction) {
    case "right":
      return column === columns - 1 || index + 1 >= count ? null : index + 1;
    case "left":
      return column === 0 ? null : index - 1;
    case "down":
      return index + columns < count ? index + columns : null;
    default:
      return index - columns >= 0 ? index - columns : null;
  }
}

/**
 * The next candidate in document order — the last tier, and the reason
 * containment cannot strand anyone.
 *
 * Geometry-free and admittedly arbitrary: forward for ↓ and →, backward for ↑
 * and ←. It only ever runs after a confining container found nothing and its
 * siblings found nothing too, so the choice is between a move that feels wrong
 * and a key that does nothing at all on a device with no other key to press.
 */
export function stepInDocumentOrder(
  index: number,
  count: number,
  direction: Direction,
): number | null {
  const forward = direction === "down" || direction === "right";
  const next = forward ? index + 1 : index - 1;
  return next >= 0 && next < count ? next : null;
}

/**
 * The last-focused descendant of each `data-nav-remember` container.
 *
 * Weak on purpose. A carousel that unmounts should take its memory with it, and
 * a remembered card that has been replaced by a re-render is exactly the entry
 * this must not hold alive.
 */
const lastFocused = new WeakMap<HTMLElement, HTMLElement>();

/** Records `el` as the way back into every remembering container above it. */
export function rememberDescendant(el: HTMLElement): void {
  const parent = el.parentElement;
  let node =
    parent === null ? null : parent.closest<HTMLElement>("[data-nav-remember]");
  while (node !== null) {
    lastFocused.set(node, el);
    const above: HTMLElement | null = node.parentElement;
    node =
      above === null ? null : above.closest<HTMLElement>("[data-nav-remember]");
  }
}

/** Where focus was last inside `container`, if that element is still there. */
export function recallDescendant(container: HTMLElement): HTMLElement | null {
  const el = lastFocused.get(container);
  if (el === undefined) return null;
  if (!el.isConnected || !container.contains(el)) return null;
  return el;
}

/**
 * Where focus should land when it arrives in `container` from outside, given the
 * candidates inside it, or null to let geometry decide.
 *
 * Memory first, then `data-nav-first`. The order matters on a carousel that has
 * been used before: the marked entry point is where a stranger starts, and
 * overriding someone's actual position with it every time they leave and come
 * back is worse than not marking anything.
 */
export function resolveContainerEntry(
  container: NavContainer,
  inside: readonly HTMLElement[],
): HTMLElement | null {
  if (container.remembers) {
    const remembered = recallDescendant(container.el);
    if (remembered !== null && inside.indexOf(remembered) !== -1) {
      return remembered;
    }
  }

  const first = container.el.querySelector<HTMLElement>("[data-nav-first]");
  if (first !== null) {
    for (let i = 0; i < inside.length; i += 1) {
      if (inside[i] === first || first.contains(inside[i])) return inside[i];
    }
  }

  return null;
}

/**
 * Containers a move from `origin` to `target` enters, outermost first.
 *
 * Outermost first because that is the boundary the user perceives crossing:
 * arrowing down into a carousel is "I am in the carousel now", and its memory
 * should win over that of a row nested inside it.
 */
export function crossedContainers(
  origin: HTMLElement,
  target: HTMLElement,
): NavContainer[] {
  const out: NavContainer[] = [];
  let node = target.closest<HTMLElement>(CONTAINER_SELECTOR);

  while (node !== null) {
    if (node.contains(origin)) break;
    const container = readContainer(node);
    if (container !== null) out.push(container);
    const parent: HTMLElement | null = node.parentElement;
    node =
      parent === null ? null : parent.closest<HTMLElement>(CONTAINER_SELECTOR);
  }

  return out.reverse();
}
