import { fetchJson } from '../../core/http';
import { appErrorWithMessage } from '../../core/errors';
import {
  emptySearchResults,
  SearchFilter,
  SearchResults,
  Track,
  trackKey,
} from '../../core/types';
import { PlaylistPage } from '../TrackResolver';
import { ResolverEndpoint } from '../stream/StreamResolver';
import { normalizePlaylistBrowseId } from './parse';

/**
 * Discovery through a configured resolver endpoint.
 *
 * On native, InnerTube is called directly and this is never used. In a browser
 * the same-origin policy blocks those requests outright, so when the user has
 * already configured an endpoint for playback we reuse it for search too --
 * Invidious and Piped both serve permissive CORS headers.
 *
 * No proxy of our own is involved; this is the user's own configured service.
 */

type Any = Record<string, any>;

const bestThumb = (list: Any[] | undefined): string => {
  if (!Array.isArray(list) || !list.length) return '';
  const sorted = [...list].sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0));
  return sorted[0]?.url ?? '';
};

/** Piped returns paths like "/watch?v=ID"; Invidious returns bare ids. */
const videoIdFrom = (value: string | undefined): string => {
  if (!value) return '';
  const match = value.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : '';
};

const playlistIdFrom = (value: string | undefined): string => {
  if (!value) return '';
  const match = value.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return match ? match[1] : value;
};

function invidiousTrack(v: Any): Track | null {
  const sourceId = videoIdFrom(v?.videoId);
  if (!sourceId) return null;

  const title = v?.title;
  if (!title) return null;

  return {
    id: trackKey('youtube', sourceId),
    title: String(title),
    artist: { id: String(v?.authorId ?? `yt-artist:${v?.author}`), name: String(v?.author ?? 'Unknown artist') },
    albumImageUrl: bestThumb(v?.videoThumbnails) || `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg`,
    duration: Number(v?.lengthSeconds) || 0,
    provider: 'youtube',
    sourceId,
  };
}

function pipedTrack(v: Any): Track | null {
  const sourceId = videoIdFrom(v?.url);
  if (!sourceId) return null;

  const title = v?.title ?? v?.name;
  if (!title) return null;

  return {
    id: trackKey('youtube', sourceId),
    title: String(title),
    artist: { id: String(v?.uploaderUrl ?? v?.uploaderName ?? 'unknown'), name: String(v?.uploaderName ?? 'Unknown artist') },
    albumImageUrl: v?.thumbnail || `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg`,
    duration: Number(v?.duration) > 0 ? Number(v.duration) : 0,
    provider: 'youtube',
    sourceId,
  };
}

const INVIDIOUS_TYPE: Record<SearchFilter, string> = {
  All: 'all',
  Songs: 'video',
  Artists: 'channel',
  Albums: 'playlist',
  Playlists: 'playlist',
};

const PIPED_FILTER: Record<SearchFilter, string> = {
  All: 'all',
  Songs: 'music_songs',
  Artists: 'channels',
  Albums: 'music_albums',
  Playlists: 'playlists',
};

async function searchOne(
  endpoint: ResolverEndpoint,
  query: string,
  filter: SearchFilter,
  signal?: AbortSignal
): Promise<SearchResults> {
  const base = endpoint.url.replace(/\/+$/, '');
  const results = emptySearchResults(query);

  if (endpoint.kind === 'piped') {
    const body = await fetchJson<Any>(
      `${base}/search?q=${encodeURIComponent(query)}&filter=${PIPED_FILTER[filter]}`,
      { timeoutMs: 12_000, retries: 0, signal }
    );

    for (const item of body?.items ?? []) {
      const type = String(item?.type ?? '');
      if (type === 'stream') {
        const t = pipedTrack(item);
        if (t) results.tracks.push(t);
      } else if (type === 'playlist') {
        const id = playlistIdFrom(item?.url);
        if (id) {
          results.playlists.push({
            id: `youtube:playlist:${normalizePlaylistBrowseId(id)}`,
            provider: 'youtube',
            browseId: normalizePlaylistBrowseId(id),
            name: String(item?.name ?? 'Playlist'),
            description: '',
            creator: String(item?.uploaderName ?? 'YouTube'),
            coverImageUrl: item?.thumbnail ?? '',
            trackCount: Number(item?.videos) || undefined,
          });
        }
      } else if (type === 'channel') {
        results.artists.push({
          id: `youtube:artist:${item?.url ?? item?.name}`,
          provider: 'youtube',
          browseId: String(item?.url ?? '').replace('/channel/', ''),
          name: String(item?.name ?? 'Artist'),
          imageUrl: item?.thumbnail ?? '',
        });
      }
    }

    return results;
  }

  // Invidious (and custom endpoints that speak its dialect).
  const body = await fetchJson<Any[]>(
    `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=${INVIDIOUS_TYPE[filter]}`,
    { timeoutMs: 12_000, retries: 0, signal }
  );

  for (const item of Array.isArray(body) ? body : []) {
    const type = String(item?.type ?? '');
    if (type === 'video') {
      const t = invidiousTrack(item);
      if (t) results.tracks.push(t);
    } else if (type === 'playlist') {
      const id = playlistIdFrom(item?.playlistId);
      if (id) {
        results.playlists.push({
          id: `youtube:playlist:${normalizePlaylistBrowseId(id)}`,
          provider: 'youtube',
          browseId: normalizePlaylistBrowseId(id),
          name: String(item?.title ?? 'Playlist'),
          description: '',
          creator: String(item?.author ?? 'YouTube'),
          coverImageUrl: item?.playlistThumbnail ?? '',
          trackCount: Number(item?.videoCount) || undefined,
        });
      }
    } else if (type === 'channel') {
      results.artists.push({
        id: `youtube:artist:${item?.authorId}`,
        provider: 'youtube',
        browseId: String(item?.authorId ?? ''),
        name: String(item?.author ?? 'Artist'),
        imageUrl: bestThumb(item?.authorThumbnails),
      });
    }
  }

  return results;
}

/** Try each endpoint until one answers. Returns null when none can. */
export async function searchViaEndpoint(
  endpoints: ResolverEndpoint[],
  query: string,
  filter: SearchFilter,
  signal?: AbortSignal
): Promise<SearchResults | null> {
  for (const endpoint of endpoints) {
    try {
      const results = await searchOne(endpoint, query, filter, signal);
      if (
        results.tracks.length ||
        results.playlists.length ||
        results.artists.length ||
        results.albums.length
      ) {
        return results;
      }
    } catch {
      // Try the next endpoint.
    }
  }
  return null;
}

export async function playlistViaEndpoint(
  endpoints: ResolverEndpoint[],
  browseId: string,
  signal?: AbortSignal
): Promise<PlaylistPage | null> {
  // Endpoint APIs want the raw id, without InnerTube's VL prefix.
  const rawId = browseId.replace(/^VL/, '');

  for (const endpoint of endpoints) {
    const base = endpoint.url.replace(/\/+$/, '');

    try {
      if (endpoint.kind === 'piped') {
        const body = await fetchJson<Any>(`${base}/playlists/${rawId}`, {
          timeoutMs: 12_000,
          retries: 0,
          signal,
        });

        const tracks = (body?.relatedStreams ?? [])
          .map(pipedTrack)
          .filter((t: Track | null): t is Track => t !== null);
        if (!tracks.length) continue;

        return {
          playlist: {
            id: `youtube:playlist:${normalizePlaylistBrowseId(rawId)}`,
            provider: 'youtube',
            browseId: normalizePlaylistBrowseId(rawId),
            name: String(body?.name ?? 'Playlist'),
            description: String(body?.description ?? ''),
            creator: String(body?.uploader ?? 'YouTube'),
            coverImageUrl: body?.thumbnailUrl ?? tracks[0]?.albumImageUrl ?? '',
            trackCount: tracks.length,
          },
          tracks,
        };
      }

      const body = await fetchJson<Any>(`${base}/api/v1/playlists/${rawId}`, {
        timeoutMs: 12_000,
        retries: 0,
        signal,
      });

      const tracks = (body?.videos ?? [])
        .map(invidiousTrack)
        .filter((t: Track | null): t is Track => t !== null);
      if (!tracks.length) continue;

      return {
        playlist: {
          id: `youtube:playlist:${normalizePlaylistBrowseId(rawId)}`,
          provider: 'youtube',
          browseId: normalizePlaylistBrowseId(rawId),
          name: String(body?.title ?? 'Playlist'),
          description: String(body?.description ?? ''),
          creator: String(body?.author ?? 'YouTube'),
          coverImageUrl: bestThumb(body?.authorThumbnails) || tracks[0]?.albumImageUrl || '',
          trackCount: tracks.length,
        },
        tracks,
      };
    } catch {
      // Try the next endpoint.
    }
  }

  return null;
}

export async function metadataViaEndpoint(
  endpoints: ResolverEndpoint[],
  sourceId: string,
  signal?: AbortSignal
): Promise<Track | null> {
  for (const endpoint of endpoints) {
    const base = endpoint.url.replace(/\/+$/, '');

    try {
      if (endpoint.kind === 'piped') {
        const body = await fetchJson<Any>(`${base}/streams/${sourceId}`, {
          timeoutMs: 10_000,
          retries: 0,
          signal,
        });
        if (!body?.title) continue;

        return {
          id: trackKey('youtube', sourceId),
          title: String(body.title),
          artist: { id: String(body?.uploaderUrl ?? 'unknown'), name: String(body?.uploader ?? 'Unknown artist') },
          albumImageUrl: body?.thumbnailUrl ?? `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg`,
          duration: Number(body?.duration) || 0,
          provider: 'youtube',
          sourceId,
        };
      }

      const body = await fetchJson<Any>(`${base}/api/v1/videos/${sourceId}`, {
        timeoutMs: 10_000,
        retries: 0,
        signal,
      });
      const track = invidiousTrack({ ...body, videoId: sourceId });
      if (track) return track;
    } catch {
      // Try the next endpoint.
    }
  }

  return null;
}

export const noEndpointsError = () =>
  appErrorWithMessage(
    'search_failed',
    "This browser blocks direct YouTube search. Open NØTE on your phone, or add a playback source to search from here.",
    'CORS-blocked InnerTube request and no resolver endpoint configured'
  );
