/* eslint-disable import/no-extraneous-dependencies --
   airbnb's allowed-devDependency globs cover `*.test.js` and `*.test.ts` but
   not `*.test.tsx`, so importing vitest here reads as a stray dependency. */
import { act, useRef } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlayerWidgetMode } from "@/components/player/hooks/usePlayerWidgetMode";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { WIDGET_IDLE_MS } from "@/utils/navigation/playerMode";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The player root, composed exactly as `Container.tsx` composes it.
 *
 * The attribute swap is the whole mechanism, so the harness renders it rather
 * than asserting on the hook's return value alone: `data-nav-skip` is what keeps
 * the controls out of the candidate census in transport mode, and it is also
 * what makes the blur on the way out safe.
 */
function Harness() {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetMode = usePlayerWidgetMode(ref);

  return (
    <div
      ref={ref}
      data-testid="player"
      data-nav-skip={widgetMode ? undefined : ""}
      data-nav-scope={widgetMode ? "" : undefined}
    >
      <button type="button" id="back">
        back
      </button>
      <div data-nav-first>
        <button type="button" id="pause">
          pause
        </button>
      </div>
    </div>
  );
}

let root: Root | null = null;
let host: HTMLDivElement;

function mount() {
  act(() => {
    root = createRoot(host);
    root.render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
  });
}

function unmount() {
  act(() => {
    root?.unmount();
  });
  root = null;
}

function player() {
  return host.querySelector<HTMLElement>("[data-testid=player]");
}

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
}

function isWidgetMode() {
  return usePlayerStore.getState().interface.widgetMode;
}

const RECT = {
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  left: 0,
  top: 0,
  right: 100,
  bottom: 40,
  toJSON: () => ({}),
} as DOMRect;

beforeEach(() => {
  usePreferencesStore.setState({ spatialNavigation: "off" });
  usePlayerStore.setState((s) => {
    s.interface.widgetMode = false;
    s.interface.hasOpenOverlay = false;
  });
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36",
  );
  // jsdom lays nothing out, and `isFocusableVisible` drops zero-size elements
  // — without a rect the control bar has no candidates at all.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(RECT);
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([
    RECT,
  ] as unknown as DOMRectList);

  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  if (root) unmount();
  document.body.innerHTML = "";
  usePreferencesStore.setState({ spatialNavigation: "off" });
  usePlayerStore.setState((s) => {
    s.interface.widgetMode = false;
    s.interface.hasOpenOverlay = false;
  });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("transport mode", () => {
  // The default, and the only state the existing player is ever in. Pressing OK
  // in it has to keep doing nothing, and the root has to keep saying "stay out".
  it("is what the player mounts in, with the preference off", () => {
    mount();

    expect(player()!.hasAttribute("data-nav-skip")).toBe(true);
    expect(player()!.hasAttribute("data-nav-scope")).toBe(false);
  });

  it("does not switch on OK while dormant", () => {
    mount();

    const event = press("Enter");

    expect(isWidgetMode()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it("attaches no listener at all while dormant", () => {
    const onDocument = vi.spyOn(document, "addEventListener");
    mount();

    expect(
      onDocument.mock.calls.filter(([type]) => type === "keydown"),
    ).toEqual([]);
  });
});

describe("widget mode", () => {
  beforeEach(() => {
    usePreferencesStore.setState({ spatialNavigation: "on" });
  });

  it("opens on OK, and swaps the skip for a scope", () => {
    mount();

    const event = press("Enter");

    expect(isWidgetMode()).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(player()!.hasAttribute("data-nav-skip")).toBe(false);
    expect(player()!.hasAttribute("data-nav-scope")).toBe(true);
  });

  // The mode with focus still on `<body>` is a player where every arrow does
  // nothing, which is indistinguishable from a frozen page.
  it("puts focus on the marked control", () => {
    mount();
    press("Enter");

    expect(document.activeElement?.id).toBe("pause");
  });

  it("closes on Back, and does not let the press go on to cost a route", () => {
    mount();
    press("Enter");

    const event = press("Escape");

    expect(isWidgetMode()).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(player()!.hasAttribute("data-nav-skip")).toBe(true);
  });

  // Focus left on a control leaves a ring on screen over the film, and the
  // control unmounts a frame later anyway.
  it("takes focus off the controls on the way out", () => {
    mount();
    press("Enter");
    expect(document.activeElement?.id).toBe("pause");

    press("Escape");

    expect(document.activeElement).toBe(document.body);
  });

  // One press per layer. The popout is what Back means while it is open.
  it("closes a popout before it closes the mode", () => {
    mount();
    press("Enter");
    act(() => {
      usePlayerStore.setState((s) => {
        s.interface.hasOpenOverlay = true;
      });
    });

    const event = press("Escape");

    expect(isWidgetMode()).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not re-enter on OK once it is already on", () => {
    mount();
    press("Enter");

    const event = press("Enter");

    expect(isWidgetMode()).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it("falls back to transport after a stretch of silence", () => {
    vi.useFakeTimers();
    mount();
    press("Enter");

    act(() => {
      vi.advanceTimersByTime(WIDGET_IDLE_MS + 1);
    });

    expect(isWidgetMode()).toBe(false);
  });

  it("is re-armed by any key press, including the arrows it is being used with", () => {
    vi.useFakeTimers();
    mount();
    press("Enter");

    act(() => {
      vi.advanceTimersByTime(WIDGET_IDLE_MS - 100);
    });
    press("ArrowRight");
    act(() => {
      vi.advanceTimersByTime(WIDGET_IDLE_MS - 100);
    });

    expect(isWidgetMode()).toBe(true);
  });

  // Reading an episode list is not idleness.
  it("does not time out while a popout is open", () => {
    vi.useFakeTimers();
    mount();
    press("Enter");
    // Two acts, not one: the timer has to be disarmed by the commit that opens
    // the popout, and inside a single act the clock would advance before React
    // had run the effect.
    act(() => {
      usePlayerStore.setState((s) => {
        s.interface.hasOpenOverlay = true;
      });
    });
    act(() => {
      vi.advanceTimersByTime(WIDGET_IDLE_MS * 3);
    });

    expect(isWidgetMode()).toBe(true);
  });

  // The player store is a module-level singleton, so a mode left on would still
  // be on the next time anyone opened anything.
  it("resets when the player unmounts", () => {
    mount();
    press("Enter");
    expect(isWidgetMode()).toBe(true);

    unmount();

    expect(isWidgetMode()).toBe(false);
  });

  // Nothing turns the engine off mid-session today, but the preference can be
  // flipped, and half a mode is worse than either.
  it("collapses back to transport if the engine is turned off under it", () => {
    mount();
    press("Enter");

    act(() => {
      usePreferencesStore.setState({ spatialNavigation: "off" });
    });

    expect(player()!.hasAttribute("data-nav-skip")).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });
});
