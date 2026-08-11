/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isRouteBackKey } from "./back";
import {
  dispatchGamepadAction,
  isNavigationAction,
  keyForGamepadAction,
} from "./gamepadActions";

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
  // jsdom lays nothing out, and the entry-point resolver drops zero-size
  // elements as invisible.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(RECT);
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([
    RECT,
  ] as unknown as DOMRectList);
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function seen(key: string) {
  const events: KeyboardEvent[] = [];
  const listener = (event: Event) => events.push(event as KeyboardEvent);
  document.addEventListener("keydown", listener);
  return {
    events,
    matching: () => events.filter((e) => e.key === key),
    stop: () => document.removeEventListener("keydown", listener),
  };
}

function button(id: string) {
  const el = document.createElement("button");
  el.id = id;
  el.type = "button";
  document.body.append(el);
  return el;
}

describe("keyForGamepadAction", () => {
  it("maps the four directions and the two buttons everything else needs", () => {
    expect(keyForGamepadAction("navigate-up")).toBe("ArrowUp");
    expect(keyForGamepadAction("navigate-down")).toBe("ArrowDown");
    expect(keyForGamepadAction("navigate-left")).toBe("ArrowLeft");
    expect(keyForGamepadAction("navigate-right")).toBe("ArrowRight");
    expect(keyForGamepadAction("confirm")).toBe("Enter");
    expect(keyForGamepadAction("back")).toBe("Escape");
  });

  // These are the player's, and go to its handler instead.
  it.each([
    "play-pause",
    "skip-forward",
    "skip-backward-30",
    "volume-up",
    "mute",
    "toggle-fullscreen",
    "toggle-captions",
    "next-episode",
  ])("leaves %s alone", (action) => {
    expect(keyForGamepadAction(action)).toBe(null);
    expect(isNavigationAction(action)).toBe(false);
  });
});

describe("dispatchGamepadAction", () => {
  it("declines an action it does not own, without dispatching anything", () => {
    button("a").focus();
    const watch = seen("ArrowUp");

    expect(dispatchGamepadAction("play-pause")).toBe(false);

    expect(watch.events).toEqual([]);
    watch.stop();
  });

  it("dispatches a real, cancellable, bubbling keydown on the focused element", () => {
    const el = button("a");
    el.focus();
    const watch = seen("ArrowRight");

    expect(dispatchGamepadAction("navigate-right")).toBe(true);

    const [event] = watch.matching();
    expect(event).toBeDefined();
    expect(event.cancelable).toBe(true);
    expect(event.target).toBe(el);
    watch.stop();
  });

  // Focus nowhere means no origin, so a move is not a move. The first press of a
  // session is always in that state, because the event that turns the engine on
  // is the same button press.
  it("spends a press with focus nowhere on landing somewhere", () => {
    const el = button("a");
    const watch = seen("ArrowDown");

    expect(dispatchGamepadAction("navigate-down")).toBe(true);

    expect(document.activeElement).toBe(el);
    expect(watch.events).toEqual([]);
    watch.stop();
  });

  // Back is about leaving, and grabbing focus first would swallow the press.
  it("does not claim focus on the way out", () => {
    button("a");
    const watch = seen("Escape");

    expect(dispatchGamepadAction("back")).toBe(true);

    expect(document.activeElement).toBe(document.body);
    expect(watch.matching()).toHaveLength(1);
    watch.stop();
  });

  // B is a Back button, not the Escape key: it dismisses what is open and then
  // leaves the page. `key` is what every dismiss handler in the app listens for,
  // and the code is what earns the route change on top of it.
  it("sends Back as a real back button rather than a bare Escape", () => {
    button("a");
    const watch = seen("Escape");

    dispatchGamepadAction("back");

    const [event] = watch.matching();
    expect(event.key).toBe("Escape");
    expect(isRouteBackKey(event)).toBe(true);
    watch.stop();
  });

  describe("confirm", () => {
    // A synthesized event has `isTrusted: false`, so the browser runs no default
    // action — without this the A button would do nothing on every button and
    // link in the app.
    it("clicks a natively activatable target itself", () => {
      const el = button("a");
      const clicks = vi.fn();
      el.addEventListener("click", clicks);
      el.focus();

      expect(dispatchGamepadAction("confirm")).toBe(true);

      expect(clicks).toHaveBeenCalledTimes(1);
    });

    // A9's activation handles this group and announces itself by preventing
    // default. Clicking on top of it fires the action twice, which is the exact
    // failure A9 measured on the navbar dropdown.
    it("leaves a hand-rolled control to its own handler", () => {
      const el = document.createElement("div");
      el.tabIndex = 0;
      const clicks = vi.fn();
      el.addEventListener("click", clicks);
      el.addEventListener("keydown", (event) => event.preventDefault());
      document.body.append(el);
      el.focus();

      dispatchGamepadAction("confirm");

      expect(clicks).not.toHaveBeenCalled();
    });

    it("does not click a control with no native activation and no handler", () => {
      const el = document.createElement("div");
      el.tabIndex = 0;
      const clicks = vi.fn();
      el.addEventListener("click", clicks);
      document.body.append(el);
      el.focus();

      dispatchGamepadAction("confirm");

      // A9's `handleActivationKeydown` owns this case, and is not mounted here.
      expect(clicks).not.toHaveBeenCalled();
    });

    // Enter in a field submits a form or inserts a newline. Neither is a click.
    it("does not click a text field", () => {
      const el = document.createElement("input");
      el.type = "text";
      const clicks = vi.fn();
      el.addEventListener("click", clicks);
      document.body.append(el);
      el.focus();

      dispatchGamepadAction("confirm");

      expect(clicks).not.toHaveBeenCalled();
    });
  });
});
