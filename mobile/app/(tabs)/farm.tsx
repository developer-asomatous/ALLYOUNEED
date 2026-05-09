import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, FontSize } from '../../constants/theme';
import {
  useUsageStore,
  FREE_DAILY_LIMIT,
  ADS_FOR_DAILY_UNLOCK,
  ADS_FOR_WEEKLY_UNLOCK,
  WEEKLY_UNLOCK_DAYS,
  AD_DURATION_SECONDS,
} from '../../store/usageStore';
import { showRewardedAd, preloadRewardedAd } from '../../services/admob';

export default function FarmScreen() {
  const {
    farmAdsWatched,
    dailyDownloads,
    dailyAdsWatched,
    dailyUnlocked,
    totalAdsWatched,
    totalDownloads,
    farmUnlockExpiry,
    lastDownloadDate,
    recordAdWatched,
    getRemainingFreeDownloads,
    getUnlockStatus,
    isWeeklyUnlocked,
    isDailyUnlocked,
  } = useUsageStore();

  const [adLoading, setAdLoading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const unlockStatus = getUnlockStatus();
  const remaining = getRemainingFreeDownloads();
  const farmProgress = farmAdsWatched / ADS_FOR_WEEKLY_UNLOCK;

  // Gentle pulse for the farm icon
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Preload ad on mount
  useEffect(() => {
    preloadRewardedAd();
  }, []);

  const watchAd = useCallback(async () => {
    setAdLoading(true);

    try {
      const earned = await showRewardedAd();

      if (earned) {
        recordAdWatched('farm');

        const newCount = farmAdsWatched + 1;
        if (newCount >= ADS_FOR_WEEKLY_UNLOCK) {
          Alert.alert(
            '🎉 7 Days Unlocked!',
            `You've earned ${WEEKLY_UNLOCK_DAYS} days of unlimited downloads!\nThank you for supporting AYN!`,
            [{ text: 'Awesome!' }]
          );
        }
      } else {
        Alert.alert('Ad Not Completed', 'Please watch the full ad to earn your reward.');
      }
    } catch (err: any) {
      console.warn('[Farm] Ad error:', err.message);
      Alert.alert('Ad Unavailable', 'Could not load an ad right now. Please try again in a moment.');
    } finally {
      setAdLoading(false);
    }
  }, [farmAdsWatched]);

  const weeklyActive = isWeeklyUnlocked();
  const daysLeft = farmUnlockExpiry
    ? Math.max(0, Math.ceil((new Date(farmUnlockExpiry).getTime() - Date.now()) / (86400000)))
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ Header ═══ */}
        <Animated.View style={[styles.header, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.farmIconWrap}>
            <Text style={styles.farmEmoji}>🌾</Text>
          </View>
          <Text style={styles.title}>Ad Farm</Text>
          <Text style={styles.subtitle}>
            Watch ads at your own pace.{'\n'}
            Earn unlimited downloads!
          </Text>
        </Animated.View>

        {/* ═══ Weekly Status Banner ═══ */}
        {weeklyActive && (
          <View style={styles.weeklyBanner}>
            <Ionicons name="shield-checkmark" size={22} color={Colors.accent.success} />
            <View style={styles.weeklyBannerInfo}>
              <Text style={styles.weeklyBannerTitle}>Unlimited Active!</Text>
              <Text style={styles.weeklyBannerDesc}>
                {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining • Expires{' '}
                {new Date(farmUnlockExpiry!).toLocaleDateString()}
              </Text>
            </View>
          </View>
        )}

        {/* ═══ Progress Card ═══ */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressCount}>
              {farmAdsWatched} / {ADS_FOR_WEEKLY_UNLOCK}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${farmProgress * 100}%` }]} />
          </View>

          {/* Dot grid */}
          <View style={styles.dotGrid}>
            {Array.from({ length: ADS_FOR_WEEKLY_UNLOCK }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < farmAdsWatched && styles.dotFilled,
                  i === farmAdsWatched && styles.dotNext,
                ]}
              >
                {i < farmAdsWatched && (
                  <Ionicons name="checkmark" size={8} color="#fff" />
                )}
              </View>
            ))}
          </View>

          {/* Remaining text */}
          <Text style={styles.remainingText}>
            {farmAdsWatched >= ADS_FOR_WEEKLY_UNLOCK
              ? '✅ Ready to redeem!'
              : `${ADS_FOR_WEEKLY_UNLOCK - farmAdsWatched} more ad${ADS_FOR_WEEKLY_UNLOCK - farmAdsWatched !== 1 ? 's' : ''} to unlock ${WEEKLY_UNLOCK_DAYS} days`}
          </Text>
        </View>

        {/* ═══ Watch Ad Button ═══ */}
        <TouchableOpacity
          style={[styles.watchBtn, adLoading && { opacity: 0.6 }]}
          onPress={watchAd}
          activeOpacity={0.85}
          disabled={adLoading}
        >
          {adLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="play-circle" size={24} color="#fff" />
          )}
          <Text style={styles.watchBtnText}>
            {adLoading ? 'Loading Ad...' : 'Watch an Ad → +1'}
          </Text>
          {!adLoading && (
            <View style={styles.watchBtnBadge}>
              <Text style={styles.watchBtnBadgeText}>~30s</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ═══ Reward Info ═══ */}
        <View style={styles.rewardCard}>
          <View style={styles.rewardRow}>
            <View style={styles.rewardIcon}>
              <Ionicons name="gift" size={20} color={Colors.accent.primary} />
            </View>
            <View style={styles.rewardInfo}>
              <Text style={styles.rewardTitle}>Reward</Text>
              <Text style={styles.rewardDesc}>
                {WEEKLY_UNLOCK_DAYS} days of unlimited downloads
              </Text>
            </View>
          </View>
          <View style={styles.rewardDivider} />
          <View style={styles.rewardRow}>
            <View style={[styles.rewardIcon, { backgroundColor: Colors.accent.warning + '15' }]}>
              <Ionicons name="refresh" size={20} color={Colors.accent.warning} />
            </View>
            <View style={styles.rewardInfo}>
              <Text style={styles.rewardTitle}>Repeatable</Text>
              <Text style={styles.rewardDesc}>
                Farm again after each redemption — no limits!
              </Text>
            </View>
          </View>
        </View>

        {/* ═══ Today's Status ═══ */}
        <View style={styles.todayCard}>
          <Text style={styles.todayTitle}>Today's Status</Text>
          <View style={styles.todayRow}>
            <Text style={styles.todayLabel}>Free downloads</Text>
            <Text style={styles.todayValue}>{remaining}/{FREE_DAILY_LIMIT}</Text>
          </View>
          <View style={styles.todayRow}>
            <Text style={styles.todayLabel}>Daily unlock</Text>
            <Text style={[styles.todayValue, isDailyUnlocked() && { color: Colors.accent.success }]}>
              {isDailyUnlocked() ? '✅ Active' : `${dailyAdsWatched}/${ADS_FOR_DAILY_UNLOCK} ads`}
            </Text>
          </View>
          <View style={styles.todayRow}>
            <Text style={styles.todayLabel}>Status</Text>
            <View style={[styles.statusPill, {
              backgroundColor: unlockStatus === 'ads_needed'
                ? Colors.accent.warning + '15'
                : Colors.accent.success + '15',
            }]}>
              <Text style={[styles.statusPillText, {
                color: unlockStatus === 'ads_needed'
                  ? Colors.accent.warning
                  : Colors.accent.success,
              }]}>
                {unlockStatus === 'free' ? 'Free Tier' :
                 unlockStatus === 'ads_needed' ? 'Limit Reached' :
                 unlockStatus === 'unlimited_daily' ? 'Unlimited Today' :
                 'Unlimited (Weekly)'}
              </Text>
            </View>
          </View>
        </View>

        {/* ═══ Lifetime Stats ═══ */}
        <View style={styles.lifetimeCard}>
          <Text style={styles.lifetimeTitle}>Lifetime</Text>
          <View style={styles.lifetimeRow}>
            <View style={styles.lifetimeStat}>
              <Text style={styles.lifetimeNumber}>{totalDownloads}</Text>
              <Text style={styles.lifetimeLabel}>Downloads</Text>
            </View>
            <View style={styles.lifetimeDivider} />
            <View style={styles.lifetimeStat}>
              <Text style={styles.lifetimeNumber}>{totalAdsWatched}</Text>
              <Text style={styles.lifetimeLabel}>Ads Watched</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  farmIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent.success + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.accent.success + '20',
  },
  farmEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 4,
  },

  // Weekly banner
  weeklyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.accent.success + '10',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.accent.success + '25',
  },
  weeklyBannerInfo: {
    flex: 1,
  },
  weeklyBannerTitle: {
    color: Colors.accent.success,
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  weeklyBannerDesc: {
    color: Colors.accent.success,
    fontSize: FontSize.xs,
    fontWeight: '500',
    opacity: 0.8,
    marginTop: 2,
  },

  // Progress card
  progressCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  progressLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  progressCount: {
    color: Colors.accent.success,
    fontSize: FontSize.md,
    fontWeight: '900',
  },
  progressTrack: {
    height: 10,
    backgroundColor: Colors.bg.primary,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent.success,
    borderRadius: 5,
  },
  dotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotFilled: {
    backgroundColor: Colors.accent.success,
  },
  dotNext: {
    borderWidth: 2,
    borderColor: Colors.accent.success + '50',
    backgroundColor: Colors.accent.success + '10',
  },
  remainingText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Watch button
  watchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.success,
    borderRadius: BorderRadius.lg,
    paddingVertical: 18,
    gap: 10,
    marginBottom: Spacing.lg,
    shadowColor: Colors.accent.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  watchBtnText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  watchBtnBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  watchBtnBadgeText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // Ad playing
  adPlayingCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  adScreen: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.bg.primary,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  adPlayingLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  adPlayingNote: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    marginTop: 4,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.accent.success,
    marginBottom: Spacing.sm,
  },
  timerTrack: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.bg.primary,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  timerFill: {
    height: '100%',
    backgroundColor: Colors.accent.success,
    borderRadius: 3,
  },
  timerLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // Reward card
  rewardCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardInfo: {
    flex: 1,
  },
  rewardTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  rewardDesc: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  rewardDivider: {
    height: 1,
    backgroundColor: Colors.border.default,
    marginVertical: Spacing.md,
  },

  // Today card
  todayCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  todayTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '800',
    marginBottom: Spacing.md,
  },
  todayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  todayLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  todayValue: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
  },

  // Lifetime stats
  lifetimeCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  lifetimeTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '800',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  lifetimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lifetimeStat: {
    flex: 1,
    alignItems: 'center',
  },
  lifetimeNumber: {
    color: Colors.text.primary,
    fontSize: FontSize.hero,
    fontWeight: '900',
  },
  lifetimeLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 4,
  },
  lifetimeDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border.default,
  },
});
