import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MoreVertical } from 'lucide-react-native';
import { Track } from '../../core/types';
import { COLORS, SIZES, FONTS } from '../../constants/theme';

interface TrackRowProps {
  track: Track;
  /** Receives the row's track, so one stable callback can serve a whole list. */
  onPress: (track: Track) => void;
  isPlaying?: boolean;
  /** Shown while the row's target is being expanded or resolved. */
  isLoading?: boolean;
  onMorePress?: (track: Track) => void;
}

const TrackRowComponent: React.FC<TrackRowProps> = ({
  track,
  onPress,
  isPlaying,
  isLoading,
  onMorePress,
}) => {
  const handlePress = useCallback(() => onPress(track), [onPress, track]);
  const handleMorePress = useCallback(
    () => onMorePress?.(track),
    [onMorePress, track]
  );

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.7}
      onPress={handlePress}
    >
      <Image source={{ uri: track.albumImageUrl }} style={styles.image} />

      <View style={styles.infoContainer}>
        <Text style={[styles.title, isPlaying && styles.playingTitle]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist.name}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.moreButton}>
          <ActivityIndicator size="small" color={COLORS.text.secondary} />
        </View>
      ) : (
        <TouchableOpacity style={styles.moreButton} onPress={handleMorePress}>
          <MoreVertical color={COLORS.text.secondary} size={20} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

/**
 * Memoized: a track row only re-renders when its own props change.
 *
 * Lists re-render whenever playback state changes; without this every row in
 * a 50-row search result rebuilt its Image and Text nodes on each tap.
 */
export const TrackRow = React.memo(TrackRowComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm,
    paddingHorizontal: SIZES.md,
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
  },
  infoContainer: {
    flex: 1,
    marginLeft: SIZES.md,
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: 2,
  },
  playingTitle: {
    color: COLORS.accent.green,
  },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  moreButton: {
    padding: SIZES.sm,
  }
});
