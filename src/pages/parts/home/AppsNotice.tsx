import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";

const STORAGE_KEY = "zstream::apps-notice-dismissed";

// Same floating-pill convention as ZliveNotice, stacked directly under it
// (fixed top offset assumes ZliveNotice's own height + a gap -- if
// ZliveNotice is dismissed/absent this one just sits slightly higher than
// it strictly needs to, same tradeoff ZliveNotice itself already accepts).
export function AppsNotice() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;
    const showTimer = setTimeout(() => {
      setVisible(true);
      requestAnimationFrame(() => setEntered(true));
    }, 2200);
    return () => clearTimeout(showTimer);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setEntered(false);
    setTimeout(() => setVisible(false), 250);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(max(1.25rem,env(safe-area-inset-top))_+_9.25rem)] z-[198] flex justify-center px-4">
      <div
        className={[
          "pointer-events-auto group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/10",
          "bg-[#12141c]/85 px-4 py-3 pr-2 shadow-soft-lg backdrop-blur-xl ring-1 ring-white/5",
          "transition-[transform,opacity] duration-300 ease-out-quint",
          "max-w-[min(30rem,calc(100vw-2rem))]",
          entered ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0",
        ].join(" ")}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(130,136,254,0.18),transparent_70%)]" />

        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8288fe] to-[#5a62eb] text-white shadow-soft-sm">
          <span className="absolute inset-0 rounded-xl bg-[#8288fe]/40 animate-ping" />
          <Icon icon={Icons.DOWNLOAD} className="relative text-lg" />
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold leading-tight text-white">
              {t("appsNotice.title")}
            </p>
            <span className="rounded-full bg-white/10 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-white/50">
              {t("appsNotice.badge")}
            </span>
          </div>
          <p className="text-xs leading-snug text-white/60">
            {t("appsNotice.description")}
          </p>
        </div>

        <Link
          to="/apps"
          onClick={dismiss}
          className="relative flex-shrink-0 rounded-lg bg-[#8288fe] px-3 py-1.5 text-xs font-bold text-white transition-[background-color,transform] duration-150 ease-spring hover:-translate-y-0.5 hover:bg-[#5a62eb] active:translate-y-0"
        >
          {t("appsNotice.visit")}
        </Link>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("appsNotice.dismiss")}
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors duration-150 hover:bg-white/5 hover:text-white/80"
        >
          <Icon icon={Icons.X} className="text-base" />
        </button>
      </div>
    </div>
  );
}
