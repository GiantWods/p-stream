import { getMetaFromId } from "@/backend/metadata/getmeta";
import { MWMediaType } from "@/backend/metadata/types/mw";
import {
  PlayerMeta,
  PlayerMetaEpisode,
} from "@/stores/player/slices/source";
import { PlayerShufflePoolItem } from "@/stores/player/slices/interface";
import { usePlayerStore } from "@/stores/player/store";

import { hasAired } from "./aired";

// shuffle only applies to the show it was enabled on; every other series behaves normally
export function isShuffleActive(meta: PlayerMeta | null): boolean {
  const store = usePlayerStore.getState();
  if (!store.interface.isShuffled) return false;
  if (!meta || meta.type !== "show") return false;
  if (
    store.interface.shuffleTmdbId &&
    store.interface.shuffleTmdbId !== meta.tmdbId
  ) {
    return false;
  }
  return true;
}

// cache built pools so enabling/re-pressing doesn't rescan the whole show each time
const poolCache = new Map<string, PlayerShufflePoolItem[]>();
const poolInFlight = new Map<string, Promise<PlayerShufflePoolItem[]>>();

function poolKey(meta: PlayerMeta, seasonId: string | null) {
  return `${meta.tmdbId}|${seasonId ?? ""}`;
}

function toShuffleEpisode(e: {
  number: number;
  title: string;
  id: string;
  air_date?: string;
  overview?: string;
}): PlayerMetaEpisode {
  return {
    number: e.number,
    title: e.title,
    tmdbId: e.id,
    air_date: e.air_date,
    overview: e.overview,
  };
}

async function buildSeasonPool(
  meta: PlayerMeta,
  seasonId: string,
): Promise<PlayerShufflePoolItem[]> {
  const seasonData = await getMetaFromId(
    MWMediaType.SERIES,
    meta.tmdbId,
    seasonId,
  );
  if (seasonData?.meta.type !== MWMediaType.SERIES) return [];
  const sd = seasonData.meta.seasonData;
  const season = {
    number: sd.number,
    tmdbId: seasonId,
    title: sd.title,
  };
  return (sd.episodes ?? [])
    .filter((e) => !e.air_date || hasAired(e.air_date))
    .map((e) => ({ season, episode: toShuffleEpisode(e) }));
}

// Builds the aired-episode shuffle pool for the armed show/season.
export async function buildShufflePool(
  meta: PlayerMeta,
  seasonId: string | null,
): Promise<PlayerShufflePoolItem[]> {
  if (!meta || meta.type !== "show" || !meta.tmdbId) return [];

  const key = poolKey(meta, seasonId);
  const cached = poolCache.get(key);
  if (cached) return cached;

  let pending = poolInFlight.get(key);
  if (!pending) {
    pending = (async () => {
      // season-scoped: pin the armed season, not whichever one is loaded
      if (seasonId) return buildSeasonPool(meta, seasonId);

      // whole series: fetch every season in parallel instead of one-by-one
      const data = await getMetaFromId(MWMediaType.SERIES, meta.tmdbId);
      if (data?.meta.type !== MWMediaType.SERIES) return [];
      const seasons = data.meta.seasons ?? [];
      const results = await Promise.all(
        seasons.map((season) => buildSeasonPool(meta, season.id)),
      );
      return results.flat();
    })();
    poolInFlight.set(key, pending);
  }

  const pool = await pending;
  poolInFlight.delete(key);
  if (pool.length > 0) {
    poolCache.set(key, pool);
    // bound memory - evict the oldest pool once we grow too big
    if (poolCache.size > 50) {
      const oldest = poolCache.keys().next().value;
      if (oldest !== undefined) poolCache.delete(oldest);
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

// coalesce rapid presses so a double-click can't double-advance
// keyed by show+episode so concurrent calls for different media never share
const picksInFlight = new Map<string, Promise<PlayerShufflePoolItem | null>>();

export async function getShuffledNextPick(
  meta: PlayerMeta,
): Promise<PlayerShufflePoolItem | null> {
  let store = usePlayerStore.getState();
  const episode = meta?.episode;
  if (!store.interface.isShuffled || !episode) return null;

  // different show than shuffle was armed on -> back to normal nav
  if (
    store.interface.shuffleTmdbId &&
    store.interface.shuffleTmdbId !== meta.tmdbId
  ) {
    return null;
  }

  const key = `${meta.tmdbId}|${episode.tmdbId}`;
  const existing = picksInFlight.get(key);
  if (existing) return existing;

  const run = (async () => {
    const currentId = episode.tmdbId;
    if (currentId) store.addShuffledEpisodeId(currentId);

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
      // restart the cycle, but never instantly replay the episode on screen
      store.setShuffledEpisodeIds(currentId ? [currentId] : []);
      pick = pickUnplayed(pool, store.interface.shuffledEpisodeIds);
    }
    return pick;
  })();

  picksInFlight.set(key, run);
  try {
    return await run;
  } finally {
    picksInFlight.delete(key);
  }
}
