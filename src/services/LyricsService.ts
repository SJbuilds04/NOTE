import { metadataCache } from '../core/cache';
import { Track } from '../core/types';

export type LyricLine = {
  /** Seconds into the track. Undefined for unsynced lyrics. */
  time?: number;
  text: string;
};

export type Lyrics = {
  trackId: string;
  lines: LyricLine[];
  synced: boolean;
  source: string;
};

/**
 * A lyrics provider. Nothing is wired up by default -- the app ships without a
 * lyrics source so it never fetches lyrics from somewhere unlicensed.
 *
 * Connecting an authorized provider later means writing one object with a
 * `fetch` method and calling `LyricsService.use(provider)` at startup. No UI
 * or player code changes.
 */
export interface LyricsProvider {
  readonly id: string;
  fetch(track: Track, signal?: AbortSignal): Promise<Lyrics | null>;
}

const TTL = 24 * 60 * 60 * 1000;

class LyricsServiceImpl {
  private provider: LyricsProvider | null = null;

  use(provider: LyricsProvider | null): void {
    this.provider = provider;
  }

  get isConfigured(): boolean {
    return this.provider !== null;
  }

  get providerName(): string | null {
    return this.provider?.id ?? null;
  }

  /** Returns null when no provider is configured or none has lyrics. */
  async get(track: Track, signal?: AbortSignal): Promise<Lyrics | null> {
    if (!this.provider) return null;

    const key = `lyrics:${this.provider.id}:${track.id}`;
    const cached = metadataCache.get<Lyrics | null>(key);
    if (cached !== undefined) return cached;

    try {
      const lyrics = await this.provider.fetch(track, signal);
      metadataCache.set(key, lyrics, TTL);
      return lyrics;
    } catch {
      // Lyrics are supplementary; a failure must never disturb playback.
      return null;
    }
  }

  /** The line that should be highlighted at `position` seconds. */
  activeLineIndex(lyrics: Lyrics | null, position: number): number {
    if (!lyrics?.synced || !lyrics.lines.length) return -1;

    let index = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      const t = lyrics.lines[i].time;
      if (t === undefined || t > position) break;
      index = i;
    }
    return index;
  }
}

export const LyricsService = new LyricsServiceImpl();
