import React from 'react';
import { StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SHADOWS, SIZES } from '../../constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  rounded?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  style, 
  intensity = 30,
  tint = 'dark',
  rounded = true
}) => {
  return (
    <BlurView 
      intensity={intensity} 
      tint={tint}
      style={[
        styles.container, 
        rounded && styles.rounded,
        SHADOWS.ambient,
        style
      ]}
    >
      {children}
    </BlurView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.glass,
    borderColor: COLORS.glassBorder,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rounded: {
    borderRadius: SIZES.radius.md,
  }
});
