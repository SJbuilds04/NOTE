import {
  Album,
  ArtistResult,
  ProviderId,
  RemotePlaylist,
  ResolvedStream,
  SearchFilter,
  SearchResults,
  Track,
} from '../core/types';

export type SearchOptions = {
  filter?: SearchFilter;
  limit?: number;
  signal?: AbortSignal;
};

export type PlaylistPage = {
  playlist: RemotePlaylist;
  tracks: Track[];
  /** Token for the next page, when the playlist is longer than one page. */
  continuation?: string;
};

/**
 * The contract every music provider implements.
 *
 * Nothing above this interface knows which provider it is talking to, so a new
 * provider is added by writing one class and registering it -- no changes to
 * MusicService, the playback engine, or any screen.
 */
export interface TrackResolver {
  readonly id: ProviderId;
  readonly name: string;

  /** Discovery. Returns normalized results for the given filter. */
  search(query: string, options?: SearchOptions): Promise<SearchResults>;

  /**
   * Turn a track into something playable. Implementations return a stream URL
   * with an expiry, or throw an AppError describing why they could not.
   */
  resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream>;

  /** Full metadata for one track, by provider-native id. */
  getMetadata(sourceId: string, signal?: AbortSignal): Promise<Track>;

  /** Expand a provider playlist into tracks. */
  getPlaylist(
    browseId: string,
    options?: { continuation?: string; signal?: AbortSignal }
  ): Promise<PlaylistPage>;

  /** Tracks of an album. */
  getAlbum?(browseId: string, signal?: AbortSignal): Promise<PlaylistPage>;

  /** Top tracks for an artist. */
  getArtistTracks?(browseId: string, signal?: AbortSignal): Promise<Track[]>;

  /** Related tracks, used to keep the queue going after the last item. */
  getRelated?(track: Track, signal?: AbortSignal): Promise<Track[]>;

  /** Search-as-you-type suggestions. */
  getSuggestions?(input: string, signal?: AbortSignal): Promise<string[]>;

  /** Recognize a pasted URL/id this provider can import. */
  parseShareUrl?(input: string): { kind: 'playlist' | 'album' | 'track'; id: string } | null;
}

/**
 * Registry of available providers. `ProviderAdapter` in the architecture
 * diagram -- the single place the app looks up who owns a given track.
 */
class ProviderRegistry {
  private providers = new Map<ProviderId, TrackResolver>();
  private defaultId?: ProviderId;

  register(provider: TrackResolver, asDefault = false): void {
    this.providers.set(provider.id, provider);
    if (asDefault || !this.defaultId) this.defaultId = provider.id;
  }

  get(id: ProviderId): TrackResolver {
    const p = this.providers.get(id);
    if (!p) throw new Error(`No provider registered for "${id}"`);
    return p;
  }

  /** The provider that owns a track, derived from the track itself. */
  forTrack(track: Track): TrackResolver {
    return this.get(track.provider);
  }

  get default(): TrackResolver {
    if (!this.defaultId) throw new Error('No providers registered');
    return this.get(this.defaultId);
  }

  all(): TrackResolver[] {
    return [...this.providers.values()];
  }
}

export const providers = new ProviderRegistry();

export type { Album, ArtistResult, RemotePlaylist, SearchResults, Track };
