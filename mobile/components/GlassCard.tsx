import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Shadows, Spacing } from '../constants/theme';

/**
 * Glassmorphic card component with subtle border and shadow.
 */
interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  noPadding?: boolean;
}

export default function GlassCard({ children, style, elevated, noPadding }: GlassCardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated && styles.elevated,
        noPadding && styles.noPad,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    ...Shadows.subtle,
  },
  elevated: {
    backgroundColor: Colors.bg.elevated,
    ...Shadows.card,
  },
  noPad: {
    padding: 0,
  },
});
