/**
 * Compatibility shim.
 *
 * This module used to hold hard-coded tracks and playlists. All music now
 * comes from the provider layer, so only the type re-exports remain -- they
 * keep existing imports (`import { Track } from '../data/mock'`) working.
 *
 * Prefer importing from `../core/types` in new code.
 */
export type {
  Artist,
  Track,
  Playlist,
  Category,
  Album,
  ArtistResult,
  RemotePlaylist,
} from '../core/types';

export { BROWSE_CATEGORIES, QUICK_ACTIONS, FEATURED_QUERY } from './catalog';
