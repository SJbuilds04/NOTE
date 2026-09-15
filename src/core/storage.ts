import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local-first persistence. AsyncStorage is backed by localStorage on web and
 * by the platform key-value store on native, so one adapter covers both.
 *
 * Writes are debounced and coalesced per key: the player position updates
 * several times a second and must never turn into a storage write storm.
 */

const PREFIX = 'note:v1:';
const key = (k: string) => PREFIX + k;

const pending = new Map<string, unknown>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function readJson<T>(k: string, fallback: T): Promise<T> {
  try {
    // A debounced write that has not landed yet is still the freshest value.
    if (pending.has(k)) return pending.get(k) as T;

    const raw = await AsyncStorage.getItem(key(k));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or unreadable entry: fall back rather than break the app.
    return fallback;
  }
}

export async function writeJson(k: string, value: unknown): Promise<void> {
  try {
    pending.delete(k);
    await AsyncStorage.setItem(key(k), JSON.stringify(value));
  } catch {
    // Storage full or unavailable -- persistence is best-effort by design.
  }
}

/** Coalescing write. Repeated calls within `delayMs` collapse into one. */
export function writeJsonDebounced(k: string, value: unknown, delayMs = 800): void {
  pending.set(k, value);

  const existing = timers.get(k);
  if (existing) clearTimeout(existing);

  timers.set(
    k,
    setTimeout(() => {
      timers.delete(k);
      const v = pending.get(k);
      if (pending.has(k)) void writeJson(k, v);
    }, delayMs)
  );
}

/** Force every debounced write to land now (used on backgrounding). */
export async function flushWrites(): Promise<void> {
  const entries = [...pending.entries()];
  for (const [k, t] of timers) clearTimeout(t);
  timers.clear();
  await Promise.all(entries.map(([k, v]) => writeJson(k, v)));
}

export async function removeKey(k: string): Promise<void> {
  pending.delete(k);
  const t = timers.get(k);
  if (t) {
    clearTimeout(t);
    timers.delete(k);
  }
  try {
    await AsyncStorage.removeItem(key(k));
  } catch {
    /* best effort */
  }
}

export const STORAGE_KEYS = {
  likedTracks: 'liked',
  playlists: 'playlists',
  queue: 'queue',
  recentlyPlayed: 'recents',
  playbackState: 'playback',
  settings: 'settings',
  searchHistory: 'search-history',
  cache: 'cache',
  history: 'history',
} as const;
