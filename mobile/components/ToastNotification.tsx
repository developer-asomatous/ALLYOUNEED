import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, FontSize, Spacing } from '../constants/theme';

/**
 * In-app toast notification — slides in from top, auto-dismisses.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastNotificationProps {
  visible: boolean;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onDismiss: () => void;
}

const ICONS: Record<ToastType, { name: string; color: string }> = {
  success: { name: 'checkmark-circle', color: Colors.accent.success },
  error: { name: 'close-circle', color: Colors.accent.error },
  info: { name: 'information-circle', color: Colors.accent.info },
  warning: { name: 'warning', color: Colors.accent.warning },
};

const BG_COLORS: Record<ToastType, string> = {
  success: Colors.accent.success + '12',
  error: Colors.accent.error + '12',
  info: Colors.accent.info + '12',
  warning: Colors.accent.warning + '12',
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: Colors.accent.success + '30',
  error: Colors.accent.error + '30',
  info: Colors.accent.info + '30',
  warning: Colors.accent.warning + '30',
};

export default function ToastNotification({
  visible,
  type,
  title,
  message,
  duration = 3500,
  onDismiss,
}: ToastNotificationProps) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const icon = ICONS[type];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 120,
          friction: 14,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      timerRef.current = setTimeout(() => {
        dismiss();
      }, duration);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: BG_COLORS[type],
          borderColor: BORDER_COLORS[type],
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <Ionicons name={icon.name as any} size={22} color={icon.color} />
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={18} color={Colors.text.muted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    zIndex: 9999,
    elevation: 20,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    marginTop: 2,
  },
});
