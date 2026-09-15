import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Play, Pause, MonitorSpeaker } from 'lucide-react-native';
import { Track } from '../../core/types';
import { useProgress } from '../../hooks/usePlayer';
import { PlaybackSourceSheet } from './PlaybackSourceSheet';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';

interface MiniPlayerProps {
  track: Track | null;
  isPlaying: boolean;
  onPress: () => void;
  onPlayPause: () => void;
  tabBarHeight?: number;
  isLoading?: boolean;
}

/**
 * Only this subtree subscribes to playback position.
 *
 * useProgress fires ~4x a second. Reading it in MiniPlayer itself re-rendered
 * the artwork and both Text nodes on every tick; isolating it here keeps the
 * bar live while the rest of the bar stays still.
 */
const MiniPlayerProgress: React.FC = React.memo(() => {
  const { position, duration } = useProgress();

  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
    </View>
  );
});
MiniPlayerProgress.displayName = 'MiniPlayerProgress';

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ 
  track, 
  isPlaying, 
  onPress, 
  onPlayPause,
  tabBarHeight = Platform.OS === 'ios' ? 88 : 68,
  isLoading = false
}) => {
  const [showSource, setShowSource] = useState(false);


  if (!track) return null;

  return (
    <TouchableOpacity 
      activeOpacity={0.9} 
      onPress={onPress}
      style={[
        styles.positionContainer, 
        { bottom: tabBarHeight } // Flush with the tab bar: no gap for content to show through
      ]}
    >
      <View style={[styles.container, SHADOWS.glass]}>
        <View style={styles.content}>
          <Image source={{ uri: track.albumImageUrl }} style={styles.image} />
          
          <View style={styles.infoContainer}>
            <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{track.artist.name}</Text>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setShowSource(true)}>
               <MonitorSpeaker color={COLORS.text.secondary} size={20} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.playButton} onPress={onPlayPause}>
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.text.primary} />
              ) : isPlaying ? (
                <Pause color={COLORS.text.primary} size={24} fill={COLORS.text.primary} />
              ) : (
                <Play color={COLORS.text.primary} size={24} fill={COLORS.text.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Progress Bar */}
        <MiniPlayerProgress />
      </View>

      <PlaybackSourceSheet visible={showSource} onClose={() => setShowSource(false)} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  positionContainer: {
    position: 'absolute',
    left: SIZES.sm,
    right: SIZES.sm,
    zIndex: 100,
  },
  container: {
    borderRadius: SIZES.radius.md,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.glassBorder,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  image: {
    width: 40,
    height: 40,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
  },
  infoContainer: {
    flex: 1,
    marginLeft: SIZES.sm,
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
  },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: SIZES.sm,
  },
  playButton: {
    padding: SIZES.sm,
    marginLeft: SIZES.xs,
  },
  progressTrack: {
    height: 2,
    backgroundColor: COLORS.player.progressTrack,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.player.progressFill,
  }
});
