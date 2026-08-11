import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { useGamepadSeen } from "@/hooks/useGamepad";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { usePreferencesStore } from "@/stores/preferences";
import { isTvBrowser } from "@/utils/browser/tvBrowser";
import { handleActivationKeydown } from "@/utils/navigation/activation";
import {
  isBackKey,
  resolveBack,
  snapshotBackContext,
  BackContext,
} from "@/utils/navigation/back";
import { rememberDescendant } from "@/utils/navigation/containers";
import { handleDropdownKeydown } from "@/utils/navigation/dropdown";
import {
  handleNavigationKeydown,
  isNavSkipped,
} from "@/utils/navigation/engine";
import {
  focusEntryPoint,
  needsEntryPoint,
} from "@/utils/navigation/entryPoint";
import {
  FocusOrigin,
  recoverFocus,
  rememberFocus,
} from "@/utils/navigation/recovery";

/**
 * How long to keep trying to put focus somewhere on a freshly rendered route.
 *
 * The first frame after a navigation is usually empty — every data-driven page
 * here renders its skeleton first, and the lazy routes render literally nothing
 * until their chunk arrives. One attempt would therefore miss on exactly the
 * pages that matter most. Bounded because the alternative is an observer that
 * can steal focus arbitrarily far into a session, and because a page with
 * nothing focusable after half a second has nothing focusable.
 */
const ENTRY_DEADLINE_MS = 500;

/**
 * Whether directional navigation should be running at all.
 *
 * The stored preference is the gate for everyone who has a choice, and it is
 * off by default. The two overrides below do not consult it, because on those
 * inputs there is nothing to opt in with:
 *
 * - **A television.** No pointer and no Tab key; the settings screen that
 *   holds the preference is itself unreachable without arrows.
 * - **A gamepad.** Same problem the moment someone picks up a controller, and
 *   `gamepadconnected` is the only reliable signal — `navigator.getGamepads()`
 *   reports nothing until the user presses a button, so the initial read is
 *   empty even with a controller plugged in.
 *
 * Both are one-way. Nothing here turns the engine back off, because a TV does
 * not stop being a TV and a controller put down for a minute is still the
 * thing the user is holding.
 */
export function useNavigationEnabled(): boolean {
  const preference = usePreferencesStore((s) => s.spatialNavigation);
  const gamepadSeen = useGamepadSeen();

  return preference === "on" || gamepadSeen || isTvBrowser();
}

/**
 * Mounts the directional navigation engine. Call once, from `App`.
 *
 * With the engine dormant there is no listener at all, rather than a listener
 * that returns early — so "the preference is off" and "this code was never
 * merged" are the same thing from the outside, which is the only version of
 * this that is safe to put in front of the existing website.
 */
export function useSpatialNavigation() {
  const enabled = useNavigationEnabled();
  const location = useLocation();
  const getTopModal = useOverlayStack((s) => s.getTopModal);

  // Read through a ref so flipping the preference does not detach and
  // reattach the listener on a path where it stays enabled either way.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;
    const isEnabled = () => enabledRef.current;

    const onWindowKeyDown = (event: KeyboardEvent) => {
      handleNavigationKeydown(event, isEnabled);
    };

    // Two things that are only answerable before the event reaches React.
    //
    // The back context is what the bubble phase will not be able to see any
    // more: the global Escape handler is registered before this one and has
    // already emptied the modal stack by then. See `back.ts`. A dropdown's
    // arrow keys are the same problem one layer down — Headless UI opens the
    // menu from a React prop, so by the bubble phase it is already open.
    let backContext: BackContext = snapshotBackContext(false);
    const onCaptureKeyDown = (event: KeyboardEvent) => {
      if (handleDropdownKeydown(event, isEnabled)) return;
      if (isBackKey(event)) {
        backContext = snapshotBackContext(getTopModal() !== null);
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (handleActivationKeydown(event, isEnabled)) return;
      if (!isBackKey(event)) return;
      if (!isEnabled()) return;

      // The player owns its own Escape (exit fullscreen, close a popout) and
      // must not also lose a route.
      if (event.target instanceof Element && isNavSkipped(event.target)) return;

      if (resolveBack(event, backContext) === "history") {
        window.history.back();
      }
    };

    // Bubble phase, so anything with an opinion about this key has already
    // had it — the engine checks `defaultPrevented` and stands down. For
    // activation that is not a preference but a requirement: see A9.
    //
    // Note this does *not* protect against the player, whose own `window`
    // listener registers later than this one and therefore runs after it. The
    // player root carries `data-nav-skip` for that reason; ordering between
    // two `window` listeners is registration order, which is not something to
    // build a guarantee on.
    window.addEventListener("keydown", onWindowKeyDown);
    document.addEventListener("keydown", onCaptureKeyDown, true);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      document.removeEventListener("keydown", onCaptureKeyDown, true);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [enabled, getTopModal]);

  // Focus recovery. `focusout` fires while the outgoing element is still
  // connected, which is the only moment its position in the tree can be read;
  // whether it survives is a question for the next frame.
  useEffect(() => {
    if (!enabled) return;
    let frame: number | null = null;

    const onFocusOut = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (isNavSkipped(target)) return;

      const origin: FocusOrigin = rememberFocus(target);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        // Focus moved somewhere real — a normal Tab press, or a click. Only an
        // element that vanished leaves it on `<body>`.
        if (!needsEntryPoint()) return;
        recoverFocus(origin);
      });
    };

    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusout", onFocusOut);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  // Focus memory for `data-nav-remember`. `focusCandidate` already records its
  // own moves; this is the other half — a click or a Tab press is just as much
  // "where I was in this carousel" as an arrow key is, and a container that only
  // remembers arrow-key visits sends the user back to a stale card.
  useEffect(() => {
    if (!enabled) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) rememberDescendant(target);
    };

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [enabled]);

  // Route entry points. Only ever acts when focus is nowhere, so a navigation
  // triggered from a control the user is still on does not yank them off it.
  useEffect(() => {
    if (!enabled) return;
    const deadline = Date.now() + ENTRY_DEADLINE_MS;
    let frame: number | null = null;

    const attempt = () => {
      frame = null;
      if (!needsEntryPoint()) return;
      if (focusEntryPoint()) return;
      if (Date.now() >= deadline) return;
      frame = requestAnimationFrame(attempt);
    };

    frame = requestAnimationFrame(attempt);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled, location.pathname]);
}
