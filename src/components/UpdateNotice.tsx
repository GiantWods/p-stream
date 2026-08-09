import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Icon, Icons } from "@/components/Icon";
import { useNoticeStackTop } from "@/components/noticeStack";
import { useAppUpdateCheck } from "@/hooks/useAppUpdateCheck";

export function UpdateNotice() {
  const { t } = useTranslation();
  const { updateAvailable, dismiss } = useAppUpdateCheck();
  const [entered, setEntered] = useState(false);
  const top = useNoticeStackTop(0);

  useEffect(() => {
    if (!updateAvailable) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [updateAvailable]);

  const handleDismiss = () => {
    setEntered(false);
    setTimeout(dismiss, 250);
  };

  const refresh = () => {
   
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.href = url.toString();
  };

  if (!updateAvailable) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[600] flex justify-center px-4"
      style={{
        // On the featured home page the search row now lives inside the nav
        // (see feature/nav-layout) and paints at z-[500], directly under
        // where this toast used to float at a flat 1.25rem from the top --
        // z-[200] put it behind that row, not just visually close to it, so
        // it was fully unclickable there rather than merely crowded. Clearing
        // the navbar's height (see noticeStack.ts) puts it south of the row
        // on every page instead of relying on z-index to fight over the same
        // strip of screen; the z bump to 600 (still under every modal's
        // 999+) is a second line of defence, not the fix itself.
        top,
      }}
    >
      <div
        className={[
          "pointer-events-auto group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/10",
          "bg-[#12141c]/85 px-4 py-3 pr-2 shadow-soft-lg backdrop-blur-xl ring-1 ring-white/5",
          "transition-[transform,opacity] duration-300 ease-out-quint",
          "max-w-[min(30rem,calc(100vw-2rem))]",
          entered ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0",
        ].join(" ")}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(139,92,246,0.18),transparent_70%)]" />

        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] text-white shadow-soft-sm">
          <span className="absolute inset-0 rounded-xl bg-[#8b5cf6]/40 animate-ping" />
          <Icon icon={Icons.RELOAD} className="relative text-lg" />
        </div>

        <div className="relative min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-white">
            {t("updateNotice.title")}
          </p>
          <p className="text-xs leading-snug text-white/60">
            {t("updateNotice.description")}
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="relative flex-shrink-0 rounded-lg bg-[#8b5cf6] px-3 py-1.5 text-xs font-bold text-white transition-[background-color,transform] duration-150 ease-spring hover:-translate-y-0.5 hover:bg-[#7c3aed] active:translate-y-0"
        >
          {t("updateNotice.refresh")}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("updateNotice.dismiss")}
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors duration-150 hover:bg-white/5 hover:text-white/80"
        >
          <Icon icon={Icons.X} className="text-base" />
        </button>
      </div>
    </div>
  );
}
