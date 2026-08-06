/* eslint-disable no-console */
import { CaptionListItem } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";

const WYZIE_BASE = "https://sub.wyzie.io/search";

interface WyzieSubtitleEntry {
  id?: string;
  url?: string;
  format?: string;
  encoding?: string;
  display?: string;
  language?: string;
  media?: string;
  isHearingImpaired?: boolean;
  source?: string;
  release?: string;
  releases?: string[];
  flagUrl?: string;
  origin?: string;
}

function readWyzieKey(): string | null {
  const k = usePreferencesStore.getState().wyzieKey;
  if (typeof k !== "string") return null;
  const trimmed = k.trim();
  return trimmed || null;
}

function qualityToken(q: string | null | undefined): string | null {
  if (!q) return null;
  switch (q) {
    case "4k":
      return "2160p";
    case "1080":
      return "1080p";
    case "720":
      return "720p";
    case "480":
      return "480p";
    case "360":
      return "360p";
    default:
      return null;
  }
}

function originFromStream(): string | null {
  const state = usePlayerStore.getState();
  const src = state.source;
  if (!src) return null;
  const url =
    src.type === "file"
      ? (Object.values(src.qualities ?? {}).find((q) => q?.url)?.url ?? "")
      : src.url;
  const lower = url.toLowerCase();
  if (/blu[\W_]?ray|bdrip/.test(lower)) return "BLURAY";
  if (/web[\W_]?dl/.test(lower)) return "WEB-DL";
  if (/webrip/.test(lower)) return "WEBRIP";
  if (/hdtv/.test(lower)) return "HDTV";
  if (/dvdrip|dvd/.test(lower)) return "DVD";
  if (src.type === "hls" || src.type === "dash") return "WEB";
  return null;
}

function collectReleaseTokens(): string[] {
  const tokens = new Set<string>();
  const state = usePlayerStore.getState();
  const q = qualityToken(state.currentQuality ?? null);
  if (q) tokens.add(q);
  const src = state.source;
  if (src) {
    const url =
      src.type === "file"
        ? (Object.values(src.qualities ?? {}).find((qv) => qv?.url)?.url ?? "")
        : src.url;
    const lower = url.toLowerCase();
    for (const tag of ["2160p", "1080p", "720p", "480p", "360p", "hdr", "x265", "x264", "h264", "h265", "10bit", "atmos", "ddp5", "ac3"]) {
      if (lower.includes(tag)) tokens.add(tag);
    }
  }
  return [...tokens];
}

function mapEntries(data: unknown): CaptionListItem[] {
  if (!Array.isArray(data)) return [];
  return (data as WyzieSubtitleEntry[])
    .filter((sub) => typeof sub.url === "string" && sub.url)
    .map((sub) => {
      const fmt = sub.format === "srt" || sub.format === "vtt" ? sub.format : "srt";
      return {
        id: sub.id ?? sub.url!,
        language: sub.language || "unknown",
        url: sub.url!,
        type: fmt,
        needsProxy: false,
        opensubtitles: true,
        display: sub.display,
        media: sub.media,
        isHearingImpaired: sub.isHearingImpaired,
        source: `wyzie ${sub.source === "opensubtitles" ? "opensubs" : sub.source ?? ""}`.trim(),
        encoding: sub.encoding,
        flagUrl: sub.flagUrl,
        release: sub.release,
        releases: sub.releases,
        origin: sub.origin,
      } as CaptionListItem;
    });
}

export async function scrapeWyzieCaptions(
  tmdbId: string | number,
  imdbId: string,
  season?: number,
  episode?: number,
): Promise<CaptionListItem[]> {
  const key = readWyzieKey();
  if (!key) return [];

  const id = imdbId || (tmdbId ? String(tmdbId) : "");
  if (!id) return [];

  const params = new URLSearchParams();
  params.set("id", id);
  params.set("key", key);
  params.set("encoding", "utf-8");
  params.set("source", "all");
  if (season && episode) {
    params.set("season", String(season));
    params.set("episode", String(episode));
  }

  const releaseTokens = collectReleaseTokens();
  if (releaseTokens.length > 0) params.set("release", releaseTokens.join(","));

  const origin = originFromStream();
  if (origin) params.set("origin", origin);

  try {
    const res = await fetch(`${WYZIE_BASE}?${params.toString()}`, { method: "GET" });
    if (!res.ok) {
      console.warn(`Wyzie HTTP ${res.status}`);
      if ((res.status === 400 || res.status === 422) && (params.has("release") || params.has("origin"))) {
        const fallback = new URLSearchParams(params);
        fallback.delete("release");
        fallback.delete("origin");
        const retry = await fetch(`${WYZIE_BASE}?${fallback.toString()}`, { method: "GET" });
        if (!retry.ok) return [];
        const fbData = await retry.json();
        return mapEntries(fbData);
      }
      return [];
    }
    const data = await res.json();
    return mapEntries(data);
  } catch (err) {
    console.error("Error fetching Wyzie subtitles:", err);
    return [];
  }
}
