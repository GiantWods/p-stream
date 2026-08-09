import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  resolveGamepadMapping,
  useGamepadPolling,
  useGamepadSeen,
} from "@/hooks/useGamepad";
import { usePreferencesStore } from "@/stores/preferences";
import { noteKeyModality } from "@/utils/browser/inputModality";
import { dispatchGamepadAction } from "@/utils/navigation/gamepadActions";

/**
 * One polling loop for the whole app, and the two consumers that share it.
 *
 * Polling used to live inside the player, which is why the D-pad has never done
 * anything anywhere else — and why `DEFAULT_PLAYER_GAMEPAD_MAPPING` and the
 * saved remap were both dead: nothing ever called `setMapping`. Promoting the
 * loop is most of this file; the rest is deciding which of the two mappings is
 * live, and handing each action to whichever half of the app owns it.
 *
 * A second loop was the obvious alternative and does not work. Both would poll
 * the same pad with their own mapping, so one D-pad press would become a volume
 * change *and* a focus move, and every shared action would fire twice.
 */

type ActionHandler = (action: string) => void;

let playerAction: ActionHandler | null = null;
let transportActive = false;
const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((fn) => fn());
}

function subscribeTransport(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function isTransportActive() {
  return transportActive;
}

/**
 * Registers the player as the owner of the playback actions.
 *
 * `transport` is the mapping question and nothing else: true means the D-pad is
 * volume and seek, false means the player is in B6's widget mode and the arrows
 * belong to the control bar. It is the only part of this that is allowed to
 * cause a re-render — the handler goes through a ref, because the player's
 * `onAction` closes over the current time and so changes on every progress tick.
 */
export function useGamepadPlayerActions(
  onAction: ActionHandler,
  transport: boolean,
) {
  const handlerRef = useRef(onAction);
  handlerRef.current = onAction;

  useEffect(() => {
    playerAction = (action) => handlerRef.current(action);
    return () => {
      playerAction = null;
    };
  }, []);

  useEffect(() => {
    transportActive = transport;
    emit();
    return () => {
      transportActive = false;
      emit();
    };
  }, [transport]);
}

/** Mounts the gamepad adapter. Call once, from `App`. */
export function useGamepadNavigation() {
  const preference = usePreferencesStore((s) => s.enableGamepadControls);
  const saved = usePreferencesStore((s) => s.gamepadMapping);
  const gamepadSeen = useGamepadSeen();

  // Picking up a controller is its own opt-in, the same way `useNavigationEnabled`
  // treats it: the preference is off by default and lives on a settings screen
  // that, on a console browser, is unreachable until the D-pad moves focus. So
  // gating only on the preference means the one input that cannot reach the
  // switch is the one input that needs it thrown.
  //
  // The preference is still worth keeping as a positive: it turns the loop on
  // before any button has been pressed, which is what makes the remap screen
  // mean something to someone setting up in advance.
  const enabled = preference || gamepadSeen;
  const transport = useSyncExternalStore(
    subscribeTransport,
    isTransportActive,
    () => false,
  );

  const mapping = useMemo(
    () => resolveGamepadMapping(saved, transport),
    [saved, transport],
  );

  const onAction = useCallback((action: string) => {
    // A button press is key-like input, and it has to say so or the focus ring
    // stays hidden for anyone who touched a mouse earlier in the session —
    // `gamepadconnected` fires once and cannot carry this on its own.
    noteKeyModality();

    if (dispatchGamepadAction(action)) return;
    playerAction?.(action);
  }, []);

  const { setMapping } = useGamepadPolling({ onAction, enabled });

  useEffect(() => {
    setMapping(mapping);
  }, [mapping, setMapping]);
}
