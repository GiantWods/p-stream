import { useBannerSize } from "@/stores/banner";

/**
 * Shared positioning for the floating, top-center toast pills (UpdateNotice,
 * ZliveNotice, and any future one) so they stack below the navbar and below
 * each other from one source of truth instead of each hardcoding where the
 * one before it ends. That hardcoding is what broke here: ZliveNotice's own
 * offset assumed UpdateNotice sat at a fixed 1.25rem from the very top, and
 * silently overlapped it the moment UpdateNotice's position changed to clear
 * the navbar (see UpdateNotice's own comment for why that change happened).
 */

// Same navbarHeight=80 convention Settings.tsx and HeroPart.tsx use. These
// toasts are rendered globally, once per app (not once per page), so unlike
// those two they cannot read a real Navigation instance's height -- 80px is
// what every route that has one currently measures.
const NAVBAR_HEIGHT = 80;
const GAP_BELOW_NAVBAR = 16;
// Vertical rhythm between stacked toasts: approximate pill height + a gap.
// Both toasts share the same markup (h-10 icon, py-3 padding), so one number
// works for both; it does not need to track either one exactly since it only
// has to clear the taller of the two.
const TOAST_STACK_STEP = 84;

/** `index` is this toast's position in the stack, 0 = closest to the navbar. */
export function useNoticeStackTop(index: number) {
  const bannerSize = useBannerSize();
  const base = NAVBAR_HEIGHT + GAP_BELOW_NAVBAR + bannerSize;
  const stackOffset = index * TOAST_STACK_STEP;
  return `calc(max(${base}px, env(safe-area-inset-top)) + ${stackOffset}px)`;
}
