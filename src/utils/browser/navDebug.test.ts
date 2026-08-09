/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it, vi } from "vitest";

import { isNavDebugEnabled } from "./navDebug";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// This decides whether the probe chunk gets fetched at all, so a regression
// here means shipping a debug overlay to everyone.
describe("isNavDebugEnabled", () => {
  it("is off by default", () => {
    expect(isNavDebugEnabled()).toBe(false);
  });

  it("turns on for ?navdebug=1", () => {
    window.history.replaceState({}, "", "/settings?navdebug=1");
    expect(isNavDebugEnabled()).toBe(true);
  });

  it("stays off for other values and other params", () => {
    window.history.replaceState({}, "", "/?navdebug=0");
    expect(isNavDebugEnabled()).toBe(false);

    window.history.replaceState({}, "", "/?q=navdebug");
    expect(isNavDebugEnabled()).toBe(false);
  });

  // The TV route: no address bar, so the flag is set from the remote inspector.
  it("turns on for the localStorage flag", () => {
    window.localStorage.setItem("navdebug", "1");
    expect(isNavDebugEnabled()).toBe(true);
  });

  it("stays off rather than throwing when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isNavDebugEnabled()).toBe(false);
  });
});
