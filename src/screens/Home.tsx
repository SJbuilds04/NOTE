import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Play, Heart, Compass, Moon, Target } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { Pill } from '../components/common/Pill';
import { GlassCard } from '../components/common/GlassCard';
import { TrackRow } from '../components/lists/TrackRow';
import { Track } from '../core/types';
import { FEATURED_QUERY } from '../data/catalog';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { MusicService } from '../services/MusicService';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { useNavigation } from '@react-navigation/native';

const CATEGORIES = ['Music', 'Podcasts', 'Radio'];

/** Each quick action maps to a real query, except Liked which uses the library. */
const ACTIONS = [
  { id: 'liked', label: 'Liked', Icon: Heart, query: null },
  { id: 'discover', label: 'Discover', Icon: Compass, query: 'discover new music' },
  { id: 'chill', label: 'Chill', Icon: Moon, query: 'chill relaxing songs' },
  { id: 'focus', label: 'Focus', Icon: Target, query: 'focus instrumental concentration' },
] as const;

const greetingFor = (hour: number) =>
  hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [activeCategory, setActiveCategory] = useState('Music');
  const { playTrack, currentTrack, isPlaying, togglePlayPause, isLoading } = usePlayer();
  const { recentlyPlayed, liked, profile } = useLibrary();

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [featured, setFeatured] = useState<Track[]>([]);

  /** Shown before anything has been played: a live pick, not mock data. */
  const [starter, setStarter] = useState<Track[]>([]);
  const [starterError, setStarterError] = useState(false);

  const hasRecents = recentlyPlayed.length > 0;

  // Prefetch a small starter set in the background so a fresh install is not
  // an empty screen. Cached, so this costs nothing on later launches.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const results = await MusicService.search(FEATURED_QUERY, { limit: 10 });
        if (cancelled) return;

        setFeatured(results.tracks);
        setStarter(results.tracks.slice(0, 3));
        setStarterError(false);
      } catch {
        if (!cancelled) setStarterError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const runAction = useCallback(
    async (action: (typeof ACTIONS)[number]) => {
      if (action.query === null) {
        // Liked: play straight from the local library, no network needed.
        if (liked.length) playTrack(liked[0], { tracks: liked, label: 'Liked Songs' });
        return;
      }

      setPendingAction(action.id);
      try {
        const results = await MusicService.search(action.query, { limit: 25 });
        if (results.tracks.length) {
          playTrack(results.tracks[0], { tracks: results.tracks, label: action.label });
        }
      } catch {
        // Silent: the tile simply stops spinning.
      } finally {
        setPendingAction(null);
      }
    },
    [liked, playTrack]
  );

  const playFeatured = useCallback(() => {
    if (!featured.length) return;
    playTrack(featured[0], { tracks: featured, label: 'A calmer you' });
  }, [featured, playTrack]);

  const listTracks = useMemo(
    () => (hasRecents ? recentlyPlayed.slice(0, 3) : starter),
    [hasRecents, recentlyPlayed, starter]
  );

  // One stable callback for the whole list instead of a closure per row.
  const handleTrackPress = useCallback(
    (track: Track) => {
      playTrack(track, {
        tracks: listTracks,
        label: hasRecents ? 'Recently Played' : 'Start Listening',
      });
    },
    [playTrack, listTracks, hasRecents]
  );

  return (
    <View style={styles.container}>
      {/* Pinned: greeting + search stay put while the rest of the page scrolls. */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top + SIZES.lg }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greetingFor(new Date().getHours())}</Text>
            {!!profile.name && <Text style={styles.name}>{profile.name}.</Text>}
          </View>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop' }}
            style={styles.avatar}
          />
        </View>

        <TouchableOpacity
          style={styles.searchBar}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('SearchTab' as never)}
        >
          <Search color={COLORS.text.secondary} size={20} />
          <Text style={styles.searchText}>Search for songs, artists, or more...</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: SIZES.bottomInset }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pillsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {CATEGORIES.map(cat => (
              <Pill
                key={cat}
                label={cat}
                isActive={activeCategory === cat}
                onPress={() => setActiveCategory(cat)}
              />
            ))}
          </ScrollView>
        </View>

        <GlassCard style={styles.featuredCard}>
          <View style={styles.featuredContent}>
            <Text style={styles.featuredText}>A calmer you</Text>
            <Text style={styles.featuredText}>A softer tomorrow.</Text>
          </View>
          <TouchableOpacity style={styles.featuredPlayBtn} onPress={playFeatured}>
            <Play color={COLORS.background} size={24} fill={COLORS.background} />
          </TouchableOpacity>
        </GlassCard>

        {/* Quick action buttons row (Liked, Discover, Chill, Focus) */}
        <View style={styles.actionsRow}>
          {ACTIONS.map(action => (
            <TouchableOpacity
              key={action.id}
              style={styles.actionTouchable}
              activeOpacity={0.8}
              onPress={() => runAction(action)}
            >
              <GlassCard style={styles.actionCard} intensity={20}>
                <View style={styles.actionIconPlaceholder}>
                  {pendingAction === action.id ? (
                    <ActivityIndicator size="small" color={COLORS.text.secondary} />
                  ) : (
                    <action.Icon color={COLORS.text.secondary} size={18} />
                  )}
                </View>
                <Text style={styles.actionText}>{action.label}</Text>
              </GlassCard>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {hasRecents ? 'Recently Played' : 'Start Listening'}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('LibraryTab' as never)}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          {listTracks.length > 0 ? (
            listTracks.map(track => (
              <TrackRow
                key={track.id}
                track={track}
                onPress={handleTrackPress}
                isPlaying={currentTrack?.id === track.id && isPlaying}
              />
            ))
          ) : (
            <GlassCard intensity={20} style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {starterError ? "Couldn't load suggestions." : 'Finding something for you...'}
              </Text>
              <Text style={styles.emptyHint}>
                {starterError
                  ? 'Check your connection and pull to retry.'
                  : 'Search for anything to get started.'}
              </Text>
            </GlassCard>
          )}
        </View>

      </ScrollView>

      <StatusBarScrim />

      {currentTrack && (
        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onPlayPause={togglePlayPause}
          onPress={() => {
            navigation.navigate('NowPlaying' as never);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: SIZES.md,
  },
  stickyHeader: {
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.sm,
    backgroundColor: COLORS.background,
    zIndex: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SIZES.lg,
  },
  greeting: {
    fontFamily: FONTS.regular,
    fontSize: 20,
    color: COLORS.text.secondary,
  },
  name: {
    fontFamily: FONTS.medium,
    fontSize: 28,
    color: COLORS.text.primary,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: SIZES.radius.md,
    padding: SIZES.md,
    marginBottom: SIZES.md,
  },
  searchText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    marginLeft: SIZES.sm,
  },
  pillsContainer: {
    marginBottom: SIZES.lg,
  },
  featuredCard: {
    padding: SIZES.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    marginBottom: SIZES.md,
  },
  featuredContent: {
    justifyContent: 'center',
  },
  featuredText: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    opacity: 0.9,
  },
  featuredPlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.text.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SIZES.xl,
  },
  actionTouchable: {
    flex: 1,
  },
  actionCard: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: SIZES.md,
    alignItems: 'center',
  },
  actionIconPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.text.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.sm,
    paddingHorizontal: SIZES.xs,
  },
  sectionTitle: {
    fontFamily: FONTS.medium,
    fontSize: 18,
    color: COLORS.text.primary,
  },
  seeAll: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  listContainer: {
    marginBottom: SIZES.xl,
  },
  emptyCard: {
    padding: SIZES.md,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
  },
  emptyHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 4,
  },
});
