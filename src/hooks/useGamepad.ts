import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether the user has reached for a controller this session.
 *
 * `gamepadconnected` is the only reliable signal: `navigator.getGamepads()`
 * reports nothing until a button is actually pressed, so the initial read is
 * empty even with a pad plugged in. Which also means the event does mean "the
 * user reached for it", not merely "one is attached".
 *
 * One-way, deliberately. A controller put down for a minute is still the thing
 * the user is holding, and the alternative — some timeout that decides they have
 * stopped — takes the D-pad away mid-session.
 */
export function useGamepadSeen(): boolean {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const onConnected = () => setSeen(true);
    window.addEventListener("gamepadconnected", onConnected);
    return () => window.removeEventListener("gamepadconnected", onConnected);
  }, []);

  return seen;
}

export interface GamepadMapping {
  // D-pad
  dpadUp: string;
  dpadDown: string;
  dpadLeft: string;
  dpadRight: string;
  // Face buttons (Xbox: A/B/X/Y, PS: Cross/Circle/Square/Triangle)
  actionSouth: string; // A / Cross - confirm/play-pause
  actionEast: string; // B / Circle - back
  actionWest: string; // X / Square
  actionNorth: string; // Y / Triangle
  // Bumpers/triggers
  leftBumper: string;
  rightBumper: string;
  leftTrigger: string;
  rightTrigger: string;
  // Special
  start: string;
  select: string;
}

export const DEFAULT_GAMEPAD_MAPPING: GamepadMapping = {
  dpadUp: "navigate-up",
  dpadDown: "navigate-down",
  dpadLeft: "navigate-left",
  dpadRight: "navigate-right",
  actionSouth: "confirm",
  actionEast: "back",
  actionWest: "toggle-fullscreen",
  actionNorth: "toggle-captions",
  leftBumper: "skip-backward",
  rightBumper: "skip-forward",
  leftTrigger: "volume-down",
  rightTrigger: "volume-up",
  start: "play-pause",
  select: "mute",
};

export const DEFAULT_PLAYER_GAMEPAD_MAPPING: GamepadMapping = {
  dpadUp: "volume-up",
  dpadDown: "volume-down",
  dpadLeft: "skip-backward",
  dpadRight: "skip-forward",
  actionSouth: "play-pause",
  actionEast: "back",
  actionWest: "toggle-fullscreen",
  actionNorth: "toggle-captions",
  leftBumper: "previous-episode",
  rightBumper: "next-episode",
  leftTrigger: "skip-backward-30",
  rightTrigger: "skip-forward-30",
  start: "play-pause",
  select: "mute",
};

// Standard gamepad button indices
const BUTTON_MAP = {
  ACTION_SOUTH: 0, // A / Cross
  ACTION_EAST: 1, // B / Circle
  ACTION_WEST: 2, // X / Square
  ACTION_NORTH: 3, // Y / Triangle
  LEFT_BUMPER: 4,
  RIGHT_BUMPER: 5,
  LEFT_TRIGGER: 6,
  RIGHT_TRIGGER: 7,
  SELECT: 8,
  START: 9,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
};

interface GamepadCallbacks {
  onAction: (action: string) => void;
  enabled: boolean;
}

/**
 * The mapping the polling loop should be using right now.
 *
 * Two tables, because the player wants its D-pad on volume and seek while
 * everywhere else wants it moving focus. `saved` is the remap from preferences,
 * which `GamepadControlsModal` writes in full — every button, not just the
 * changed ones — so a plain spread over the player table would drag the general
 * D-pad defaults in with it and undo the whole point. Only entries that differ
 * from the general default are treated as something the user actually asked for,
 * and those do carry into the player: a button deliberately assigned to
 * `confirm` should mean confirm wherever the user is.
 */
export function resolveGamepadMapping(
  saved: Record<string, string>,
  transport: boolean,
): GamepadMapping {
  const keys = Object.keys(DEFAULT_GAMEPAD_MAPPING) as (keyof GamepadMapping)[];
  if (!transport) {
    const general = { ...DEFAULT_GAMEPAD_MAPPING };
    keys.forEach((k) => {
      if (saved[k]) general[k] = saved[k];
    });
    return general;
  }

  const player = { ...DEFAULT_PLAYER_GAMEPAD_MAPPING };
  keys.forEach((k) => {
    if (saved[k] && saved[k] !== DEFAULT_GAMEPAD_MAPPING[k])
      player[k] = saved[k];
  });
  return player;
}

export function useGamepadPolling({ onAction, enabled }: GamepadCallbacks) {
  // Keyed by gamepad index, because a second controller sharing one map
  // corrupts the first's edge detection — pad B releasing a button it never
  // pressed records a falling edge for pad A, and the next real press on pad A
  // reads as "already down" and fires nothing.
  const prevButtonStates = useRef<Record<number, Record<number, boolean>>>({});
  const animFrameRef = useRef<number | null>(null);
  const onActionRef = useRef(onAction);
  const enabledRef = useRef(enabled);
  const mappingRef = useRef<GamepadMapping>(DEFAULT_GAMEPAD_MAPPING);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const setMapping = useCallback((mapping: GamepadMapping) => {
    mappingRef.current = mapping;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const buttonToAction: Record<number, keyof GamepadMapping> = {
      [BUTTON_MAP.ACTION_SOUTH]: "actionSouth",
      [BUTTON_MAP.ACTION_EAST]: "actionEast",
      [BUTTON_MAP.ACTION_WEST]: "actionWest",
      [BUTTON_MAP.ACTION_NORTH]: "actionNorth",
      [BUTTON_MAP.LEFT_BUMPER]: "leftBumper",
      [BUTTON_MAP.RIGHT_BUMPER]: "rightBumper",
      [BUTTON_MAP.LEFT_TRIGGER]: "leftTrigger",
      [BUTTON_MAP.RIGHT_TRIGGER]: "rightTrigger",
      [BUTTON_MAP.SELECT]: "select",
      [BUTTON_MAP.START]: "start",
      [BUTTON_MAP.DPAD_UP]: "dpadUp",
      [BUTTON_MAP.DPAD_DOWN]: "dpadDown",
      [BUTTON_MAP.DPAD_LEFT]: "dpadLeft",
      [BUTTON_MAP.DPAD_RIGHT]: "dpadRight",
    };

    const poll = () => {
      if (!enabledRef.current) return;

      const gamepads = navigator.getGamepads?.();
      if (!gamepads) {
        animFrameRef.current = requestAnimationFrame(poll);
        return;
      }

      const live: Record<number, true> = {};

      for (const gp of gamepads) {
        if (!gp) continue;
        live[gp.index] = true;

        const prev = prevButtonStates.current[gp.index] ?? {};
        prevButtonStates.current[gp.index] = prev;

        for (const [btnIdx, mappingKey] of Object.entries(buttonToAction)) {
          const idx = Number(btnIdx);
          const button = gp.buttons[idx];
          if (!button) continue;

          const isPressed = button.pressed || button.value > 0.5;
          const wasPressed = prev[idx] ?? false;

          // Only fire on button down (not held)
          if (isPressed && !wasPressed) {
            const action = mappingRef.current[mappingKey];
            if (action) {
              onActionRef.current(action);
            }
          }

          prev[idx] = isPressed;
        }
      }

      // A pad unplugged mid-press would otherwise leave that button recorded as
      // down, and whatever reconnects into its slot loses its first press.
      for (const seen of Object.keys(prevButtonStates.current)) {
        if (!live[Number(seen)]) delete prevButtonStates.current[Number(seen)];
      }

      animFrameRef.current = requestAnimationFrame(poll);
    };

    animFrameRef.current = requestAnimationFrame(poll);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [enabled]);

  return { setMapping };
}

export const GAMEPAD_ACTION_LABELS: Record<string, string> = {
  "navigate-up": "Navigate Up",
  "navigate-down": "Navigate Down",
  "navigate-left": "Navigate Left",
  "navigate-right": "Navigate Right",
  confirm: "Confirm / Select",
  back: "Go Back",
  "play-pause": "Play / Pause",
  "skip-forward": "Skip Forward (+10s)",
  "skip-backward": "Skip Backward (-10s)",
  "skip-forward-30": "Skip Forward (+30s)",
  "skip-backward-30": "Skip Backward (-30s)",
  "volume-up": "Volume Up",
  "volume-down": "Volume Down",
  mute: "Mute / Unmute",
  "toggle-fullscreen": "Toggle Fullscreen",
  "toggle-captions": "Toggle Captions",
  "next-episode": "Next Episode",
  "previous-episode": "Previous Episode",
};

export const GAMEPAD_BUTTON_LABELS: Record<
  keyof GamepadMapping,
  { xbox: string; ps: string }
> = {
  dpadUp: { xbox: "D-Pad ↑", ps: "D-Pad ↑" },
  dpadDown: { xbox: "D-Pad ↓", ps: "D-Pad ↓" },
  dpadLeft: { xbox: "D-Pad ←", ps: "D-Pad ←" },
  dpadRight: { xbox: "D-Pad →", ps: "D-Pad →" },
  actionSouth: { xbox: "A", ps: "✕" },
  actionEast: { xbox: "B", ps: "○" },
  actionWest: { xbox: "X", ps: "□" },
  actionNorth: { xbox: "Y", ps: "△" },
  leftBumper: { xbox: "LB", ps: "L1" },
  rightBumper: { xbox: "RB", ps: "R1" },
  leftTrigger: { xbox: "LT", ps: "L2" },
  rightTrigger: { xbox: "RT", ps: "R2" },
  start: { xbox: "Menu", ps: "Options" },
  select: { xbox: "View", ps: "Share" },
};

export const ALL_GAMEPAD_ACTIONS = Object.keys(GAMEPAD_ACTION_LABELS);
