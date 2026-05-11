import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import { useUsageStore, FREE_CYCLE_LIMIT } from '../store/usageStore';

interface UsageBannerProps {
  onOpenFarm?: () => void;
}

/**
 * Small banner on the Home screen showing download quota status.
 */
export default function UsageBanner({ onOpenFarm }: UsageBannerProps) {
  const { getRemainingFreeDownloads, getUnlockStatus, farmAdsWatched, isWeeklyUnlocked } = useUsageStore();
  const status = getUnlockStatus();
  const remaining = getRemainingFreeDownloads();

  if (status === 'unlimited_weekly') {
    const expiry = useUsageStore.getState().farmUnlockExpiry;
    const daysLeft = expiry
      ? Math.ceil((new Date(expiry).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : 0;

    return (
      <View style={[styles.banner, styles.bannerWeekly]}>
        <Ionicons name="shield-checkmark" size={18} color={Colors.accent.success} />
        <Text style={styles.bannerText}>
          <Text style={styles.highlight}>Unlimited</Text> • {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
        </Text>
        <Ionicons name="leaf" size={14} color={Colors.accent.success} />
      </View>
    );
  }

  if (status === 'unlimited_daily') {
    // 6-hour cycle unlock
    const expiry = useUsageStore.getState().cycleUnlockExpiry;
    const hoursLeft = expiry
      ? Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / (60 * 60 * 1000)))
      : 0;

    return (
      <View style={[styles.banner, styles.bannerUnlocked]}>
        <Ionicons name="infinite" size={18} color={Colors.accent.primary} />
        <Text style={styles.bannerText}>
          <Text style={styles.highlight}>Unlimited</Text> • {hoursLeft}h remaining
        </Text>
      </View>
    );
  }

  if (status === 'ads_needed') {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.bannerLocked]}
        onPress={onOpenFarm}
        activeOpacity={0.8}
      >
        <Ionicons name="lock-closed" size={16} color={Colors.accent.warning} />
        <Text style={styles.bannerText}>
          Daily limit reached • <Text style={styles.tapHint}>Tap to unlock</Text>
        </Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.accent.warning} />
      </TouchableOpacity>
    );
  }

  // Free tier — show remaining
  return (
    <View style={[styles.banner, styles.bannerFree]}>
      <Ionicons name="sparkles" size={16} color={Colors.accent.primary} />
      <Text style={styles.bannerText}>
        <Text style={styles.highlight}>{remaining}</Text> of {FREE_CYCLE_LIMIT} free downloads remaining
      </Text>
      {farmAdsWatched > 0 && (
        <TouchableOpacity onPress={onOpenFarm} style={styles.farmChip}>
          <Ionicons name="leaf" size={12} color={Colors.accent.success} />
          <Text style={styles.farmChipText}>{farmAdsWatched}/20</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  bannerFree: {
    backgroundColor: Colors.accent.primary + '10',
    borderWidth: 1,
    borderColor: Colors.accent.primary + '20',
  },
  bannerLocked: {
    backgroundColor: Colors.accent.warning + '10',
    borderWidth: 1,
    borderColor: Colors.accent.warning + '25',
  },
  bannerUnlocked: {
    backgroundColor: Colors.accent.primary + '10',
    borderWidth: 1,
    borderColor: Colors.accent.primary + '20',
  },
  bannerWeekly: {
    backgroundColor: Colors.accent.success + '10',
    borderWidth: 1,
    borderColor: Colors.accent.success + '20',
  },
  bannerText: {
    flex: 1,
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  highlight: {
    color: Colors.text.primary,
    fontWeight: '800',
  },
  tapHint: {
    color: Colors.accent.warning,
    fontWeight: '700',
  },
  farmChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.accent.success + '15',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  farmChipText: {
    color: Colors.accent.success,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
