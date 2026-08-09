import { RefObject, useEffect, useRef } from "react";

import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { useNavigationEnabled } from "@/hooks/useSpatialNavigation";
import { usePlayerStore } from "@/stores/player/store";
import { ownsKeyboardInput } from "@/utils/browser/keyboardTarget";
import { focusCandidate } from "@/utils/navigation/engine";
import { resolveEntryPoint } from "@/utils/navigation/entryPoint";
import {
  canEnterWidgetMode,
  isWidgetEntryKey,
  isWidgetExitKey,
  WIDGET_IDLE_MS,
} from "@/utils/navigation/playerMode";

/**
 * How long to keep trying to put focus on a control after OK is pressed.
 *
 * The controls are behind a Headless UI `Transition`, which unmounts them
 * outright while they are hidden — so the first attempt happens in the commit
 * that reveals them and usually succeeds. The retry is for the ones that are
 * still deciding whether to render at all: the skip button, the next-episode
 * button and the watch-party controls all appear on their own schedule.
 */
const ENTRY_DEADLINE_MS = 500;

/**
 * Widget mode: the player's controls, driven by the arrow keys.
 *
 * Returns whether it is currently on, which `Container.tsx` turns into the
 * attribute swap on the player root. Gated on the same
 * {@link useNavigationEnabled} the engine itself is, so with the preference off
 * and no TV and no gamepad there is no listener and no mode — OK does in the
 * player exactly what it does today, which is nothing.
 *
 * The decision half lives in `utils/navigation/playerMode.ts`. This is the part
 * that owns the listener, where focus lands, and when it gives up.
 */
export function usePlayerWidgetMode(
  containerEl: RefObject<HTMLElement | null>,
): boolean {
  const enabled = useNavigationEnabled();
  const widgetMode = usePlayerStore((s) => s.interface.widgetMode);
  const setWidgetMode = usePlayerStore((s) => s.setWidgetMode);
  const hasOpenOverlay = usePlayerStore((s) => s.interface.hasOpenOverlay);
  const router = useOverlayRouter("");

  // A popout is open: one of the player's own settings views, the episode list,
  // or the details modal. Back closes that before it closes the mode, and a user
  // reading an episode list is not idle.
  const popoutOpen = router.isRouterActive || hasOpenOverlay;
  const active = enabled && widgetMode;

  const stateRef = useRef({ active, popoutOpen, router });
  stateRef.current = { active, popoutOpen, router };

  // Capture phase, which is unusual here and deliberate. Back has to be claimed
  // before `useSpatialNavigation`'s bubble handler decides it means
  // `history.back()` — and that one is registered from `App`, so it is always
  // registered first and would always run first in the bubble phase. Capture is
  // the only ordering that does not depend on which component mounted when.
  useEffect(() => {
    if (!enabled) return;

    const onKeyDownCapture = (event: KeyboardEvent) => {
      const state = stateRef.current;

      if (!state.active) {
        if (!isWidgetEntryKey(event)) return;
        if (ownsKeyboardInput(event.target)) return;
        if (!canEnterWidgetMode()) return;
        event.preventDefault();
        setWidgetMode(true);
        return;
      }

      if (!isWidgetExitKey(event)) return;

      // Claimed either way, including the branch that does nothing below: the
      // press belongs to whatever is on top of the player, and letting it
      // through as well costs the user a route.
      event.preventDefault();
      if (state.router.isRouterActive) {
        state.router.close();
        return;
      }
      if (state.popoutOpen) return;
      setWidgetMode(false);
    };

    document.addEventListener("keydown", onKeyDownCapture, true);
    return () =>
      document.removeEventListener("keydown", onKeyDownCapture, true);
  }, [enabled, setWidgetMode]);

  // Somewhere to land. Without this the mode switches, the controls appear, and
  // focus is still on `<body>` — where the engine has no origin and every arrow
  // does nothing, which looks exactly like the player having frozen.
  useEffect(() => {
    if (!active) return;
    const deadline = Date.now() + ENTRY_DEADLINE_MS;
    let frame: number | null = null;

    const attempt = () => {
      frame = null;
      const root = containerEl.current;
      if (root !== null) {
        const target = resolveEntryPoint(root);
        if (target !== null && focusCandidate(target)) return;
      }
      if (Date.now() >= deadline) return;
      frame = requestAnimationFrame(attempt);
    };

    attempt();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [active, containerEl]);

  // And nowhere to stay. Leaving focus on a control that is fading out keeps a
  // focus ring on screen over the film, and the control unmounts a moment later
  // anyway. Safe to do here because the effect runs after the commit that put
  // `data-nav-skip` back, so B3's focus recovery sees a skipped subtree and
  // leaves the resulting `<body>` focus alone.
  useEffect(() => {
    if (active) return;
    const el = document.activeElement;
    if (el instanceof HTMLElement && containerEl.current?.contains(el)) {
      el.blur();
    }
  }, [active, containerEl]);

  // Silence returns the arrows to transport. Suspended while a popout is up,
  // and re-armed by any key press — including the arrows, which is what keeps
  // it from expiring under someone who is using it.
  useEffect(() => {
    if (!active || popoutOpen) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setWidgetMode(false), WIDGET_IDLE_MS);
    };

    arm();
    document.addEventListener("keydown", arm);
    return () => {
      document.removeEventListener("keydown", arm);
      if (timer) clearTimeout(timer);
    };
  }, [active, popoutOpen, setWidgetMode]);

  // The store outlives the player, so a mode left on would still be on the next
  // time someone opened something.
  useEffect(() => {
    return () => setWidgetMode(false);
  }, [setWidgetMode]);

  return active;
}
