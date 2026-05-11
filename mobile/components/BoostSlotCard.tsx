import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import { useUsageStore, EXTRA_SLOT_MINUTES, MAX_CONCURRENT_BOOSTED } from '../store/usageStore';
import { showRewardedAd } from '../services/admob';

/**
 * Card that lets users watch a rewarded ad to unlock
 * a 4th concurrent download slot for 45 minutes.
 */
export default function BoostSlotCard() {
  const { hasExtraSlot, unlockExtraSlot, getExtraSlotRemainingMs } = useUsageStore();
  const [loading, setLoading] = useState(false);
  const [remainingMin, setRemainingMin] = useState(0);
  const isActive = hasExtraSlot();

  // Update countdown every 30 seconds
  useEffect(() => {
    if (!isActive) { setRemainingMin(0); return; }

    const update = () => {
      const ms = getExtraSlotRemainingMs();
      setRemainingMin(Math.ceil(ms / 60000));
    };
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [isActive]);

  const handleBoost = async () => {
    if (isActive || loading) return;
    setLoading(true);

    try {
      const earned = await showRewardedAd();
      if (earned) {
        unlockExtraSlot();
        Alert.alert(
          '🚀 Boost Activated!',
          `4th download slot unlocked for ${EXTRA_SLOT_MINUTES} minutes. Download more in parallel!`,
          [{ text: 'Nice!' }]
        );
      } else {
        Alert.alert('Ad Not Completed', 'Watch the full ad to unlock the boost.');
      }
    } catch (err: any) {
      Alert.alert('Ad Unavailable', 'Could not load an ad right now. Try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  if (isActive) {
    return (
      <View style={[styles.card, styles.cardActive]}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, styles.iconActive]}>
            <Ionicons name="rocket" size={18} color={Colors.accent.primary} />
          </View>
          <View style={styles.info}>
            <Text style={styles.title}>
              <Text style={styles.highlight}>Boosted</Text> — {MAX_CONCURRENT_BOOSTED} slots active
            </Text>
            <Text style={styles.desc}>
              {remainingMin}m remaining
            </Text>
          </View>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>ACTIVE</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, styles.cardInactive]}
      onPress={handleBoost}
      activeOpacity={0.8}
      disabled={loading}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, styles.iconInactive]}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.accent.tertiary} />
          ) : (
            <Ionicons name="rocket-outline" size={18} color={Colors.accent.tertiary} />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>
            Watch Ad → <Text style={styles.highlightAlt}>4th Download Slot</Text>
          </Text>
          <Text style={styles.desc}>
            {EXTRA_SLOT_MINUTES} min of extra parallel downloads
          </Text>
        </View>
        <Ionicons name="play-circle" size={24} color={Colors.accent.tertiary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.sm,
  },
  cardActive: {
    backgroundColor: Colors.accent.primary + '10',
    borderWidth: 1,
    borderColor: Colors.accent.primary + '25',
  },
  cardInactive: {
    backgroundColor: Colors.accent.tertiary + '08',
    borderWidth: 1,
    borderColor: Colors.accent.tertiary + '18',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: {
    backgroundColor: Colors.accent.primary + '18',
  },
  iconInactive: {
    backgroundColor: Colors.accent.tertiary + '15',
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  highlight: {
    color: Colors.accent.primary,
    fontWeight: '800',
  },
  highlightAlt: {
    color: Colors.accent.tertiary,
    fontWeight: '800',
  },
  desc: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    marginTop: 1,
  },
  activeBadge: {
    backgroundColor: Colors.accent.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeBadgeText: {
    color: Colors.accent.primary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
