import { fetchJson } from '../../core/http';
import { AppError, toAppError } from '../../core/errors';

/**
 * Minimal InnerTube client for YouTube Music.
 *
 * This is the same public, unauthenticated web endpoint the music.youtube.com
 * page itself calls. No API key, no account, no OAuth, no backend of our own.
 */

const BASE = 'https://music.youtube.com/youtubei/v1';

const CLIENT = {
  clientName: 'WEB_REMIX',
  clientVersion: '1.20240101.01.00',
  hl: 'en',
  gl: 'US',
};

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Goog-Visitor-Id': '',
  Origin: 'https://music.youtube.com',
  Referer: 'https://music.youtube.com/',
};

/** Search filter params, as used by the music.youtube.com front end. */
export const SEARCH_PARAMS = {
  songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
  videos: 'EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D',
  albums: 'EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D',
  artists: 'EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D',
  playlists: 'EgWKAQIoAWoKEAkQChAFEAMQBA%3D%3D',
} as const;

type Body = Record<string, unknown>;

async function call<T>(
  endpoint: string,
  body: Body,
  signal?: AbortSignal,
  kindOnFail: 'search_failed' | 'invalid_playlist' | 'track_unavailable' = 'search_failed'
): Promise<T> {
  try {
    return await fetchJson<T>(`${BASE}/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      headers: HEADERS,
      body: { context: { client: CLIENT }, ...body },
      timeoutMs: 12_000,
      retries: 1,
      signal,
    });
  } catch (e) {
    const err = toAppError(e, kindOnFail);
    // Preserve the precise kinds the HTTP layer already identified.
    if (
      err.kind === 'rate_limited' ||
      err.kind === 'network' ||
      err.kind === 'timeout'
    ) {
      throw err;
    }
    throw new AppError(kindOnFail, err.message, { detail: err.detail, cause: e });
  }
}

export const innertube = {
  search(query: string, params?: string, signal?: AbortSignal) {
    const body: Body = { query };
    if (params) body.params = params;
    return call<any>('search', body, signal, 'search_failed');
  },

  /** Continuation token from a previous search, for lazy "load more". */
  searchContinuation(continuation: string, signal?: AbortSignal) {
    return fetchJson<any>(
      `${BASE}/search?prettyPrint=false&continuation=${encodeURIComponent(continuation)}`,
      {
        method: 'POST',
        headers: HEADERS,
        body: { context: { client: CLIENT } },
        timeoutMs: 12_000,
        retries: 1,
        signal,
      }
    );
  },

  browse(browseId: string, signal?: AbortSignal) {
    return call<any>('browse', { browseId }, signal, 'invalid_playlist');
  },

  /** Related/radio queue for a video -- used to auto-extend the queue. */
  next(videoId: string, playlistId?: string, signal?: AbortSignal) {
    const body: Body = { videoId, isAudioOnly: true };
    if (playlistId) body.playlistId = playlistId;
    return call<any>('next', body, signal, 'track_unavailable');
  },

  suggestions(input: string, signal?: AbortSignal) {
    return call<any>('music/get_search_suggestions', { input }, signal, 'search_failed');
  },
};
