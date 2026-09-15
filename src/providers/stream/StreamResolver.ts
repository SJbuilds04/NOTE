import { fetchJson } from '../../core/http';
import { appError, appErrorWithMessage, AppError, toAppError } from '../../core/errors';
import { ResolvedStream, Track } from '../../core/types';
import { NativeStreamSource } from './NativeStreamSource';

/**
 * Stream resolution is deliberately separate from discovery.
 *
 * Discovery (search, metadata, playlists) uses YouTube's public InnerTube
 * endpoints directly. Playback, however, needs an actual audio URL, and
 * YouTube's player endpoint is not openly accessible. So playback sources are
 * pluggable: the app resolves through whichever authorized endpoint the user
 * points it at (a self-hosted or public Invidious/Piped-compatible service),
 * and degrades with a clear error when none is reachable.
 *
 * Adding a new way to get audio means adding one StreamSource here. Nothing
 * else in the app changes.
 */

export interface StreamSource {
  readonly id: string;
  canHandle(track: Track): boolean;
  resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream>;
}

/** How long a resolved URL is trusted before we re-resolve it. */
const STREAM_TTL = 4 * 60 * 60 * 1000; // 4h

/** A track that already carries a playable URL (e.g. a restored queue item). */
export class DirectStreamSource implements StreamSource {
  readonly id = 'direct';

  canHandle(track: Track): boolean {
    return typeof track.audioUrl === 'string' && /^https?:\/\//.test(track.audioUrl);
  }

  async resolve(track: Track): Promise<ResolvedStream> {
    return {
      url: track.audioUrl as string,
      expiresAt: Date.now() + STREAM_TTL,
      resolvedBy: this.id,
    };
  }
}

type EndpointKind = 'invidious' | 'piped' | 'custom';

export type ResolverEndpoint = {
  /** Base URL, e.g. https://my-invidious.example */
  url: string;
  kind: EndpointKind;
};

type AudioFormat = { url: string; mimeType?: string; bitrate?: number };

/** Pick the highest-bitrate audio-only format. */
function bestAudio(formats: AudioFormat[]): AudioFormat | undefined {
  const audio = formats.filter((f) => f.url && /audio/i.test(f.mimeType ?? ''));
  const pool = audio.length ? audio : formats.filter((f) => f.url);
  return pool.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
}

function parseInvidious(body: any): AudioFormat[] {
  const formats = (body?.adaptiveFormats ?? []) as any[];
  return formats.map((f) => ({
    url: f?.url,
    mimeType: f?.type ?? f?.mimeType,
    bitrate: Number(f?.bitrate) || 0,
  }));
}

function parsePiped(body: any): AudioFormat[] {
  const streams = (body?.audioStreams ?? []) as any[];
  return streams.map((f) => ({
    url: f?.url,
    mimeType: f?.mimeType ?? `audio/${f?.format ?? 'mp4'}`,
    bitrate: Number(f?.bitrate) || 0,
  }));
}

/** Generic shape: `{ url }` or `{ audioUrl }` or `{ formats: [...] }`. */
function parseCustom(body: any): AudioFormat[] {
  if (typeof body?.url === 'string') return [{ url: body.url, mimeType: body.mimeType }];
  if (typeof body?.audioUrl === 'string') return [{ url: body.audioUrl }];
  if (Array.isArray(body?.formats)) {
    return body.formats.map((f: any) => ({
      url: f?.url,
      mimeType: f?.mimeType ?? f?.type,
      bitrate: Number(f?.bitrate) || 0,
    }));
  }
  return [...parseInvidious(body), ...parsePiped(body)];
}

function endpointUrl(endpoint: ResolverEndpoint, sourceId: string): string {
  const base = endpoint.url.replace(/\/+$/, '');
  switch (endpoint.kind) {
    case 'invidious':
      return `${base}/api/v1/videos/${sourceId}`;
    case 'piped':
      return `${base}/streams/${sourceId}`;
    case 'custom':
      // A custom endpoint may template the id, otherwise it is appended.
      return base.includes('{id}') ? base.replace('{id}', sourceId) : `${base}/${sourceId}`;
  }
}

function parseFor(endpoint: ResolverEndpoint, body: any): AudioFormat[] {
  switch (endpoint.kind) {
    case 'invidious':
      return parseInvidious(body);
    case 'piped':
      return parsePiped(body);
    case 'custom':
      return parseCustom(body);
  }
}

/**
 * Resolves through a list of user-configured endpoints, remembering which one
 * last worked so the common case is a single request.
 */
export class EndpointStreamSource implements StreamSource {
  readonly id = 'endpoint';

  private endpoints: ResolverEndpoint[] = [];
  private preferred?: string;

  setEndpoints(endpoints: ResolverEndpoint[]): void {
    this.endpoints = endpoints.filter((e) => /^https?:\/\//.test(e.url));
    if (this.preferred && !this.endpoints.some((e) => e.url === this.preferred)) {
      this.preferred = undefined;
    }
  }

  getEndpoints(): ResolverEndpoint[] {
    return [...this.endpoints];
  }

  canHandle(track: Track): boolean {
    return track.provider === 'youtube' && this.endpoints.length > 0;
  }

  async resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    // Try the last known-good endpoint first.
    const ordered = [...this.endpoints].sort((a, b) =>
      a.url === this.preferred ? -1 : b.url === this.preferred ? 1 : 0
    );

    let lastError: AppError | undefined;

    for (const endpoint of ordered) {
      if (signal?.aborted) throw appError('timeout');

      try {
        const body = await fetchJson<any>(endpointUrl(endpoint, track.sourceId), {
          timeoutMs: 10_000,
          retries: 0,
          signal,
        });

        // Endpoints report unplayable videos in-band rather than via status.
        const reason: string | undefined = body?.error ?? body?.reason;
        if (reason) {
          if (/region|country|not available in/i.test(reason)) throw appError('region_restricted', reason);
          if (/private|removed|deleted|unavailable/i.test(reason)) {
            throw appError('track_unavailable', reason);
          }
          throw appError('source_unavailable', reason);
        }

        const best = bestAudio(parseFor(endpoint, body));
        if (!best?.url) throw appError('source_unavailable', 'No audio format returned');

        this.preferred = endpoint.url;
        return {
          url: best.url,
          mimeType: best.mimeType,
          bitrate: best.bitrate,
          expiresAt: Date.now() + STREAM_TTL,
          resolvedBy: `${this.id}:${endpoint.url}`,
        };
      } catch (e) {
        const err = toAppError(e, 'source_unavailable');
        // A definitively unplayable track will not become playable elsewhere.
        if (err.kind === 'track_unavailable' || err.kind === 'region_restricted') throw err;
        lastError = err;
      }
    }

    throw lastError ?? appError('source_unavailable');
  }
}

/**
 * Tries each source in order and returns the first stream it gets.
 */
export class StreamResolverChain {
  private sources: StreamSource[] = [];
  /** In-memory only: stream URLs are short-lived and never persisted. */
  private cache = new Map<string, ResolvedStream>();
  /** De-duplicates concurrent resolves of the same track (e.g. prefetch + play). */
  private inflight = new Map<string, Promise<ResolvedStream>>();

  use(source: StreamSource): this {
    this.sources.push(source);
    return this;
  }

  find<T extends StreamSource>(id: string): T | undefined {
    return this.sources.find((s) => s.id === id) as T | undefined;
  }

  /** True when at least one source could even attempt this track. */
  canResolve(track: Track): boolean {
    return this.sources.some((s) => s.canHandle(track));
  }

  peek(track: Track): ResolvedStream | undefined {
    const hit = this.cache.get(track.id);
    if (hit && hit.expiresAt > Date.now()) return hit;
    if (hit) this.cache.delete(track.id);
    return undefined;
  }

  invalidate(track: Track): void {
    this.cache.delete(track.id);
    this.inflight.delete(track.id);
  }

  async resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    const cached = this.peek(track);
    if (cached) return cached;

    const existing = this.inflight.get(track.id);
    if (existing) return existing;

    const promise = this.resolveUncached(track, signal).finally(() => {
      this.inflight.delete(track.id);
    });
    this.inflight.set(track.id, promise);
    return promise;
  }

  private async resolveUncached(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    const usable = this.sources.filter((s) => s.canHandle(track));

    if (!usable.length) {
      throw appErrorWithMessage(
        'source_unavailable',
        'No playback source yet. Tap the speaker icon to add one.',
        'no StreamSource can handle this track'
      );
    }

    let lastError: AppError | undefined;

    for (const source of usable) {
      try {
        const stream = await source.resolve(track, signal);
        this.cache.set(track.id, stream);
        return stream;
      } catch (e) {
        const err = toAppError(e, 'source_unavailable');
        if (err.kind === 'track_unavailable' || err.kind === 'region_restricted') throw err;
        lastError = err;
      }
    }

    throw lastError ?? appError('source_unavailable');
  }
}

export const endpointSource = new EndpointStreamSource();

export const streamResolver = new StreamResolverChain()
  .use(new DirectStreamSource())
  // Android resolves on-device first; every other platform falls straight
  // through to the configured endpoints, exactly as before.
  .use(new NativeStreamSource())
  .use(endpointSource);
