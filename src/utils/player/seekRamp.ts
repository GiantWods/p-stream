/**
 * How far one arrow press moves the seek bar, given how long it has been held.
 *
 * A fixed step is wrong at both ends: five seconds at a time is unusable for
 * crossing an hour of film, and a minute at a time cannot find the moment you
 * actually meant. Every player solves it the same way — start small, and grow
 * while the key stays down.
 *
 * Ramped on *time held*, not on how many repeat events have arrived. Autorepeat
 * rate is an OS setting on a desktop and a firmware one on a remote, so a
 * count-based ramp would accelerate at a different rate on every device it ran
 * on, and the ones with slow repeat would never reach the top band at all.
 */

/**
 * The bands, as "after this long held, this many seconds per press".
 *
 * The first band is deliberately the same 5 s the arrow keys have always been in
 * the player, so a tap does exactly what a tap used to do and only a hold is new.
 */
const BANDS: { after: number; step: number }[] = [
  { after: 0, step: 5 },
  { after: 1500, step: 15 },
  { after: 3000, step: 30 },
  { after: 5000, step: 60 },
];

/** The largest fraction of a title one press may cross. */
const MAX_FRACTION = 0.05;

/**
 * Seconds to move for a press that has been held for `heldMs`.
 *
 * `duration` caps the step: a minute per press is a reasonable stride through a
 * feature film and an absurd one through a 90-second trailer, where it would
 * turn the whole bar into three stops. Zero or unknown duration means the media
 * has not reported one yet, and then the bands stand on their own.
 */
export function stepForHold(heldMs: number, duration = 0): number {
  let step = BANDS[0].step;
  for (let i = 0; i < BANDS.length; i += 1) {
    if (heldMs >= BANDS[i].after) step = BANDS[i].step;
  }

  if (duration > 0) {
    // Never below a second, or a short title would need hundreds of presses.
    step = Math.min(step, Math.max(1, duration * MAX_FRACTION));
  }

  return step;
}
