/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getInputModality,
  initInputModality,
  noteKeyModality,
} from "./inputModality";

let teardown: () => void;

const modality = () =>
  document.documentElement.getAttribute("data-input-modality");

function press(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", init));
}

beforeEach(() => {
  teardown = initInputModality();
});

afterEach(() => {
  teardown();
});

describe("initInputModality", () => {
  it("publishes nothing until the user does something", () => {
    expect(modality()).toBe(null);
    expect(getInputModality()).toBe(null);
  });

  it("switches on real key presses and on pointer presses", () => {
    press({ key: "Tab" });
    expect(modality()).toBe("key");

    document.dispatchEvent(new Event("pointerdown"));
    expect(modality()).toBe("pointer");

    press({ key: "ArrowDown" });
    expect(modality()).toBe("key");
  });

  // Holding Shift swaps the player's fullscreen button for widescreen. That
  // must not light up every focus ring on the page.
  it("ignores modifiers pressed on their own", () => {
    document.dispatchEvent(new Event("pointerdown"));

    press({ key: "Shift", shiftKey: true });
    press({ key: "Control", ctrlKey: true });
    press({ key: "Alt", altKey: true });
    press({ key: "Meta", metaKey: true });

    expect(modality()).toBe("pointer");
  });

  it("ignores browser and OS shortcuts", () => {
    document.dispatchEvent(new Event("pointerdown"));

    press({ key: "r", ctrlKey: true });
    press({ key: "Tab", altKey: true });
    press({ key: "l", metaKey: true });

    expect(modality()).toBe("pointer");
  });

  it("counts a gamepad as keys, so the ring shows up", () => {
    document.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("gamepadconnected"));
    expect(modality()).toBe("key");
  });

  // `gamepadconnected` fires once per controller per session, so a polling
  // loop needs its own way to say "that was the D-pad".
  it("lets a gamepad poller re-assert keys after the mouse", () => {
    window.dispatchEvent(new Event("gamepadconnected"));
    document.dispatchEvent(new Event("pointerdown"));
    expect(modality()).toBe("pointer");

    noteKeyModality();
    expect(modality()).toBe("key");
    expect(getInputModality()).toBe("key");
  });

  it("stops tracking and clears up after teardown", () => {
    press({ key: "Tab" });
    expect(modality()).toBe("key");

    teardown();
    expect(modality()).toBe(null);

    document.dispatchEvent(new Event("pointerdown"));
    expect(modality()).toBe(null);

    // afterEach calls teardown again; make it a no-op rather than a throw
    teardown = () => {};
  });
});
