/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pushScope } from "@/utils/browser/focusScopes";

import { canGoBack, isBackKey, resolveBack, snapshotBackContext } from "./back";

const releases: (() => void)[] = [];

function keydown(init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", {
    key: "Escape",
    cancelable: true,
    ...init,
  });
}

function openScope() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  releases.push(pushScope(el));
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  // Index 0 is "the entry the user arrived on", which is where jsdom starts.
  window.history.replaceState({ idx: 0 }, "");
});

afterEach(() => {
  while (releases.length) releases.pop()!();
  document.body.innerHTML = "";
});

describe("isBackKey", () => {
  it("accepts Escape", () => {
    expect(isBackKey(keydown())).toBe(true);
  });

  it("accepts the Tizen and webOS back codes", () => {
    // These arrive with no usable `event.key` — Tizen reports "Unidentified" —
    // so the code is the only thing left to match on.
    expect(isBackKey(keydown({ key: "Unidentified", keyCode: 10009 }))).toBe(
      true,
    );
    expect(isBackKey(keydown({ key: "Unidentified", keyCode: 461 }))).toBe(
      true,
    );
  });

  it("rejects everything else", () => {
    expect(isBackKey(keydown({ key: "Enter", keyCode: 13 }))).toBe(false);
    expect(isBackKey(keydown({ key: "Backspace", keyCode: 8 }))).toBe(false);
    expect(isBackKey(keydown({ key: "ArrowLeft", keyCode: 37 }))).toBe(false);
  });
});

describe("canGoBack", () => {
  it("is false on the entry the session started on", () => {
    expect(canGoBack()).toBe(false);
  });

  it("is true once the app has navigated", () => {
    window.history.pushState({ idx: 1 }, "");
    expect(canGoBack()).toBe(true);
  });

  it("is false when there is no router state to read", () => {
    // A page the router never stamped. Guessing "yes" here walks the user off
    // the site from a Back button, which on a TV looks like a crash.
    window.history.replaceState(null, "");
    expect(canGoBack()).toBe(false);
  });
});

describe("resolveBack", () => {
  it("defers to the global handler when a modal was open", () => {
    // The discriminating case for the capture-phase snapshot: by the time this
    // runs, the modal is already out of the store.
    const context = snapshotBackContext(true);
    expect(resolveBack(keydown(), context)).toBe("defer");
  });

  it("goes back when nothing is on screen to close", () => {
    window.history.pushState({ idx: 1 }, "");
    expect(resolveBack(keydown(), snapshotBackContext(false))).toBe("history");
  });

  it("stays put on the first history entry", () => {
    expect(resolveBack(keydown(), snapshotBackContext(false))).toBe("none");
  });

  it("stands down on a press something else already handled", () => {
    window.history.pushState({ idx: 1 }, "");
    const event = keydown();
    event.preventDefault();

    expect(resolveBack(event, snapshotBackContext(false))).toBe("none");
  });

  it("stays put while a focus scope is live with no modal behind it", () => {
    // A player popout, or an overlay mid-transition. Changing route under one
    // is not a Back the user asked for.
    window.history.pushState({ idx: 1 }, "");
    openScope();

    expect(resolveBack(keydown(), snapshotBackContext(false))).toBe("none");
  });
});
