const hasAiredCache: { [key: string]: boolean } = {};

export function hasAired(date: string) {
  // cache truthy AND falsy so unaired dates aren't recomputed on every call
  if (date in hasAiredCache) return hasAiredCache[date];

  const now = new Date();
  const airDate = new Date(date);

  hasAiredCache[date] = airDate < now;
  return hasAiredCache[date];
}
