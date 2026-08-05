import { ReactNode, useEffect, useMemo, useRef } from "react";

import { makeVideoElementDisplayInterface } from "@/components/player/display/base";
import { convertSubtitlesToObjectUrl } from "@/components/player/utils/captions";
import { playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";

import { useInitializeSource } from "../hooks/useInitializePlayer";

function getPlaybackKey(
  meta: ReturnType<typeof usePlayerStore.getState>["meta"],
): string | null {
  if (!meta) return null;
  if (meta.type === "movie") return `${meta.type}-${meta.tmdbId}`;
  if (meta.season?.tmdbId && meta.episode?.tmdbId) {
    return `${meta.type}-${meta.tmdbId}-${meta.season.tmdbId}-${meta.episode.tmdbId}`;
  }
  return `${meta.type}-${meta.tmdbId}`;
}

function getTitleKey(
  meta: ReturnType<typeof usePlayerStore.getState>["meta"],
): string | null {
  if (!meta?.tmdbId) return null;
  return `${meta.type}-${meta.tmdbId}`;
}


function useDisplayInterface() {
  const display = usePlayerStore((s) => s.display);
  const setDisplay = usePlayerStore((s) => s.setDisplay);

  const displayRef = useRef(display);
  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (!displayRef.current) {
      const newDisplay = makeVideoElementDisplayInterface();
      displayRef.current = newDisplay;
      setDisplay(newDisplay);
    }
    return () => {
      if (displayRef.current) {
        displayRef.current = null;
        setDisplay(null);
      }
    };
  }, [setDisplay]);
}

export function useShouldShowVideoElement() {
  const status = usePlayerStore((s) => s.status);

  if (status !== playerStatus.PLAYING) return false;
  return true;
}

function useObjectUrl(cb: () => string | null, deps: any[]) {
  const lastObjectUrl = useRef<string | null>(null);
  const output = useMemo(() => {
    if (lastObjectUrl.current) URL.revokeObjectURL(lastObjectUrl.current);
    const data = cb();
    lastObjectUrl.current = data;
    return data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    return () => {
      if (lastObjectUrl.current) URL.revokeObjectURL(lastObjectUrl.current);
    };
  }, []);

  return output;
}

function VideoElement() {
  const videoEl = useRef<HTMLVideoElement>(null);
  const trackEl = useRef<HTMLTrackElement>(null);
  const display = usePlayerStore((s) => s.display);
  const srtData = usePlayerStore((s) => s.caption.selected?.srtData);
  const language = usePlayerStore((s) => s.caption.selected?.language);
  const source = usePlayerStore((s) => s.source);
  const enableNativeSubtitles = usePreferencesStore(
    (s) => s.enableNativeSubtitles,
  );
  const captionAsTrack = usePlayerStore((s) => s.caption.asTrack);
  const videoBrightness = usePreferencesStore((s) => s.videoBrightness);
  const videoContrast   = usePreferencesStore((s) => s.videoContrast);
  const videoSaturation = usePreferencesStore((s) => s.videoSaturation);
  const videoHueRotate  = usePreferencesStore((s) => s.videoHueRotate);
  const volumeBoost = usePreferencesStore((s) => s.volumeBoost);
  const setVolumeBoost = usePreferencesStore((s) => s.setVolumeBoost);
  const volumeBoostApplyMode = usePreferencesStore((s) => s.volumeBoostApplyMode);
  const volumeBoostByTitle = usePreferencesStore((s) => s.volumeBoostByTitle);
  const meta = usePlayerStore((s) => s.meta);
  const previousPlaybackKeyRef = useRef<string | null>(null);


  const filterStr = useMemo(() => {
    const parts: string[] = [];
    if (videoBrightness !== 100) parts.push(`brightness(${videoBrightness}%)`);
    if (videoContrast   !== 100) parts.push(`contrast(${videoContrast}%)`);
    if (videoSaturation !== 100) parts.push(`saturate(${videoSaturation}%)`);
    if (videoHueRotate  !== 0)   parts.push(`hue-rotate(${videoHueRotate}deg)`);
    return parts.length ? parts.join(" ") : undefined;
  }, [videoBrightness, videoContrast, videoSaturation, videoHueRotate]);

  useEffect(() => {
    const playbackKey = getPlaybackKey(meta);
    if (!playbackKey) {
      previousPlaybackKeyRef.current = null;
      return;
    }

    const previousPlaybackKey = previousPlaybackKeyRef.current;
    const isChangedPlayback =
      previousPlaybackKey !== null && previousPlaybackKey !== playbackKey;
    const isInitialPlayback = previousPlaybackKey === null;

    if (!isChangedPlayback && !isInitialPlayback) return;

    if (volumeBoostApplyMode === "current") {
      if (isChangedPlayback && volumeBoost !== 100) {
        setVolumeBoost(100);
      }
    } else {
      const titleKey = getTitleKey(meta);
      const titleBoost = titleKey ? volumeBoostByTitle[titleKey] : undefined;
      const nextBoost = titleBoost ?? 100;
      if (volumeBoost !== nextBoost) {
        setVolumeBoost(nextBoost);
      }
    }

    previousPlaybackKeyRef.current = playbackKey;
  }, [meta, setVolumeBoost, volumeBoost, volumeBoostApplyMode, volumeBoostByTitle]);

  useEffect(() => {
    if (!videoEl.current) return;
    const video = videoEl.current;

    const existingCtx: AudioContext | undefined = (video as any).__audioCtx;
    const existingGain: GainNode | undefined = (video as any).__gainNode;

   // nice j ob
    if (volumeBoost <= 100) {
      if (existingGain) existingGain.gain.value = 1;
      video.removeAttribute("data-boosted");
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    let ctx = existingCtx;
    let gainNode = existingGain;

    if (!ctx) {
      ctx = new AudioCtx();
      const mediaEl = ctx.createMediaElementSource(video);
      const preCompressor = ctx.createDynamicsCompressor();
      // Mild compression helps stabilize dialogue before extra gain.
      preCompressor.threshold.value = -24;
      preCompressor.knee.value = 30;
      preCompressor.ratio.value = 4;
      preCompressor.attack.value = 0.003;
      preCompressor.release.value = 0.25;

      gainNode = ctx.createGain();

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;

      mediaEl.connect(preCompressor);
      preCompressor.connect(gainNode);
      gainNode.connect(limiter);
      limiter.connect(ctx.destination);
      (video as any).__audioCtx = ctx;
      (video as any).__gainNode = gainNode;
    }

    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    if (gainNode) gainNode.gain.value = Math.max(1, volumeBoost / 100);
    video.setAttribute("data-boosted", "true");
  }, [volumeBoost]);
  const trackObjectUrl = useObjectUrl(
    () => (srtData ? convertSubtitlesToObjectUrl(srtData) : null),
    [srtData],
  );


  const shouldUseNativeTrack = (enableNativeSubtitles || captionAsTrack) && source !== null;


  useEffect(() => {
    if (display && videoEl.current) {
      display.processVideoElement(videoEl.current);
    }
  }, [display, videoEl]);


  useEffect(() => {
    if (trackEl.current) {
      trackEl.current.track.mode = shouldUseNativeTrack ? "showing" : "hidden";
    }
  }, [shouldUseNativeTrack, trackEl]);



  let subtitleTrack: ReactNode = null;
  if (shouldUseNativeTrack && trackObjectUrl && language) {
    subtitleTrack = (
      <track
        ref={trackEl}
        label="Z-Stream Captions"
        kind="subtitles"
        srcLang={language}
        src={trackObjectUrl}
        default
      />
    );
  }

  return (
    <video
      id="video-element"
      className="absolute inset-0 w-full h-screen bg-black"
      style={{ filter: filterStr }}
      autoPlay
      playsInline
      ref={videoEl}
      preload="metadata"
      onContextMenu={(e) => e.preventDefault()}
    >
      {subtitleTrack}
    </video>
  );
}

export function VideoContainer() {
  const show = useShouldShowVideoElement();
  useDisplayInterface();
  useInitializeSource();

  if (!show) return null;
  return <VideoElement />;
}
