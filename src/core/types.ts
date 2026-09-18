/**
 * Canonical domain model for NØTE.
 *
 * Every provider normalizes into these shapes, so nothing above the
 * ProviderAdapter layer ever sees provider-specific data.
 */

export type ProviderId = 'youtube';

export type Artist = {
  id: string;
  name: string;
  imageUrl?: string;
};

/**
 * The single normalized track object used by the whole app.
 *
 * `id` is a stable composite key (`<provider>:<sourceId>`) so tracks from
 * different providers can never collide in the queue or the library.
 */
export type Track = {
  id: string;
  title: string;
  artist: Artist;
  albumImageUrl: string;
  duration: number; // seconds; 0 when the provider did not report one
  audioUrl?: string; // populated only once a stream has been resolved

  provider: ProviderId;
  sourceId: string; // provider-native id (YouTube videoId)
  album?: string;
  explicit?: boolean;
  isVideo?: boolean; // a music video rather than an official audio track
};

export type Album = {
  id: string;
  provider: ProviderId;
  browseId: string;
  title: string;
  artist: string;
  coverImageUrl: string;
  year?: string;
  trackCount?: number;
};

export type ArtistResult = {
  id: string;
  provider: ProviderId;
  browseId: string;
  name: string;
  imageUrl: string;
  subtitle?: string;
};

/** A playlist that lives on a provider (not one the user created locally). */
export type RemotePlaylist = {
  id: string;
  provider: ProviderId;
  browseId: string;
  name: string;
  description: string;
  creator: string;
  coverImageUrl: string;
  trackCount?: number;
};

/** A playlist stored in the local library. Mirrors the shape the UI renders. */
export type Playlist = {
  id: string;
  name: string;
  description: string;
  creator: string;
  coverImageUrl: string;
  tracks: Track[];
  /** Set when this playlist was imported from a provider. */
  source?: { provider: ProviderId; browseId: string };
  createdAt: number;
  updatedAt: number;
};

export type SearchFilter = 'All' | 'Songs' | 'Artists' | 'Albums' | 'Playlists';

export type SearchResults = {
  query: string;
  tracks: Track[];
  artists: ArtistResult[];
  albums: Album[];
  playlists: RemotePlaylist[];
};

/**
 * A fresh, independent empty result set.
 *
 * Always build results with this rather than spreading a shared constant: a
 * spread copies the arrays by reference, so pushing into the copy would
 * silently append to every other "empty" result in the app.
 */
export const emptySearchResults = (query = ''): SearchResults => ({
  query,
  tracks: [],
  artists: [],
  albums: [],
  playlists: [],
});

/** Read-only empty results, safe to use as an initial state value. */
export const EMPTY_SEARCH_RESULTS: SearchResults = Object.freeze({
  query: '',
  tracks: Object.freeze([]) as unknown as Track[],
  artists: Object.freeze([]) as unknown as ArtistResult[],
  albums: Object.freeze([]) as unknown as Album[],
  playlists: Object.freeze([]) as unknown as RemotePlaylist[],
});

/** A playable audio source resolved for a track. */
export type ResolvedStream = {
  url: string;
  mimeType?: string;
  bitrate?: number;
  /** Epoch ms after which the URL should be treated as stale. */
  expiresAt: number;
  resolvedBy: string;
  /**
   * Headers the player must send when fetching this URL.
   *
   * googlevideo URLs are tied to the client that extracted them: fetching one
   * with a different User-Agent than the extractor used returns HTTP 403.
   */
  headers?: Record<string, string>;
};

export type RepeatMode = 'off' | 'all' | 'one';

export type Category = {
  id: string;
  name: string;
  color: string;
  /** The real search executed when this category is tapped. */
  query: string;
};

export const trackKey = (provider: ProviderId, sourceId: string) =>
  `${provider}:${sourceId}`;
