import { metadataCache, TTL } from '../../core/cache';
import { appError, AppError, toAppError } from '../../core/errors';
import {
  emptySearchResults,
  RemotePlaylist,
  ResolvedStream,
  SearchFilter,
  SearchResults,
  Track,
  trackKey,
} from '../../core/types';
import { PlaylistPage, SearchOptions, TrackResolver } from '../TrackResolver';
import { endpointSource, streamResolver } from '../stream/StreamResolver';
import {
  metadataViaEndpoint,
  noEndpointsError,
  playlistViaEndpoint,
  searchViaEndpoint,
} from './endpointSearch';
import { innertube, SEARCH_PARAMS } from './innertube';
import {
  classifyItem,
  collectSearchItems,
  collectShelfItems,
  findContinuation,
  normalizePlaylistBrowseId,
  parseAlbumItem,
  parseArtistItem,
  parseBrowseHeader,
  parsePlaylistItem,
  parseTrackItem,
} from './parse';

const PARAMS_FOR_FILTER: Record<SearchFilter, string | undefined> = {
  All: undefined,
  Songs: SEARCH_PARAMS.songs,
  Artists: SEARCH_PARAMS.artists,
  Albums: SEARCH_PARAMS.albums,
  Playlists: SEARCH_PARAMS.playlists,
};

export class YouTubeResolver implements TrackResolver {
  readonly id = 'youtube' as const;
  readonly name = 'YouTube Music';

  async search(query: string, options: SearchOptions = {}): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return emptySearchResults();

    const filter = options.filter ?? 'All';
    const limit = options.limit ?? 20;
    const cacheKey = `yt:search:${filter}:${q.toLowerCase()}`;

    const cached = metadataCache.get<SearchResults>(cacheKey);
    if (cached) return cached;

    let results: SearchResults;

    try {
      const response = await innertube.search(q, PARAMS_FOR_FILTER[filter], options.signal);
      results = this.parseSearchResponse(q, response, filter, limit);
    } catch (e) {
      const err = toAppError(e, 'search_failed');
      if (options.signal?.aborted) throw err;

      // A browser blocks direct InnerTube calls (same-origin policy), which
      // surfaces as a network error. Fall back to the user's own endpoint.
      const fallback = await this.viaEndpoint(() =>
        searchViaEndpoint(endpointSource.getEndpoints(), q, filter, options.signal)
      );
      if (!fallback) throw this.discoveryError(err);

      results = fallback;
      results.tracks = results.tracks.slice(0, limit);
    }

    metadataCache.set(cacheKey, results, TTL.search);

    // Individual tracks are worth caching on their own -- a later
    // getMetadata() or queue restore then costs nothing.
    for (const t of results.tracks) {
      metadataCache.set(`yt:track:${t.sourceId}`, t, TTL.track);
    }

    return results;
  }

  /** Run an endpoint fallback, treating "no endpoints" as simply unavailable. */
  private async viaEndpoint<T>(run: () => Promise<T | null>): Promise<T | null> {
    if (!endpointSource.getEndpoints().length) return null;
    try {
      return await run();
    } catch {
      return null;
    }
  }

  /**
   * When direct discovery is blocked and no endpoint is configured, say so
   * specifically rather than reporting a generic network failure.
   */
  private discoveryError(original: AppError): AppError {
    const blocked = original.kind === 'network' || original.kind === 'timeout';
    if (blocked && !endpointSource.getEndpoints().length) return noEndpointsError();
    return original;
  }

  private parseSearchResponse(
    query: string,
    response: any,
    filter: SearchFilter,
    limit: number
  ): SearchResults {
    const results = emptySearchResults(query);

    // Classify per item rather than per shelf: YouTube serves unfiltered
    // results as untitled sections, so shelf headings cannot be relied on.
    for (const item of collectSearchItems(response?.contents)) {
      switch (classifyItem(item)) {
        case 'track': {
          const t = parseTrackItem(item);
          if (t) results.tracks.push(t);
          break;
        }
        case 'artist': {
          const a = parseArtistItem(item);
          if (a) results.artists.push(a);
          break;
        }
        case 'album': {
          const a = parseAlbumItem(item);
          if (a) results.albums.push(a);
          break;
        }
        case 'playlist': {
          const p = parsePlaylistItem(item);
          if (p) results.playlists.push(p);
          break;
        }
      }
    }

    // De-duplicate: an unfiltered search often repeats the top result.
    results.tracks = dedupeBy(results.tracks, (t) => t.id).slice(0, limit);
    results.artists = dedupeBy(results.artists, (a) => a.id).slice(0, limit);
    results.albums = dedupeBy(results.albums, (a) => a.id).slice(0, limit);
    results.playlists = dedupeBy(results.playlists, (p) => p.id).slice(0, limit);

    return results;
  }

  async resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    return streamResolver.resolve(track, signal);
  }

  async getMetadata(sourceId: string, signal?: AbortSignal): Promise<Track> {
    const cacheKey = `yt:track:${sourceId}`;
    const cached = metadataCache.get<Track>(cacheKey);
    if (cached) return cached;

    // `next` returns the watch queue, whose first entry is the track itself.
    let track: Track | null = null;

    try {
      const response = await innertube.next(sourceId, undefined, signal);
      track = this.firstTrackFromNext(response, sourceId);
    } catch (e) {
      const err = toAppError(e, 'track_unavailable');
      track = await this.viaEndpoint(() =>
        metadataViaEndpoint(endpointSource.getEndpoints(), sourceId, signal)
      );
      if (!track) throw err;
    }

    if (!track) throw appError('track_unavailable', `No metadata for ${sourceId}`);

    metadataCache.set(cacheKey, track, TTL.track);
    return track;
  }

  private firstTrackFromNext(response: any, sourceId: string): Track | null {
    const items = deepCollect(response, 'playlistPanelVideoRenderer');
    const match = items.find((i: any) => i?.videoId === sourceId) ?? items[0];
    return this.parsePanelItem(match);
  }

  /** Parse one `playlistPanelVideoRenderer` (the watch-queue row shape). */
  private parsePanelItem(match: any): Track | null {
    if (!match) return null;

    const sourceId: string | undefined = match?.videoId;
    if (!sourceId) return null;

    const thumbs = match?.thumbnail?.thumbnails ?? [];
    const artistName =
      (match?.longBylineText?.runs ?? match?.shortBylineText?.runs ?? [])
        .map((r: any) => r?.text)
        .filter((t: string) => t && t !== ' • ')[0] ?? 'Unknown artist';

    const title = (match?.title?.runs ?? []).map((r: any) => r?.text).join('');
    const lengthText = (match?.lengthText?.runs ?? []).map((r: any) => r?.text).join('');

    if (!title) return null;

    return {
      id: trackKey('youtube', sourceId),
      title,
      artist: { id: `yt-artist:${artistName}`, name: artistName },
      albumImageUrl: thumbs[thumbs.length - 1]?.url ?? '',
      duration: parseTimeText(lengthText),
      provider: 'youtube',
      sourceId,
    };
  }

  async getPlaylist(
    browseId: string,
    options: { continuation?: string; signal?: AbortSignal } = {}
  ): Promise<PlaylistPage> {
    const id = normalizePlaylistBrowseId(browseId);
    if (!id) throw appError('invalid_playlist', 'Empty playlist id');

    const cacheKey = `yt:playlist:${id}${options.continuation ? ':cont' : ''}`;
    if (!options.continuation) {
      const cached = metadataCache.get<PlaylistPage>(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = options.continuation
        ? await innertube.searchContinuation(options.continuation, options.signal)
        : await innertube.browse(id, options.signal);

      const tracks = collectShelfItems(response?.contents ?? response)
        .flatMap((s) => s.items)
        .map(parseTrackItem)
        .filter((t): t is Track => t !== null);

      if (!tracks.length && !options.continuation) {
        throw appError('invalid_playlist', `Playlist ${id} returned no tracks`);
      }

      const header = parseBrowseHeader(response);
      const playlist: RemotePlaylist = {
        id: `youtube:playlist:${id}`,
        provider: 'youtube',
        browseId: id,
        name: header?.name ?? 'Playlist',
        description: header?.description ?? '',
        creator: header?.creator ?? 'YouTube Music',
        coverImageUrl: header?.coverImageUrl || tracks[0]?.albumImageUrl || '',
        trackCount: tracks.length,
      };

      const page: PlaylistPage = {
        playlist,
        tracks: dedupeBy(tracks, (t) => t.id),
        continuation: findContinuation(response),
      };

      if (!options.continuation) metadataCache.set(cacheKey, page, TTL.playlist);
      for (const t of page.tracks) {
        metadataCache.set(`yt:track:${t.sourceId}`, t, TTL.track);
      }

      return page;
    } catch (e) {
      const err = toAppError(e, 'invalid_playlist');

      // Continuations are endpoint-specific, so only the first page can fall back.
      if (!options.continuation) {
        const fallback = await this.viaEndpoint(() =>
          playlistViaEndpoint(endpointSource.getEndpoints(), id, options.signal)
        );
        if (fallback) {
          metadataCache.set(cacheKey, fallback, TTL.playlist);
          for (const t of fallback.tracks) {
            metadataCache.set(`yt:track:${t.sourceId}`, t, TTL.track);
          }
          return fallback;
        }
      }

      throw err;
    }
  }

  async getAlbum(browseId: string, signal?: AbortSignal): Promise<PlaylistPage> {
    // Albums browse through the same endpoint, just without the VL prefix.
    return this.getPlaylist(browseId, { signal });
  }

  async getArtistTracks(browseId: string, signal?: AbortSignal): Promise<Track[]> {
    try {
      const response = await innertube.browse(browseId, signal);
      return dedupeBy(
        collectShelfItems(response?.contents)
          .flatMap((s) => s.items)
          .map(parseTrackItem)
          .filter((t): t is Track => t !== null),
        (t) => t.id
      );
    } catch (e) {
      throw toAppError(e, 'search_failed');
    }
  }

  async getRelated(track: Track, signal?: AbortSignal): Promise<Track[]> {
    try {
      const response = await innertube.next(track.sourceId, undefined, signal);
      const items = deepCollect(response, 'playlistPanelVideoRenderer');

      return dedupeBy(
        items
          .map((i: any) => this.parsePanelItem(i))
          .filter((t): t is Track => t !== null && t.sourceId !== track.sourceId),
        (t) => t.id
      );
    } catch {
      // Related tracks are a nicety -- never surface a failure for them.
      return [];
    }
  }

  async getSuggestions(input: string, signal?: AbortSignal): Promise<string[]> {
    const q = input.trim();
    if (q.length < 2) return [];

    const cacheKey = `yt:suggest:${q.toLowerCase()}`;
    const cached = metadataCache.get<string[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await innertube.suggestions(q, signal);
      const suggestions = deepCollect(response, 'searchSuggestionRenderer')
        .map((s: any) =>
          (s?.suggestion?.runs ?? []).map((r: any) => r?.text ?? '').join('')
        )
        .filter(Boolean)
        .slice(0, 8);

      metadataCache.set(cacheKey, suggestions, TTL.suggestions);
      return suggestions;
    } catch {
      return [];
    }
  }

  /**
   * Recognizes the URL forms a user is likely to paste: a YouTube or
   * YouTube Music playlist/watch link, or a bare playlist id.
   */
  parseShareUrl(input: string): { kind: 'playlist' | 'album' | 'track'; id: string } | null {
    const raw = input.trim();
    if (!raw) return null;

    // Bare ids.
    if (/^(VL)?(PL|OL|RD|UU|LL)[A-Za-z0-9_-]{10,}$/.test(raw)) {
      return { kind: 'playlist', id: normalizePlaylistBrowseId(raw) };
    }
    if (/^MPRE[A-Za-z0-9_-]+$/.test(raw)) return { kind: 'album', id: raw };
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return { kind: 'track', id: raw };

    let url: URL;
    try {
      url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    } catch {
      return null;
    }

    if (!/(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com)$/i.test(url.hostname)) {
      return null;
    }

    const list = url.searchParams.get('list');
    if (list) return { kind: 'playlist', id: normalizePlaylistBrowseId(list) };

    const v = url.searchParams.get('v');
    if (v) return { kind: 'track', id: v };

    // youtu.be/<id> and /browse/<MPRE...>
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (url.hostname.includes('youtu.be') && last) return { kind: 'track', id: last };
    if (last?.startsWith('MPRE')) return { kind: 'album', id: last };
    if (last && /^(VL)?(PL|OL|RD)/.test(last)) {
      return { kind: 'playlist', id: normalizePlaylistBrowseId(last) };
    }

    return null;
  }
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function parseTimeText(text: string): number {
  if (!text) return 0;
  const parts = text.trim().split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((total, p) => total * 60 + p, 0);
}

/** Collect every value stored under `key` anywhere in a renderer tree. */
function deepCollect(node: any, key: string): any[] {
  const found: any[] = [];

  const visit = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n[key]) found.push(n[key]);
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v);
    }
  };

  visit(node);
  return found;
}

export const youtubeResolver = new YouTubeResolver();
