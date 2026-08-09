/**
 * A stack of elements that currently "own" focus — modals, overlays, the
 * player's settings popouts.
 *
 * Directional navigation has to know where it is allowed to move. Moving out
 * of an open modal is not a navigation bug the user can recover from: the
 * modal is still on screen, still covering everything, and focus is now
 * somewhere behind it. `focus-trap-react` already prevents that, but it keeps
 * the answer to itself. This registry makes the same fact readable without
 * touching focus-trap, which is deliberate — it is armed on a 100ms timer, has
 * its readiness check disabled, and needs an `unhandledrejection` handler to
 * survive a crash inside itself (see `OverlayDisplay.tsx`). Reading from it
 * would inherit all of that.
 *
 * Nothing consumes this yet.
 */

interface ScopeEntry {
  el: HTMLElement;
}

// Entries are wrapper objects rather than bare elements so identity is
// unambiguous: the same element can legitimately be pushed twice (React
// StrictMode double-invokes effects in dev) and each push has to own its own
// release.
const stack: ScopeEntry[] = [];

/**
 * Drops entries whose element has left the document.
 *
 * Every push returns a release function and React calls it, so in principle
 * this never finds anything. It exists because the failure it guards against
 * is both silent and bad: a stale entry would pin navigation inside a subtree
 * that is no longer on screen, with no way out. Falling back to a wider scope
 * is always recoverable, so the registry heals itself rather than trusting
 * that every unmount path ran.
 */
function prune() {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (!stack[i].el.isConnected) stack.splice(i, 1);
  }
}

/**
 * Registers `el` as the innermost focus scope. Returns a release function.
 *
 * The release is idempotent and removes this specific entry wherever it sits
 * in the stack — overlays are independent React subtrees, so there is nothing
 * guaranteeing they unmount in the reverse of the order they mounted.
 */
export function pushScope(el: HTMLElement): () => void {
  const entry: ScopeEntry = { el };
  stack.push(entry);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = stack.indexOf(entry);
    if (index !== -1) stack.splice(index, 1);
  };
}

/** The innermost registered scope, or null when focus is unconstrained. */
export function getActiveScope(): HTMLElement | null {
  prune();
  if (stack.length === 0) return null;
  return stack[stack.length - 1].el;
}

/** Number of live scopes. Exposed for tests and the nav debug probe. */
export function getScopeDepth(): number {
  prune();
  return stack.length;
}
