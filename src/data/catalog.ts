import { Category } from '../core/types';

/**
 * Browse categories shown on the Search screen.
 *
 * These are not mock content: each one runs a real search against the
 * provider when tapped. The colours match the existing visual design.
 */
export const BROWSE_CATEGORIES: Category[] = [
  { id: 'c1', name: 'Charts', color: '#1DB954', query: 'top hits this week' },
  { id: 'c2', name: 'New Releases', color: '#8A2BE2', query: 'new music releases' },
  { id: 'c3', name: 'Moods', color: '#FF7F50', query: 'chill mood playlist' },
  { id: 'c4', name: 'Indian', color: '#DAA520', query: 'bollywood hits' },
  { id: 'c5', name: 'Hip-Hop', color: '#4682B4', query: 'hip hop essentials' },
  { id: 'c6', name: 'Pop', color: '#FF69B4', query: 'pop hits' },
  { id: 'c7', name: 'EDM', color: '#00CED1', query: 'edm dance mix' },
  { id: 'c8', name: 'Rock', color: '#B22222', query: 'rock classics' },
];

/**
 * Query pools for the Home quick actions.
 *
 * Each tap picks one at random so the tile does not return the same list
 * every time. Liked is absent because it plays from the local library.
 */
export const ACTION_QUERIES: Record<string, string[]> = {
  discover: [
    'trending songs this week',
    'viral hits right now',
    'top global chart songs',
    'new music this month',
    'breakout artists 2026',
    'most played songs today',
  ],
  chill: [
    'chill relaxing songs',
    'lofi chill beats',
    'acoustic chill playlist',
    'calm indie chill',
    'soft rnb chill',
    'sunset chill mix',
  ],
  focus: [
    'focus instrumental concentration',
    'deep focus study music',
    'ambient focus no lyrics',
    'piano focus instrumental',
    'minimal techno focus',
    'nature focus soundscape',
  ],
};

/** A random query for a quick action, or null when it has no pool. */
export function randomQueryFor(actionId: string): string | null {
  const pool = ACTION_QUERIES[actionId];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** The quick-action tiles on Home, each backed by a real query. */
export const QUICK_ACTIONS = [
  { id: 'liked', label: 'Liked', query: null },
  { id: 'discover', label: 'Discover', query: 'discover new music' },
  { id: 'chill', label: 'Chill', query: 'chill relaxing songs' },
  { id: 'focus', label: 'Focus', query: 'focus instrumental concentration' },
] as const;

/** Seeds the Home featured card. */
export const FEATURED_QUERY = 'calm ambient evening';
