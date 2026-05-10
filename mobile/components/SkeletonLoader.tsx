import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, ViewStyle } from 'react-native';
import { Colors } from '../constants/theme';

/**
 * Shimmer skeleton loader for loading states.
 * Pass width/height/borderRadius as style props.
 */
interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export default function SkeletonLoader({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.6, 0.3],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: Colors.bg.elevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Pre-built skeleton for a media card */
export function MediaCardSkeleton() {
  return (
    <View style={skeletonStyles.mediaCard}>
      <SkeletonLoader width="100%" height={200} borderRadius={16} />
      <View style={skeletonStyles.body}>
        <SkeletonLoader width="80%" height={18} borderRadius={6} />
        <SkeletonLoader width="50%" height={14} borderRadius={6} style={{ marginTop: 8 }} />
        <View style={skeletonStyles.chipRow}>
          <SkeletonLoader width={70} height={32} borderRadius={20} />
          <SkeletonLoader width={70} height={32} borderRadius={20} />
          <SkeletonLoader width={70} height={32} borderRadius={20} />
        </View>
        <SkeletonLoader width="100%" height={50} borderRadius={12} style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  mediaCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  body: {
    padding: 16,
    gap: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
