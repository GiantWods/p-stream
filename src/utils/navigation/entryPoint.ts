/**
 * Where focus goes when it has nowhere to be.
 *
 * React Router does not reset focus on navigation, and neither does anything
 * else here: the focused node unmounts with the old view and `activeElement`
 * falls back to `<body>`. Directional navigation has no origin from there, so
 * without this a route change costs the user a Tab press — and on a remote
 * there is no Tab key to press.
 */

import { collectNavigationCandidates, focusCandidate } from "./engine";

/**
 * The subtree route content lives in.
 *
 * `<main>` wraps the router outlet (`setup/App.tsx`) and nothing else, which is
 * the point: the app's modals are siblings of it, so an entry point resolved
 * inside it can never be a control belonging to a dialog that happens to be
 * mounted. Falls back to the document if the landmark is ever removed —
 * entering somewhere imperfect beats not entering at all.
 */
export function getNavRoot(): HTMLElement | Document {
  return document.querySelector("main") ?? document;
}

/**
 * The best place to enter `root`, or null when there is nowhere.
 *
 * `data-nav-first` (B4's vocabulary) wins when present, and may sit on either a
 * control or a container — marking the carousel is more natural than marking
 * whichever card happens to be first in it. Otherwise the first candidate in
 * document order, which is the same thing Tab would have done.
 */
export function resolveEntryPoint(
  root: HTMLElement | Document = getNavRoot(),
): HTMLElement | null {
  const candidates = collectNavigationCandidates(root);
  if (candidates.length === 0) return null;

  const preferred = root.querySelector<HTMLElement>("[data-nav-first]");
  if (preferred !== null) {
    for (let i = 0; i < candidates.length; i += 1) {
      if (candidates[i] === preferred || preferred.contains(candidates[i])) {
        return candidates[i];
      }
    }
    // Marked but not a candidate: hidden, disabled, or inside a `data-nav-skip`
    // subtree. Fall through rather than refusing to enter.
  }

  return candidates[0];
}

/**
 * Whether focus is currently nowhere useful.
 *
 * Deliberately narrow. Anything focused and connected is left alone, including
 * a control inside the player or a closing overlay — this answers "is focus
 * lost", not "is focus somewhere I would have chosen".
 */
export function needsEntryPoint(): boolean {
  const active = document.activeElement;
  if (active === null) return true;
  if (active === document.body || active === document.documentElement) {
    return true;
  }
  return !active.isConnected;
}

/** Moves focus to the entry point. Returns whether it landed anywhere. */
export function focusEntryPoint(): boolean {
  const target = resolveEntryPoint();
  if (target === null) return false;
  return focusCandidate(target);
}
