/* eslint-disable import/no-extraneous-dependencies --
   airbnb's allowed-devDependency globs cover `*.test.js` and `*.test.ts` but
   not `*.test.tsx`, so importing vitest here reads as a stray dependency. The
   .ts tests in this repo lint clean without this. */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaCard, MediaCardSkeleton } from "@/components/media/MediaCard";
import { WatchedMediaCard } from "@/components/media/WatchedMediaCard";
import { usePreferencesStore } from "@/stores/preferences";
import { FOCUSABLE_SELECTOR } from "@/utils/browser/focusables";
import { MediaItem } from "@/utils/media/mediaTypes";

import "@/setup/i18n";

/**
 * A card's keyboard behaviour is split across two elements — focus on the
 * inner styled element, navigation on the outer <Link> — and nothing about
 * that split is visible to a mouse. These tests exist so that breaking it
 * fails here rather than in someone's hands.
 *
 * Rendered with `createRoot` directly. There is no testing-library in this
 * project and adding one for two tests is not worth a dependency.
 */

// What testing-library would otherwise set for us. Without it React warns on
// every `act` call that the environment does not support it.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const MOVIE: MediaItem = {
  id: "603",
  title: "The Matrix",
  poster: "/poster.png",
  type: "movie",
  year: 1999,
};

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement) {
  act(() => {
    root.render(<MemoryRouter>{node}</MemoryRouter>);
  });
}

/** The element the card puts focus on, per the contract in `MediaCard.tsx`. */
function focusHost(): HTMLElement {
  const host = container.querySelector<HTMLElement>('[tabindex="0"]');
  if (!host) throw new Error("card has no focusable host");
  return host;
}

/** Returns whether the card marked the event as handled. */
function pressEnter(el: HTMLElement, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    el.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

beforeEach(() => {
  // jsdom has no IntersectionObserver, and the card lazy-loads its poster
  // through one.
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn(() => ({
      observe: () => {},
      unobserve: () => {},
      disconnect: () => {},
    })),
  );
  usePreferencesStore.setState({
    enableMinimalCards: false,
    enableDetailsModal: false,
    // Skips the Flare light layer, which only adds a mousemove listener and
    // some absolutely positioned divs.
    enableLowPerformanceMode: true,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("MediaCard skeleton", () => {
  it("contributes no focus candidates", () => {
    render(<MediaCardSkeleton />);
    expect(container.querySelectorAll(FOCUSABLE_SELECTOR)).toHaveLength(0);
  });

  it("contributes no focus candidates through forceSkeleton either", () => {
    // The path every carousel uses while its data is in flight. A skeleton
    // that could take focus would lose it moments later, because the carousels
    // replace the whole skeleton array with a differently keyed one.
    render(<MediaCard linkable media={MOVIE} forceSkeleton />);
    expect(container.querySelectorAll(FOCUSABLE_SELECTOR)).toHaveLength(0);
  });
});

describe("MediaCard keyboard activation", () => {
  it("keeps the navigating link out of the tab order", () => {
    render(<MediaCard linkable media={MOVIE} />);
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("tabindex")).toBe("-1");
    expect(link!.matches(FOCUSABLE_SELECTOR)).toBe(false);
  });

  it("puts focus on the styled element inside the link, not the link", () => {
    render(<MediaCard linkable media={MOVIE} />);
    const host = focusHost();
    expect(host.closest("a")).not.toBeNull();
    // The group class is what the hover styling and the focus mirror are
    // written against, so focus has to land on the element carrying it.
    expect(host.classList.contains("group")).toBe(true);
  });

  it("activates the link when Enter is pressed on the focus host", () => {
    render(<MediaCard linkable media={MOVIE} />);
    const link = container.querySelector("a")!;
    const clicks = vi.fn();
    link.addEventListener("click", clicks);

    pressEnter(focusHost());

    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it("activates once for a held Enter, not once per repeat", () => {
    render(<MediaCard linkable media={MOVIE} />);
    const link = container.querySelector("a")!;
    const clicks = vi.fn();
    link.addEventListener("click", clicks);

    const host = focusHost();
    pressEnter(host);
    // What a remote or a keyboard sends while the key stays down.
    pressEnter(host, { repeat: true });
    pressEnter(host, { repeat: true });

    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it("marks the Enter it handled, and only that one", () => {
    // Directional navigation activates a focused [tabindex] element by
    // synthesizing a click. This is how it can tell the card got there first
    // and skip it, rather than activating the card twice.
    render(<MediaCard linkable media={MOVIE} />);
    const host = focusHost();

    expect(pressEnter(host)).toBe(true);
    expect(pressEnter(host, { repeat: true })).toBe(false);
  });

  it("ignores keys other than Enter", () => {
    render(<MediaCard linkable media={MOVIE} />);
    const link = container.querySelector("a")!;
    const clicks = vi.fn();
    link.addEventListener("click", clicks);

    act(() => {
      focusHost().dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    expect(clicks).not.toHaveBeenCalled();
  });

  it("does not offer a card that cannot be linked as a focus candidate", () => {
    // Unreleased media renders as a card but goes nowhere, so the card itself
    // is not a target. Its "more info" button still is.
    render(<MediaCard linkable media={{ ...MOVIE, year: 2999 }} />);
    expect(container.querySelector('[tabindex="0"]')).toBeNull();
  });
});

/**
 * A card is two candidates, not one: the ellipsis sits inside the card's own
 * rect, at its bottom edge. Geometry therefore hands it every → and every ↓
 * pressed from the card, in every grid and carousel in the app. The cell
 * declares one column so that sideways skips it and vertical reaches it.
 */
describe("MediaCard as a navigation cell", () => {
  function cell(): HTMLElement {
    const el = container.querySelector<HTMLElement>('[data-nav-grid="1"]');
    if (!el) throw new Error("card is not marked as a navigation cell");
    return el;
  }

  it("declares one column around both of its candidates", () => {
    render(<MediaCard linkable media={MOVIE} onShowDetails={() => {}} />);
    const candidates = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );

    expect(candidates).toHaveLength(2);
    expect(candidates.every((el) => cell().contains(el))).toBe(true);
  });

  it("marks the cell on a card that cannot be linked too", () => {
    // Only one candidate here, and the arithmetic has to survive that: a single
    // column of one has nowhere to go in any direction, which is correct.
    render(<MediaCard linkable media={{ ...MOVIE, year: 2999 }} />);
    expect(cell().querySelectorAll(FOCUSABLE_SELECTOR)).toHaveLength(1);
  });
});

/**
 * dnd-kit puts `tabIndex={0}` and `role="button"` on its draggable node so that
 * a keyboard sensor has something to grab. BookmarksGrid registers
 * `PointerSensor` alone, so there is no keyboard drag to grab it with — and the
 * node wraps the card, so it is the one focus reaches first. Every card in the
 * app carried a focus stop that did nothing when activated.
 */
describe("WatchedMediaCard", () => {
  it("adds no focus stop of its own around the card", () => {
    render(<WatchedMediaCard media={MOVIE} onShowDetails={() => {}} />);
    const candidates = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );

    expect(candidates).toHaveLength(2);
    // Whatever the wrapper is, it is not one of them, and it is not announced
    // as a control either.
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.matches(FOCUSABLE_SELECTOR)).toBe(false);
    expect(wrapper.getAttribute("role")).toBeNull();
  });
});
