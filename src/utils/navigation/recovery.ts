/**
 * Putting focus back after the focused element is destroyed under it.
 *
 * Deleting a bookmark, a search re-render, a carousel swapping pages: the
 * element focus was on leaves the DOM and focus silently falls to `<body>`.
 * A mouse user never notices. Someone driving with a D-pad has just lost their
 * place on the page and, since directional navigation needs an origin, has no
 * key left that does anything.
 *
 * The awkward part is that afterwards the element cannot answer where it *was*.
 * React detaches whichever node the removal starts at, so walking up from the
 * element stops there — and when the element itself is that node,
 * `parentElement` is null outright. Everything needed has to be read while it
 * is still connected, which is what {@link rememberFocus} is for.
 */

import { noteKeyModality } from "@/utils/browser/inputModality";

import { collectNavigationCandidates, focusCandidate } from "./engine";
import { focusEntryPoint } from "./entryPoint";
import { NavRect } from "./spatial";

export interface FocusOrigin {
  el: HTMLElement;
  /** Ancestors, innermost first. Read eagerly; unreadable later. */
  chain: HTMLElement[];
  /** Where the element was, for choosing the nearest survivor. */
  rect: NavRect;
}

/** Snapshots everything recovery will need about `el`. Call while connected. */
export function rememberFocus(el: HTMLElement): FocusOrigin {
  const chain: HTMLElement[] = [];
  let node = el.parentElement;
  while (node !== null) {
    chain.push(node);
    node = node.parentElement;
  }
  return { el, chain, rect: el.getBoundingClientRect() };
}

function centreDistance(a: NavRect, b: NavRect): number {
  const dx = (a.left + a.right) / 2 - (b.left + b.right) / 2;
  const dy = (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2;
  return Math.sqrt(dx * dx + dy * dy);
}

/** {@link recoverFocus} minus the ring. Split only so the ring is unmissable. */
function placeFocus(origin: FocusOrigin): boolean {
  // It never left, or something already put focus somewhere valid. Either way
  // this is not a recovery, and moving focus would be the bug.
  if (origin.el.isConnected) return false;

  for (let i = 0; i < origin.chain.length; i += 1) {
    const ancestor = origin.chain[i];
    if (!ancestor.isConnected) continue;

    const candidates = collectNavigationCandidates(ancestor);
    if (candidates.length === 0) continue;

    let best = candidates[0];
    let bestDistance = centreDistance(
      origin.rect,
      best.getBoundingClientRect(),
    );
    for (let j = 1; j < candidates.length; j += 1) {
      const distance = centreDistance(
        origin.rect,
        candidates[j].getBoundingClientRect(),
      );
      if (distance < bestDistance) {
        best = candidates[j];
        bestDistance = distance;
      }
    }

    if (focusCandidate(best)) return true;
  }

  return focusEntryPoint();
}

/**
 * Moves focus to the nearest survivor of `origin`. Returns whether it landed.
 *
 * Widens one ancestor at a time, so a deleted bookmark hands focus to another
 * bookmark before it will consider the page chrome. Within a level the nearest
 * candidate by centre wins — plain euclidean, not B1's directional function,
 * because there is no direction here: the user did not press anything, and the
 * honest answer is "whatever was closest to the thing that vanished".
 *
 * The entry point is the last resort, and returning false after that is a real
 * outcome rather than a failure — an empty page has nowhere to put focus, and
 * leaving it on `<body>` keeps native scrolling working.
 *
 * Landing anywhere also turns the focus ring on. Nothing else can: the ring
 * follows the last input the user made, and clicking a button that then destroys
 * itself — the settings Save bar is the reported case — leaves that reading
 * "pointer", so focus arrives somewhere the user never clicked with nothing to
 * show where. Measured as `outline-style: none` on the recovered control, which
 * is indistinguishable from having lost focus altogether.
 */
export function recoverFocus(origin: FocusOrigin): boolean {
  if (!placeFocus(origin)) return false;
  noteKeyModality();
  return true;
}
