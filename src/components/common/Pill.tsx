import React from 'react';
import { StyleSheet, Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { COLORS, SIZES, FONTS } from '../../constants/theme';

interface PillProps {
  label: string;
  isActive?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export const Pill: React.FC<PillProps> = ({ label, isActive, onPress, style }) => {
  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.container,
        isActive ? styles.activeContainer : styles.inactiveContainer,
        style
      ]}
    >
      <Text style={[
        styles.label,
        isActive ? styles.activeLabel : styles.inactiveLabel
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radius.pill,
    marginRight: SIZES.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeContainer: {
    backgroundColor: COLORS.text.primary,
  },
  inactiveContainer: {
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 14,
  },
  activeLabel: {
    color: COLORS.background,
  },
  inactiveLabel: {
    color: COLORS.text.primary,
  }
});
