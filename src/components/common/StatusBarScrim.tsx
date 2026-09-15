import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/theme';

/**
 * Opaque strip behind the system status bar.
 *
 * The tab screens scroll their content under the status bar, so without this
 * the search field and headings collide with the clock and signal icons.
 * Rendered as a sibling above the ScrollView, so no screen layout changes.
 */
export const StatusBarScrim: React.FC = () => {
  const insets = useSafeAreaInsets();

  if (insets.top <= 0) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.scrim, { height: insets.top }]}
    />
  );
};

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
    // Below the mini player (100), above scrolling content.
    zIndex: 50,
  },
});
