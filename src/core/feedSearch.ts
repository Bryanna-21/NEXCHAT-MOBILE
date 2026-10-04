import AsyncStorage from "@react-native-async-storage/async-storage";

const RECENT_SEARCHES_KEY = "@nexchat/feed/recent-searches/v1";
const MAX_RECENT_SEARCHES = 8;

export async function loadRecentFeedSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export async function saveRecentFeedSearch(query: string): Promise<void> {
  const normalized = query.trim();

  if (!normalized) {
    return;
  }

  try {
    const existing = await loadRecentFeedSearches();

    const next = [
      normalized,
      ...existing.filter(
        (item) => item.toLowerCase() !== normalized.toLowerCase(),
      ),
    ].slice(0, MAX_RECENT_SEARCHES);

    await AsyncStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Search history is optional; failure must not affect Feed.
  }
}

export async function removeRecentFeedSearch(
  query: string,
): Promise<void> {
  try {
    const existing = await loadRecentFeedSearches();

    const next = existing.filter(
      (item) => item.toLowerCase() !== query.trim().toLowerCase(),
    );

    await AsyncStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Search history is optional; failure must not affect Feed.
  }
}
