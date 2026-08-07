import {
  FullScraperEvents,
  RunOutput,
  ScrapeMedia,
  Stream,
} from "@p-stream/providers";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { prepareStream } from "@/backend/extension/streams";
import { getCachedMetadata } from "@/backend/helpers/providerApi";
import { getProviders } from "@/backend/providers/providers";
import { getMediaKey } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { createM3U8ProxyUrl } from "@/components/player/utils/proxy";

export interface ScrapingItems {
  id: string;
  children: string[];
}

export interface ScrapingSegment {
  name: string;
  id: string;
  embedId?: string;
  status: "failure" | "pending" | "notfound" | "success" | "waiting";
  reason?: string;
  error?: any;
  percentage: number;
}

const sourceQualityScore: Record<string, number> = {
  unknown: 0,
  "360": 360,
  "480": 480,
  "720": 720,
  "1080": 1080,
  "4k": 2160,
};

const minimumResolutionThreshold: Record<
  "none" | "720" | "1080" | "4k",
  number
> = {
  none: 0,
  "720": 720,
  "1080": 1080,
  "4k": 2160,
};

// cache measured hls resolution per playlist so we don't refetch on every pass
const hlsResolutionCache = new Map<string, number | null>();
const HLS_RESOLUTION_FETCH_TIMEOUT = 5000;

function cacheHlsResolution(
  playlist: string,
  score: number | null,
): number | null {
  hlsResolutionCache.set(playlist, score);
  if (hlsResolutionCache.size > 100) {
    const oldest = hlsResolutionCache.keys().next().value;
    if (oldest !== undefined) hlsResolutionCache.delete(oldest);
  }
  return score;
}

// map an hls level height to the same resolution score used for file sources
function resolutionScoreFromHeight(height: number): number {
  if (height >= 1800) return 2160; // 4k class
  if (height >= 800) return 1080;
  if (height >= 600) return 720;
  if (height >= 420) return 480;
  return 360;
}

// read the max RESOLUTION from an hls master playlist so we actually know if a
// source is 4k. only returns a real score when we can prove it - if the fetch
// or parse fails we return null (never a false "this is 4k").
async function getHlsStreamResolutionScore(
  stream: Stream,
): Promise<number | null> {
  const playlist = stream.type === "hls" ? stream.playlist : undefined;
  if (!playlist) return null;
  if (hlsResolutionCache.has(playlist))
    return hlsResolutionCache.get(playlist) ?? null;

  try {
    // try direct first, then fall back to the m3u8 proxy (covers extension-mode
    // where the page can't fetch the original url due to cors)
    const attempts = [playlist, createM3U8ProxyUrl(playlist)];
    for (const target of attempts) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          HLS_RESOLUTION_FETCH_TIMEOUT,
        );
        const response = await fetch(target, {
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) continue;
        const text = await response.text();

        let maxHeight = 0;
        const resolver = /RESOLUTION=(\d+)x(\d+)/gi;
        for (
          let match = resolver.exec(text);
          match !== null;
          match = resolver.exec(text)
        ) {
          const height = Number.parseInt(match[2] ?? "", 10);
          if (Number.isFinite(height) && height > maxHeight) maxHeight = height;
        }
        if (maxHeight <= 0) return cacheHlsResolution(playlist, null);
        return cacheHlsResolution(playlist, resolutionScoreFromHeight(maxHeight));
      } catch {
        // try next target on failure
      }
    }
    return cacheHlsResolution(playlist, null);
  } catch {
    return cacheHlsResolution(playlist, null);
  }
}

async function getRunOutputBestResolutionScore(
  output: RunOutput,
): Promise<number> {
  if (output.stream.type === "file") {
    return Object.entries(output.stream.qualities).reduce((best, [quality, stream]) => {
      if (!stream?.url) return best;
      return Math.max(best, sourceQualityScore[quality] ?? 0);
    }, 0);
  }

  // hls: measure the real playlist top resolution. unknown (can't fetch/parse)
  // is NOT counted as 4k, so we never claim a resolution we can't prove.
  return (await getHlsStreamResolutionScore(output.stream)) ?? 0;
}

type ScraperEvent<Event extends keyof FullScraperEvents> = Parameters<
  NonNullable<FullScraperEvents[Event]>
>[0];

function useBaseScrape() {
  const [sources, setSources] = useState<Record<string, ScrapingSegment>>({});
  const [sourceOrder, setSourceOrder] = useState<ScrapingItems[]>([]);
  const [currentSource, setCurrentSource] = useState<string>();
  const lastId = useRef<string | null>(null);

  const initEvent = useCallback((evt: ScraperEvent<"init">) => {
    setSources(
      evt.sourceIds
        .map((v) => {
          const source = getCachedMetadata().find((s) => s.id === v);
          if (!source) throw new Error("invalid source id");
          const out: ScrapingSegment = {
            name: source.name,
            id: source.id,
            status: "waiting",
            percentage: 0,
          };
          return out;
        })
        .reduce<Record<string, ScrapingSegment>>((a, v) => {
          a[v.id] = v;
          return a;
        }, {}),
    );
    setSourceOrder(evt.sourceIds.map((v) => ({ id: v, children: [] })));
  }, []);

  const startEvent = useCallback((id: ScraperEvent<"start">) => {
    const lastIdTmp = lastId.current;
    setSources((s) => {
      if (s[id]) s[id].status = "pending";
      if (lastIdTmp && s[lastIdTmp] && s[lastIdTmp].status === "pending")
        s[lastIdTmp].status = "success";
      return { ...s };
    });
    setCurrentSource(id);
    lastId.current = id;
  }, []);

  const updateEvent = useCallback((evt: ScraperEvent<"update">) => {
    setSources((s) => {
      if (s[evt.id]) {
        s[evt.id].status = evt.status;
        s[evt.id].reason = evt.reason;
        s[evt.id].error = evt.error;
        s[evt.id].percentage = evt.percentage;
      }
      return { ...s };
    });
  }, []);

  const discoverEmbedsEvent = useCallback(
    (evt: ScraperEvent<"discoverEmbeds">) => {
      setSources((s) => {
        evt.embeds.forEach((v) => {
          const source = getCachedMetadata().find(
            (src) => src.id === v.embedScraperId,
          );
          if (!source) throw new Error("invalid source id");
          const out: ScrapingSegment = {
            embedId: v.embedScraperId,
            name: source.name,
            id: v.id,
            status: "waiting",
            percentage: 0,
          };
          s[v.id] = out;
        });
        return { ...s };
      });
      setSourceOrder((s) => {
        const source = s.find((v) => v.id === evt.sourceId);
        if (!source) throw new Error("invalid source id");
        source.children = evt.embeds.map((v) => v.id);
        return [...s];
      });
    },
    [],
  );

  const startScrape = useCallback(() => {
    lastId.current = null;
  }, []);

  const getResult = useCallback((output: RunOutput | null) => {
    if (output && lastId.current) {
      setSources((s) => {
        if (!lastId.current) return s;
        if (s[lastId.current]) s[lastId.current].status = "success";
        return { ...s };
      });
    }
    return output;
  }, []);

  return {
    initEvent,
    startEvent,
    updateEvent,
    discoverEmbedsEvent,
    startScrape,
    getResult,
    sources,
    sourceOrder,
    currentSource,
  };
}

export function useScrape() {
  const {
    sources,
    sourceOrder,
    currentSource,
    updateEvent,
    discoverEmbedsEvent,
    initEvent,
    getResult,
    startEvent,
    startScrape,
  } = useBaseScrape();

  const preferredSourceOrder = usePreferencesStore((s) => s.sourceOrder);
  const enableSourceOrder = usePreferencesStore((s) => s.enableSourceOrder);
  const lastSuccessfulSource = usePreferencesStore(
    (s) => s.lastSuccessfulSource,
  );
  const enableLastSuccessfulSource = usePreferencesStore(
    (s) => s.enableLastSuccessfulSource,
  );
  const preferredEmbedOrder = usePreferencesStore((s) => s.embedOrder);
  const enableEmbedOrder = usePreferencesStore((s) => s.enableEmbedOrder);
  const preferredMinimumResolution = usePreferencesStore(
    (s) => s.preferredMinimumResolution,
  );

  const startScraping = useCallback(
    async (media: ScrapeMedia, startFromSourceId?: string) => {
      const providerInstance = getProviders();
      const allSources = providerInstance.listSources();
      const playerState = usePlayerStore.getState();

      // Get media-specific failed sources/embeds
      // Try to get media key from player state first, fallback to deriving from ScrapeMedia
      let mediaKey = getMediaKey(playerState.meta);
      if (!mediaKey) {
        // Derive media key from ScrapeMedia if meta is not set yet
        if (media.type === "movie") {
          mediaKey = `movie-${media.tmdbId}`;
        } else if (media.type === "show" && media.season && media.episode) {
          mediaKey = `show-${media.tmdbId}-${media.season.tmdbId}-${media.episode.tmdbId}`;
        } else if (media.type === "show") {
          mediaKey = `show-${media.tmdbId}`;
        }
      }
      const failedSources = mediaKey
        ? playerState.failedSourcesPerMedia[mediaKey] || []
        : [];
      const failedEmbeds = mediaKey
        ? playerState.failedEmbedsPerMedia[mediaKey] || {}
        : {};

      // Start with all available sources (DO NOT filter failed ones yet, so we can find startFromSourceId)
      let baseSourceOrder = allSources.map((source) => source.id);

      // Apply custom source ordering if enabled
      if (enableSourceOrder && (preferredSourceOrder || []).length > 0) {
        const orderedSources: string[] = [];
        const remainingSources = [...baseSourceOrder];

        // Add sources in preferred order
        for (const sourceId of preferredSourceOrder) {
          const sourceIndex = remainingSources.indexOf(sourceId);
          if (sourceIndex !== -1) {
            orderedSources.push(sourceId);
            remainingSources.splice(sourceIndex, 1);
          }
        }

        // Add remaining sources
        baseSourceOrder = [...orderedSources, ...remainingSources];
      }

      // If we have a last successful source and the feature is enabled, prioritize it
      // BUT only if we're not resuming from a specific source (to preserve custom order)
      if (
        enableLastSuccessfulSource &&
        lastSuccessfulSource &&
        !startFromSourceId
      ) {
        const lastSourceIndex = baseSourceOrder.indexOf(lastSuccessfulSource);
        if (lastSourceIndex !== -1) {
          baseSourceOrder = [
            lastSuccessfulSource,
            ...baseSourceOrder.filter((id) => id !== lastSuccessfulSource),
          ];
        }
      }

      // If starting from a specific source ID, filter the order to start AFTER that source
      // This preserves the custom order while starting from the next source
      let filteredSourceOrder = baseSourceOrder;
      if (startFromSourceId) {
        const startIndex = filteredSourceOrder.indexOf(startFromSourceId);
        if (startIndex !== -1) {
          filteredSourceOrder = filteredSourceOrder.slice(startIndex + 1);
        }
      }

      // Now filter out the failed sources so we don't try them again
      filteredSourceOrder = filteredSourceOrder.filter(
        (id) => !failedSources.includes(id)
      );

      // Collect all failed embed IDs across all sources for current media
      const allFailedEmbedIds = Object.values(failedEmbeds).flat();

      // Filter out failed embeds from the embed order
      const filteredEmbedOrder = enableEmbedOrder
        ? (preferredEmbedOrder || []).filter(
            (id) => !allFailedEmbedIds.includes(id),
          )
        : undefined;

      const minimumResolutionScore =
        minimumResolutionThreshold[preferredMinimumResolution] ?? 0;

      startScrape();
      const providers = getProviders();

      if (minimumResolutionScore <= 0) {
        const output = await providers.runAll({
          media,
          sourceOrder: filteredSourceOrder,
          embedOrder: filteredEmbedOrder,
          events: {
            init: initEvent,
            start: startEvent,
            update: updateEvent,
            discoverEmbeds: discoverEmbedsEvent,
          },
        });
        if (output && isExtensionActiveCached())
          await prepareStream(output.stream);
        return getResult(output);
      }

      let remainingSourceOrder = [...filteredSourceOrder];
      let bestFallbackOutput: RunOutput | null = null;
      let bestFallbackScore = -1;

      while (remainingSourceOrder.length > 0) {
        const output = await providers.runAll({
          media,
          sourceOrder: remainingSourceOrder,
          embedOrder: filteredEmbedOrder,
          events: {
            init: initEvent,
            start: startEvent,
            update: updateEvent,
            discoverEmbeds: discoverEmbedsEvent,
          },
        });

        if (!output) break;

        const sourceScore = await getRunOutputBestResolutionScore(output);
        if (sourceScore > bestFallbackScore) {
          bestFallbackScore = sourceScore;
          bestFallbackOutput = output;
        }

        if (sourceScore >= minimumResolutionScore) {
          if (isExtensionActiveCached()) await prepareStream(output.stream);
          return getResult(output);
        }

        const currentSourceIndex = remainingSourceOrder.indexOf(output.sourceId);
        if (currentSourceIndex === -1) break;
        remainingSourceOrder = remainingSourceOrder.slice(currentSourceIndex + 1);
      }

      if (bestFallbackOutput && isExtensionActiveCached()) {
        await prepareStream(bestFallbackOutput.stream);
      }
      return getResult(bestFallbackOutput);
    },
    [
      initEvent,
      startEvent,
      updateEvent,
      discoverEmbedsEvent,
      getResult,
      startScrape,
      preferredSourceOrder,
      enableSourceOrder,
      lastSuccessfulSource,
      enableLastSuccessfulSource,
      preferredEmbedOrder,
      enableEmbedOrder,
      preferredMinimumResolution,
    ],
  );

  const resumeScraping = useCallback(
    async (media: ScrapeMedia, startFromSourceId: string) => {
      return startScraping(media, startFromSourceId);
    },
    [startScraping],
  );

  return {
    startScraping,
    resumeScraping,
    sourceOrder,
    sources,
    currentSource,
  };
}

export function useListCenter(
  containerRef: RefObject<HTMLDivElement | null>,
  listRef: RefObject<HTMLDivElement | null>,
  sourceOrder: ScrapingItems[],
  currentSource: string | undefined,
) {
  const [renderedOnce, setRenderedOnce] = useState(false);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    if (!listRef.current) return;

    const elements = [
      ...listRef.current.querySelectorAll("div[data-source-id]"),
    ] as HTMLDivElement[];

    const currentIndex = elements.findIndex(
      (e) => e.getAttribute("data-source-id") === currentSource,
    );

    const currentElement = elements[currentIndex];

    if (!currentElement) return;

    const containerWidth = containerRef.current.getBoundingClientRect().width;
    const listWidth = listRef.current.getBoundingClientRect().width;

    const containerHeight = containerRef.current.getBoundingClientRect().height;

    const listTop = listRef.current.getBoundingClientRect().top;

    const currentTop = currentElement.getBoundingClientRect().top;
    const currentHeight = currentElement.getBoundingClientRect().height;

    const topDifference = currentTop - listTop;

    const listNewLeft = containerWidth / 2 - listWidth / 2;
    const listNewTop = containerHeight / 2 - topDifference - currentHeight / 2;

    listRef.current.style.transform = `translateY(${listNewTop}px) translateX(${listNewLeft}px)`;
    setTimeout(() => {
      setRenderedOnce(true);
    }, 150);
  }, [currentSource, containerRef, listRef, setRenderedOnce]);

  const updatePositionRef = useRef(updatePosition);

  useEffect(() => {
    updatePosition();
    updatePositionRef.current = updatePosition;
  }, [updatePosition, sourceOrder]);

  useEffect(() => {
    function resize() {
      updatePositionRef.current();
    }
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  return renderedOnce;
}
