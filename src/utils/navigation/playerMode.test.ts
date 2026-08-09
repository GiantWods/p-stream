/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it } from "vitest";

import {
  canEnterWidgetMode,
  isWidgetEntryKey,
  isWidgetExitKey,
} from "./playerMode";

function key(name: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", { key: name, ...init });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isWidgetEntryKey", () => {
  it("is OK, and OK is Enter", () => {
    expect(isWidgetEntryKey(key("Enter"))).toBe(true);
  });

  // Every one of these is a transport binding the player already owns, and the
  // point of the mode is that they keep working.
  it.each([" ", "k", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "m"])(
    "is not %s",
    (k) => {
      expect(isWidgetEntryKey(key(k))).toBe(false);
    },
  );

  it("is not a chord", () => {
    expect(isWidgetEntryKey(key("Enter", { shiftKey: true }))).toBe(false);
    expect(isWidgetEntryKey(key("Enter", { altKey: true }))).toBe(false);
    expect(isWidgetEntryKey(key("Enter", { ctrlKey: true }))).toBe(false);
    expect(isWidgetEntryKey(key("Enter", { metaKey: true }))).toBe(false);
  });

  // Held OK is one press. Without this the mode would be entered, and its entry
  // point resolved, once per repeat tick.
  it("is not a repeat", () => {
    expect(isWidgetEntryKey(key("Enter", { repeat: true }))).toBe(false);
  });
});

describe("isWidgetExitKey", () => {
  it("is Escape and the two TV back codes", () => {
    expect(isWidgetExitKey(key("Escape"))).toBe(true);
    expect(isWidgetExitKey(key("Unidentified", { keyCode: 10009 }))).toBe(true);
    expect(isWidgetExitKey(key("Unidentified", { keyCode: 461 }))).toBe(true);
  });

  it("is not the key that got us here", () => {
    expect(isWidgetExitKey(key("Enter"))).toBe(false);
  });
});

describe("canEnterWidgetMode", () => {
  // Transport mode leaves focus on `<body>` — there is nothing in the player
  // for it to be on — so this is the state a remote is always in.
  it("allows it when focus is nowhere", () => {
    expect(canEnterWidgetMode()).toBe(true);
  });

  // A mouse user who clicked Pause and then pressed Enter: the button activates
  // on this press by itself, and switching mode as well would make one key do
  // two unrelated things.
  it("refuses when focus is already on a control", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();

    expect(canEnterWidgetMode()).toBe(false);
  });
});
