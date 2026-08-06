import { ReactNode } from "react";

import { PageTitle } from "@/pages/parts/util/PageTitle";

import { SubPageLayout } from "./layouts/SubPageLayout";

const ANDROID_APK_DOWNLOAD_URL = "https://apps.fontaine.lol/ZStream-Android.apk";
const WINDOWS_APP_DOWNLOAD_URL = "https://apps.fontaine.lol/zstream-windows.exe";

function WindowsGlyph(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={props.className}
      aria-hidden
    >
      <rect x="2" y="2" width="9" height="9" rx="1.2" />
      <rect x="13" y="2" width="9" height="9" rx="1.2" />
      <rect x="2" y="13" width="9" height="9" rx="1.2" />
      <rect x="13" y="13" width="9" height="9" rx="1.2" />
    </svg>
  );
}

function AppleGlyph(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={props.className}
      aria-hidden
    >
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.912 1.33-1.858 2.66-3.35 2.68-1.46.03-1.93-.86-3.6-.86-1.67 0-2.19.83-3.58.89-1.44.05-2.54-1.44-3.46-2.77-1.87-2.7-3.31-7.66-1.38-11 .95-1.65 2.65-2.7 4.5-2.73 1.4-.02 2.72.94 3.58.94.86 0 2.47-1.16 4.16-.99.71.03 2.7.29 3.98 2.17-.1.06-2.38 1.39-2.35 4.15.03 3.29 2.9 4.39 2.94 4.4z" />
    </svg>
  );
}

function AndroidGlyph(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={props.className}
      aria-hidden
    >
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-1.44-.65-3.06-1.01-4.47-1.01-1.41 0-3.03.36-4.47 1.01L5.65 5.67c-.18-.28-.54-.37-.83-.22-.3.16-.42.54-.26.85L6.4 9.48C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  );
}

interface AppPanel {
  key: string;
  glyph: (className?: string) => ReactNode;
  title: string;
  tagline: string;
  bullets: string[];
  cta: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledLabel?: string;
}

function Bullet(props: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-white/60">
      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#a78bfa]" />
      <span>{props.children}</span>
    </li>
  );
}

function Panel(props: AppPanel) {
  return (
    <div className="group relative flex h-full flex-col rounded-3xl border border-white/[0.07] bg-white/[0.02] p-8 backdrop-blur-sm transition-[transform,border-color,background-color,box-shadow] duration-300 ease-out-quint hover:-translate-y-1.5 hover:border-white/[0.14] hover:bg-white/[0.04] hover:shadow-soft-lg">
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(120%_100%_at_50%_0%,rgba(130,136,254,0.10),transparent_60%)] opacity-0 transition-opacity duration-500 ease-out-quint group-hover:opacity-100" />

      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5a62eb] to-[#292d86] text-white shadow-soft-md transition-transform duration-300 ease-spring group-hover:scale-105 group-hover:-rotate-3">
        {props.glyph("h-7 w-7")}
      </div>

      <h3 className="relative mt-6 text-xl font-bold text-white">
        {props.title}
      </h3>
      <p className="relative mt-2 text-sm leading-relaxed text-white/50">
        {props.tagline}
      </p>

      <ul className="relative mt-6 flex flex-col gap-2.5">
        {props.bullets.map((b) => (
          <Bullet key={b}>{b}</Bullet>
        ))}
      </ul>

      <div className="relative mt-8 flex-1" />

      {props.disabled ? (
        <span className="relative flex items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/35">
          {props.disabledLabel ?? "coming soon"}
        </span>
      ) : (
        <button
          type="button"
          onClick={props.onClick}
          className="relative flex items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-3 text-sm font-bold text-white transition-transform duration-300 ease-spring hover:scale-[1.03] active:scale-[0.97]"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-[#8288fe] to-[#5a62eb] transition-transform duration-500 ease-out-quint group-hover:scale-105" />
          <span className="relative">{props.cta}</span>
        </button>
      )}
    </div>
  );
}

export function AppsPage() {
  const panels: AppPanel[] = [
    {
      key: "windows",
      glyph: (c) => <WindowsGlyph className={c} />,
      title: "Windows",
      tagline: "the native desktop app, built for comfort.",
      bullets: [
        "native player, better sources, extra features",
        "auto-updates built right in",
        "distributed to our community first",
      ],
      cta: "download for Windows",
      onClick: () => window.open(WINDOWS_APP_DOWNLOAD_URL, "_blank"),
    },
    {
      key: "android",
      glyph: (c) => <AndroidGlyph className={c} />,
      title: "Android & TV",
      tagline: "one APK for phones, tablets, and the big screen.",
      bullets: [
        "works on Android TV and Google TV",
        "supports HDR, better sources, and more",
        "new builds published on GitHub",
      ],
      cta: "download APK",
      onClick: () => window.open(ANDROID_APK_DOWNLOAD_URL, "_blank"),
    },
    {
      key: "ios",
      glyph: (c) => <AppleGlyph className={c} />,
      title: "iOS",
      tagline: "in the works, the same experience, on your Apple devices.",
      bullets: [
        "currently in development",
        "announcements go out on Discord",
        "no sign-up needed, just watch this page",
      ],
      cta: "",
      disabled: true,
      disabledLabel: "coming soon",
    },
  ];

  return (
    <SubPageLayout>
      <PageTitle k="global.pages.apps" subpage />

      <div className="mx-auto max-w-5xl px-6 pb-32 pt-4 sm:px-8">
        <div className="text-center">
          <h1 className="mx-auto max-w-2xl text-4xl font-black leading-[1.1] text-white sm:text-5xl">
            Z-Stream, on{" "}
            <span className="bg-gradient-to-r from-[#aaafff] via-[#c084fc] to-[#8288fe] bg-clip-text text-transparent">
              every screen
            </span>{" "}
            you own.
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/50">
            one home for movies and shows, wherever you're watching from.
            pick your platform below.
          </p>
        </div>

        <div className="relative mt-16 grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-0">
          <div className="md:pr-6">
            <Panel {...panels[0]} />
          </div>

          <div className="relative md:px-6">
            <div className="absolute inset-y-6 left-0 hidden w-px md:block">
              <div className="h-full w-full bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />
            </div>
            <Panel {...panels[1]} />
          </div>

          <div className="relative md:pl-6">
            <div className="absolute inset-y-6 left-0 hidden w-px md:block">
              <div className="h-full w-full bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />
            </div>
            <Panel {...panels[2]} />
          </div>
        </div>
      </div>
    </SubPageLayout>
  );
}
