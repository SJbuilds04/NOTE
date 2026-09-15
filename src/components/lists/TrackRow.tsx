import React from 'react';
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
  onPress: () => void;
  isPlaying?: boolean;
  /** Shown while the row's target is being expanded or resolved. */
  isLoading?: boolean;
  onMorePress?: () => void;
}

export const TrackRow: React.FC<TrackRowProps> = ({
  track,
  onPress,
  isPlaying,
  isLoading,
  onMorePress,
}) => {
  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.7}
      onPress={onPress}
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
        <TouchableOpacity style={styles.moreButton} onPress={onMorePress}>
          <MoreVertical color={COLORS.text.secondary} size={20} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

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
