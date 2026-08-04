import { useCallback } from "react";

import { Icons } from "@/components/Icon";
import { usePlayerMeta } from "@/components/player/hooks/usePlayerMeta";
import { VideoPlayerButton } from "@/components/player/internals/Button";
import { getShuffledNextPick } from "@/components/player/utils/shuffle";
import { PlayerMeta } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { useProgressStore } from "@/stores/progress";

interface SkipEpisodeButtonProps {
  inControl: boolean;
  onChange?: (meta: PlayerMeta) => void;
}

export function SkipEpisodeButton(props: SkipEpisodeButtonProps) {
  const meta = usePlayerStore((s) => s.meta);
  const isShuffled = usePlayerStore((s) => s.interface.isShuffled);
  const { setDirectMeta } = usePlayerMeta();
  const setShouldStartFromBeginning = usePlayerStore(
    (s) => s.setShouldStartFromBeginning,
  );
  const updateItem = useProgressStore((s) => s.updateItem);
  const sourceId = usePlayerStore((s) => s.sourceId);
  const setLastSuccessfulSource = usePreferencesStore(
    (s) => s.setLastSuccessfulSource,
  );
  const nextEp = meta?.episodes?.find(
    (v) => v.number === (meta?.episode?.number ?? 0) + 1,
  );

  const loadNextEpisode = useCallback(async () => {
    if (!meta || !meta.episode) return;
    if (sourceId) {
      setLastSuccessfulSource(sourceId);
    }

    let targetEp = nextEp;
    let targetSeason = meta.season;
    if (isShuffled && meta.type === "show") {
      const pick = await getShuffledNextPick(meta);
      if (!pick) return;
      targetEp = pick.episode;
      targetSeason = pick.season;
    }
    if (!targetEp) return;

    const metaCopy = { ...meta };
    metaCopy.episode = targetEp;
    if (targetSeason) {
      metaCopy.season = {
        number: targetSeason.number,
        tmdbId: targetSeason.tmdbId,
        title: targetSeason.title,
      };
    }
    setShouldStartFromBeginning(true);
    setDirectMeta(metaCopy);
    props.onChange?.(metaCopy);
    const defaultProgress = { duration: 0, watched: 0 };
    updateItem({
      meta: metaCopy,
      progress: defaultProgress,
    });
  }, [
    setDirectMeta,
    nextEp,
    meta,
    props,
    setShouldStartFromBeginning,
    updateItem,
    sourceId,
    setLastSuccessfulSource,
    isShuffled,
  ]);

  // Don't show the button when not shuffling and there's no next episode
  if (!props.inControl) return null;
  if (!meta?.episode) return null;
  if (meta.type !== "show") return null;
  if (!isShuffled && !nextEp) return null;

  return (
    <VideoPlayerButton
      onClick={() => loadNextEpisode()}
      icon={Icons.SKIP_EPISODE}
      iconSizeClass="text-xl"
      className="hover:bg-video-buttonBackground hover:bg-opacity-50"
    />
  );
}
