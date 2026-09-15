import React, { useCallback, useMemo } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { TrackRow } from '../components/lists/TrackRow';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { GlassCard } from '../components/common/GlassCard';
import { Track } from '../core/types';
import { HistoryEntry } from '../services/LibraryService';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useNavigation } from '@react-navigation/native';

type Section = { title: string; data: HistoryEntry[] };

const DAY = 24 * 60 * 60 * 1000;

/** Start of the local day `entry` falls in, for stable day comparisons. */
const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Group a flat, newest-first log into the buckets the UI shows.
 *
 * The log is already ordered, so one pass is enough and section order falls out
 * naturally -- no sorting per bucket.
 */
function groupByDay(entries: HistoryEntry[]): Section[] {
  const today = startOfDay(Date.now());
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const entry of entries) {
    const day = startOfDay(entry.playedAt);
    const age = today - day;

    let title: string;
    if (age <= 0) title = 'Today';
    else if (age === DAY) title = 'Yesterday';
    else if (age < 7 * DAY) title = 'Earlier this week';
    else title = 'Older';

    if (!current || current.title !== title) {
      current = { title, data: [] };
      sections.push(current);
    }
    current.data.push(entry);
  }

  return sections;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { playTrack, currentTrack, isPlaying, isLoading, togglePlayPause } = usePlayer();
  const { history, clearHistory } = useLibrary();

  const sections = useMemo(() => groupByDay(history), [history]);

  /** Playing from history queues the rest of the log behind it. */
  const onPlay = useCallback(
    (track: Track) => {
      const tracks = history.map((e) => e.track);
      playTrack(track, { tracks, label: 'History' });
    },
    [history, playTrack]
  );

  const renderItem = useCallback(
    ({ item }: { item: HistoryEntry }) => (
      <TrackRow
        track={item.track}
        onPress={onPlay}
        isPlaying={currentTrack?.id === item.track.id && isPlaying}
      />
    ),
    [onPlay, currentTrack?.id, isPlaying]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <Text style={styles.sectionTitle}>{section.title}</Text>
    ),
    []
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.lg }]}>
        <Text style={styles.title}>History</Text>
        {history.length > 0 && (
          <TouchableOpacity onPress={clearHistory} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.clear}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyWrap}>
          <GlassCard intensity={20} style={styles.emptyCard}>
            <Text style={styles.emptyText}>No listening history yet.</Text>
            <Text style={styles.emptyHint}>
              Play something and it will show up here.
            </Text>
          </GlassCard>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingBottom: SIZES.bottomInset }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          initialNumToRender={12}
          windowSize={9}
          removeClippedSubviews
        />
      )}

      <StatusBarScrim />

      {currentTrack && (
        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onPlayPause={togglePlayPause}
          onPress={() => navigation.navigate('NowPlaying' as never)}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 32,
    color: COLORS.text.primary,
  },
  clear: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  sectionTitle: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.text.secondary,
    paddingHorizontal: SIZES.md,
    paddingTop: SIZES.lg,
    paddingBottom: SIZES.sm,
  },
  emptyWrap: {
    paddingHorizontal: SIZES.md,
  },
  emptyCard: {
    padding: SIZES.lg,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: SIZES.xs,
  },
  emptyHint: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
  },
});
