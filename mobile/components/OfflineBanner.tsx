import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

/**
 * ═══════════════════════════════════════════════════
 *  Offline Banner — Slides in when network drops
 * ═══════════════════════════════════════════════════
 *
 *  Shows a warning when offline, auto-hides when reconnected
 *  with a brief "Back online" success message.
 */

export default function OfflineBanner() {
  const { isConnected, connectionType } = useNetworkStatus();
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const wasOffline = useRef(false);
  const [showReconnected, setShowReconnected] = React.useState(false);

  useEffect(() => {
    if (!isConnected) {
      // Slide in
      wasOffline.current = true;
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }).start();
    } else if (wasOffline.current) {
      // Show "Back online" briefly
      setShowReconnected(true);
      setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: -60,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setShowReconnected(false);
          wasOffline.current = false;
        });
      }, 2000);
    }
  }, [isConnected]);

  if (isConnected && !showReconnected) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        !isConnected ? styles.offline : styles.reconnected,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Ionicons
        name={isConnected ? 'wifi' : 'cloud-offline'}
        size={16}
        color={isConnected ? Colors.accent.success : Colors.accent.warning}
      />
      <Text style={[styles.text, isConnected && styles.textOnline]}>
        {isConnected
          ? 'Back online ✓'
          : 'No internet connection — downloads will queue'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  offline: {
    backgroundColor: Colors.accent.warning + '15',
    borderWidth: 1,
    borderColor: Colors.accent.warning + '25',
  },
  reconnected: {
    backgroundColor: Colors.accent.success + '15',
    borderWidth: 1,
    borderColor: Colors.accent.success + '25',
  },
  text: {
    color: Colors.accent.warning,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  textOnline: {
    color: Colors.accent.success,
  },
});
