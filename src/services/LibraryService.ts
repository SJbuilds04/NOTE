import {
  readJson,
  writeJson,
  writeJsonDebounced,
  STORAGE_KEYS,
} from '../core/storage';
import { Playlist, Track } from '../core/types';

export type AppSettings = {
  /** User-supplied playback resolver endpoints. */
  resolverEndpoints: { url: string; kind: 'invidious' | 'piped' | 'custom' }[];
  volume: number;
  /** Skip music videos in favour of official audio where both exist. */
  preferAudioOnly: boolean;
  /** Keep the queue rolling with related tracks when it runs out. */
  autoplayRelated: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  resolverEndpoints: [],
  volume: 1,
  preferAudioOnly: true,
  autoplayRelated: true,
};

export type SavedPlaybackState = {
  trackId: string | null;
  position: number;
};

const MAX_RECENTS = 50;

/**
 * All locally-persisted user data: liked songs, playlists, recents, settings.
 * There is no remote database and no account -- this is the whole library.
 */
class LibraryServiceImpl {
  private liked: Track[] = [];
  private likedIds = new Set<string>();
  private playlists: Playlist[] = [];
  private recents: Track[] = [];
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private searchHistory: string[] = [];

  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    const [liked, playlists, recents, settings, history] = await Promise.all([
      readJson<Track[]>(STORAGE_KEYS.likedTracks, []),
      readJson<Playlist[]>(STORAGE_KEYS.playlists, []),
      readJson<Track[]>(STORAGE_KEYS.recentlyPlayed, []),
      readJson<Partial<AppSettings>>(STORAGE_KEYS.settings, {}),
      readJson<string[]>(STORAGE_KEYS.searchHistory, []),
    ]);

    this.liked = Array.isArray(liked) ? liked : [];
    this.likedIds = new Set(this.liked.map((t) => t.id));
    this.playlists = Array.isArray(playlists) ? playlists : [];
    this.recents = Array.isArray(recents) ? recents : [];
    this.settings = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
    this.searchHistory = Array.isArray(history) ? history : [];
  }

  // ---- liked songs ------------------------------------------------------

  getLiked(): Track[] {
    return [...this.liked];
  }

  isLiked(trackId: string): boolean {
    return this.likedIds.has(trackId);
  }

  /** Returns the new liked state. */
  toggleLike(track: Track): boolean {
    if (this.likedIds.has(track.id)) {
      this.likedIds.delete(track.id);
      this.liked = this.liked.filter((t) => t.id !== track.id);
      this.persistLiked();
      return false;
    }

    this.likedIds.add(track.id);
    // Newest first, matching how the UI lists them.
    this.liked = [stripStream(track), ...this.liked];
    this.persistLiked();
    return true;
  }

  private persistLiked(): void {
    writeJsonDebounced(STORAGE_KEYS.likedTracks, this.liked, 400);
  }

  // ---- playlists --------------------------------------------------------

  getPlaylists(): Playlist[] {
    return [...this.playlists];
  }

  getPlaylist(id: string): Playlist | undefined {
    return this.playlists.find((p) => p.id === id);
  }

  createPlaylist(
    name: string,
    options: {
      description?: string;
      creator?: string;
      coverImageUrl?: string;
      tracks?: Track[];
      source?: Playlist['source'];
    } = {}
  ): Playlist {
    const now = Date.now();
    const tracks = (options.tracks ?? []).map(stripStream);

    const playlist: Playlist = {
      id: `local:${now}:${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || 'New Playlist',
      description: options.description ?? '',
      creator: options.creator ?? 'You',
      coverImageUrl: options.coverImageUrl ?? tracks[0]?.albumImageUrl ?? '',
      tracks,
      source: options.source,
      createdAt: now,
      updatedAt: now,
    };

    this.playlists = [playlist, ...this.playlists];
    this.persistPlaylists();
    return playlist;
  }

  /** Import replaces an existing import of the same source rather than duplicating. */
  importPlaylist(
    name: string,
    tracks: Track[],
    source: NonNullable<Playlist['source']>,
    meta: { description?: string; creator?: string; coverImageUrl?: string } = {}
  ): Playlist {
    const existing = this.playlists.find(
      (p) => p.source?.provider === source.provider && p.source?.browseId === source.browseId
    );

    if (existing) {
      this.updatePlaylist(existing.id, {
        name,
        tracks: tracks.map(stripStream),
        description: meta.description ?? existing.description,
        coverImageUrl: meta.coverImageUrl || existing.coverImageUrl,
      });
      return this.getPlaylist(existing.id)!;
    }

    return this.createPlaylist(name, { ...meta, tracks, source });
  }

  updatePlaylist(id: string, patch: Partial<Omit<Playlist, 'id' | 'createdAt'>>): void {
    this.playlists = this.playlists.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
    );
    this.persistPlaylists();
  }

  deletePlaylist(id: string): void {
    this.playlists = this.playlists.filter((p) => p.id !== id);
    this.persistPlaylists();
  }

  addToPlaylist(playlistId: string, tracks: Track | Track[]): void {
    const incoming = (Array.isArray(tracks) ? tracks : [tracks]).map(stripStream);
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) return;

    const existing = new Set(playlist.tracks.map((t) => t.id));
    const fresh = incoming.filter((t) => !existing.has(t.id));
    if (!fresh.length) return;

    this.updatePlaylist(playlistId, { tracks: [...playlist.tracks, ...fresh] });
  }

  removeFromPlaylist(playlistId: string, trackId: string): void {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) return;

    this.updatePlaylist(playlistId, {
      tracks: playlist.tracks.filter((t) => t.id !== trackId),
    });
  }

  private persistPlaylists(): void {
    writeJsonDebounced(STORAGE_KEYS.playlists, this.playlists, 400);
  }

  // ---- recently played --------------------------------------------------

  getRecentlyPlayed(): Track[] {
    return [...this.recents];
  }

  recordPlay(track: Track): void {
    // Move to the front, dropping any earlier occurrence.
    this.recents = [stripStream(track), ...this.recents.filter((t) => t.id !== track.id)].slice(
      0,
      MAX_RECENTS
    );
    writeJsonDebounced(STORAGE_KEYS.recentlyPlayed, this.recents, 1000);
  }

  // ---- playback position ------------------------------------------------

  async getSavedPlayback(): Promise<SavedPlaybackState> {
    return readJson<SavedPlaybackState>(STORAGE_KEYS.playbackState, {
      trackId: null,
      position: 0,
    });
  }

  savePlayback(trackId: string | null, position: number): void {
    writeJsonDebounced(
      STORAGE_KEYS.playbackState,
      { trackId, position: Math.floor(position) },
      2000
    );
  }

  // ---- search history ---------------------------------------------------

  getSearchHistory(): string[] {
    return [...this.searchHistory];
  }

  recordSearch(query: string): void {
    const q = query.trim();
    if (q.length < 2) return;

    this.searchHistory = [q, ...this.searchHistory.filter((s) => s !== q)].slice(0, 12);
    writeJsonDebounced(STORAGE_KEYS.searchHistory, this.searchHistory, 1000);
  }

  clearSearchHistory(): void {
    this.searchHistory = [];
    void writeJson(STORAGE_KEYS.searchHistory, []);
  }

  // ---- settings ---------------------------------------------------------

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...patch };
    void writeJson(STORAGE_KEYS.settings, this.settings);
    return this.getSettings();
  }
}

/**
 * Resolved stream URLs are host-bound and expire; persisting them would mean
 * restoring a library full of dead links.
 */
function stripStream(track: Track): Track {
  if (!track.audioUrl) return track;
  const { audioUrl, ...rest } = track;
  return rest;
}

export const LibraryService = new LibraryServiceImpl();
