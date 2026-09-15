import { readJson, writeJsonDebounced, STORAGE_KEYS } from './storage';

type Entry<T> = { value: T; expiresAt: number };

/**
 * Two-tier metadata cache: an in-memory map for instant reads plus a
 * persisted snapshot so a cold start still feels immediate.
 *
 * Only non-protected metadata is cached (titles, artwork URLs, durations,
 * search result lists). Resolved stream URLs are deliberately NOT persisted:
 * they are short-lived and host-bound, so they live in memory only.
 */
export class MetadataCache {
  private memory = new Map<string, Entry<unknown>>();
  private hydrated = false;
  private maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    const stored = await readJson<Record<string, Entry<unknown>>>(STORAGE_KEYS.cache, {});
    const now = Date.now();
    for (const [k, entry] of Object.entries(stored)) {
      if (entry && entry.expiresAt > now) this.memory.set(k, entry);
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.memory.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return undefined;
    }

    // Refresh LRU recency by reinserting at the tail.
    this.memory.delete(key);
    this.memory.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.memory.set(key, { value, expiresAt: Date.now() + ttlMs });
    this.evictIfNeeded();
    this.persist();
  }

  /** Read-through helper: returns the cached value or computes and stores it. */
  async remember<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;

    const value = await load();
    this.set(key, value, ttlMs);
    return value;
  }

  /** Invalidate one key, or every key starting with `prefix`. */
  invalidate(keyOrPrefix: string, asPrefix = false): void {
    if (!asPrefix) {
      this.memory.delete(keyOrPrefix);
    } else {
      for (const k of [...this.memory.keys()]) {
        if (k.startsWith(keyOrPrefix)) this.memory.delete(k);
      }
    }
    this.persist();
  }

  clear(): void {
    this.memory.clear();
    this.persist();
  }

  private evictIfNeeded(): void {
    if (this.memory.size <= this.maxEntries) return;

    const now = Date.now();
    for (const [k, e] of this.memory) {
      if (e.expiresAt <= now) this.memory.delete(k);
    }
    // Map preserves insertion order, so the head is the least recently used.
    while (this.memory.size > this.maxEntries) {
      const oldest = this.memory.keys().next();
      if (oldest.done) break;
      this.memory.delete(oldest.value);
    }
  }

  private persist(): void {
    const snapshot: Record<string, Entry<unknown>> = {};
    for (const [k, e] of this.memory) snapshot[k] = e;
    writeJsonDebounced(STORAGE_KEYS.cache, snapshot, 2000);
  }
}

export const TTL = {
  search: 15 * 60 * 1000, // 15m  -- results shift slowly
  track: 24 * 60 * 60 * 1000, // 24h  -- title/artwork/duration are stable
  playlist: 60 * 60 * 1000, // 1h   -- contents can be edited upstream
  suggestions: 60 * 60 * 1000, // 1h
} as const;

export const metadataCache = new MetadataCache();
