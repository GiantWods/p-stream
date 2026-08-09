/* eslint-disable import/no-extraneous-dependencies --
   airbnb's allowed-devDependency globs cover `*.test.js` and `*.test.ts` but
   not `*.test.tsx`, so importing vitest here reads as a stray dependency. */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OverlayPortal } from "@/components/overlays/OverlayDisplay";
import { getScopeDepth } from "@/utils/browser/focusScopes";
import { collectNavigationCandidates } from "@/utils/navigation/engine";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A5 releases an overlay's focus scope the moment `show` goes false, which is
 * right — a closing overlay does not own focus. The consequence is a window,
 * measured at ~200ms, where the scope is gone and the DOM is not: every
 * control of a modal that is fading out is still a candidate, with nothing
 * left to say it belongs to a dialog. Navigation would walk into it, and B3's
 * focus recovery would do the same while trying to rescue focus. Both look
 * like focus vanishing, which is the hardest kind of bug to attribute.
 */

function place(el: Element, x: number, y: number, w = 100, h = 40) {
  const rect = {
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  } as DOMRect;
  (el as HTMLElement).getBoundingClientRect = () => rect;
  (el as HTMLElement).getClientRects = () => [rect] as unknown as DOMRectList;
}

let root: Root | null = null;
let host: HTMLDivElement;

function render(show: boolean) {
  act(() => {
    root!.render(
      <OverlayPortal show={show}>
        <button type="button">inside the modal</button>
      </OverlayPortal>,
    );
    // Inside `act`, so the portal's own deferred work — the arming timer and
    // the frame Headless UI mounts the wrapper on — lands where React can see
    // it rather than escaping into the next test.
    vi.runOnlyPendingTimers();
  });
}

function wrapper() {
  return document.querySelector(".popout-wrapper");
}

beforeEach(() => {
  // Keeps the portal's 100ms focus-trap arming timer from firing mid-test and
  // updating a component nobody is inside `act` for. Nothing here depends on
  // the trap being armed.
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  act(() => {
    root = createRoot(host);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("OverlayPortal — closing window", () => {
  it("does not mark the wrapper while the overlay is open", () => {
    render(true);

    expect(wrapper()).not.toBeNull();
    expect(wrapper()!.hasAttribute("data-nav-skip")).toBe(false);
    expect(getScopeDepth()).toBe(1);
  });

  /**
   * The invariant that matters, stated so it holds in both environments.
   *
   * jsdom cannot see the window A11 measured. Headless UI's parent Transition
   * waits for its children's leave animations, reads a computed duration of
   * 0ms because jsdom runs no CSS transitions, and tears the wrapper down in
   * the same commit that flips `show`. A real browser holds it for the 200ms
   * slide-up, which is the whole point.
   *
   * So this asserts the thing that is true either way — after close, none of
   * the overlay's controls are candidates — and leaves proving *how* to the
   * browser check recorded in A11.
   */
  it("keeps the dying overlay's controls out of the candidate set", () => {
    render(true);
    const button = document.querySelector(".popout-wrapper button")!;
    place(button, 100, 100);
    place(wrapper()!, 0, 0, 800, 600);

    expect(collectNavigationCandidates()).toContain(button);

    render(false);

    expect(collectNavigationCandidates()).not.toContain(button);
  });

  it("comes back clean when the same overlay opens again", () => {
    render(true);
    render(false);
    render(true);

    expect(wrapper()!.hasAttribute("data-nav-skip")).toBe(false);
    expect(getScopeDepth()).toBe(1);
  });

  // A5's rapid open/close check, re-run because this effect now has a branch
  // that returns without a cleanup. A leaked scope pins navigation inside a
  // subtree that is no longer on screen, with no way out.
  it("settles back to no scopes after five open/close cycles", () => {
    for (let i = 0; i < 5; i += 1) {
      render(true);
      render(false);
    }

    expect(getScopeDepth()).toBe(0);
  });
});
