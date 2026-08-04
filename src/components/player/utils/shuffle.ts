import { getMetaFromId } from "@/backend/metadata/getmeta";
import { MWMediaType } from "@/backend/metadata/types/mw";
import {
  PlayerMeta,
  PlayerMetaEpisode,
} from "@/stores/player/slices/source";
import { PlayerShufflePoolItem } from "@/stores/player/slices/interface";
import { usePlayerStore } from "@/stores/player/store";

import { hasAired } from "./aired";

// Builds a show's aired-episode shuffle pool and picks a random, not-yet-played episode for the active shuffle session.
export async function buildShufflePool(
  meta: PlayerMeta,
  seasonId: string | null,
): Promise<PlayerShufflePoolItem[]> {
  if (!meta || meta.type !== "show" || !meta.tmdbId) return [];

  if (seasonId) {
    const season = meta.season;
    if (!season) return [];
    const episodes = (meta.episodes ?? []).filter(
      (e) => !e.air_date || hasAired(e.air_date),
    );
    return episodes.map((episode) => ({ season, episode }));
  }

  const data = await getMetaFromId(MWMediaType.SERIES, meta.tmdbId);
  if (data?.meta.type !== MWMediaType.SERIES) return [];

  const seasons = data.meta.seasons ?? [];
  const pool: PlayerShufflePoolItem[] = [];

  for (const season of seasons) {
    const seasonData = await getMetaFromId(
      MWMediaType.SERIES,
      meta.tmdbId,
      season.id,
    );
    if (seasonData?.meta.type !== MWMediaType.SERIES) continue;
    const episodes: PlayerMetaEpisode[] = (
      seasonData.meta.seasonData.episodes ?? []
    ).map((e) => ({
      number: e.number,
      title: e.title,
      tmdbId: e.id,
      air_date: e.air_date,
      overview: e.overview,
    }));

    for (const episode of episodes) {
      if (!episode.air_date || hasAired(episode.air_date)) {
        pool.push({
          episode,
          season: {
            number: season.number,
            tmdbId: season.id,
            title: season.title,
          },
        });
      }
    }
  }

  return pool;
}

export function pickUnplayed(
  pool: PlayerShufflePoolItem[],
  playedIds: string[],
): PlayerShufflePoolItem | null {
  const played = new Set(playedIds);
  const available = pool.filter((p) => !played.has(p.episode.tmdbId));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export async function getShuffledNextPick(
  meta: PlayerMeta,
): Promise<PlayerShufflePoolItem | null> {
  let store = usePlayerStore.getState();
  if (!store.interface.isShuffled || !meta?.episode) return null;

  if (meta.episode.tmdbId) store.addShuffledEpisodeId(meta.episode.tmdbId);

  let pool = store.interface.shufflePool;
  if (pool.length === 0) {
    pool = await buildShufflePool(meta, store.interface.shuffleSeasonId);
    if (pool.length === 0) return null;
    store = usePlayerStore.getState();
    store.setShufflePool(pool);
    pool = usePlayerStore.getState().interface.shufflePool;
  }
  store = usePlayerStore.getState();

  let pick = pickUnplayed(pool, store.interface.shuffledEpisodeIds);
  if (!pick) {
    store = usePlayerStore.getState();
    store.setShuffledEpisodeIds([]);
    pick = pickUnplayed(pool, []);
  }

  return pick;
}
