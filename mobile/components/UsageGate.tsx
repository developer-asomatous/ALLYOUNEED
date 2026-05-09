import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import {
  useUsageStore,
  ADS_FOR_DAILY_UNLOCK,
  ADS_FOR_WEEKLY_UNLOCK,
  AD_DURATION_SECONDS,
} from '../store/usageStore';
import { showRewardedAd, preloadRewardedAd } from '../services/admob';

interface UsageGateProps {
  visible: boolean;
  onClose: () => void;
  onUnlocked: () => void; // Called when user earns download access
}

export default function UsageGate({ visible, onClose, onUnlocked }: UsageGateProps) {
  const {
    dailyAdsWatched,
    farmAdsWatched,
    recordAdWatched,
    isWeeklyUnlocked,
  } = useUsageStore();

  const [mode, setMode] = useState<'choose' | 'watching_daily' | 'watching_farm' | 'farm_progress'>('choose');
  const [adLoading, setAdLoading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation
  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [visible]);

  // Preload ad when gate opens
  useEffect(() => {
    if (visible) {
      preloadRewardedAd();
    }
  }, [visible]);

  const dailyAdsRemaining = Math.max(0, ADS_FOR_DAILY_UNLOCK - dailyAdsWatched);
  const farmAdsRemaining = Math.max(0, ADS_FOR_WEEKLY_UNLOCK - farmAdsWatched);

  // Show a real AdMob rewarded ad
  const watchAd = useCallback(async (type: 'daily' | 'farm') => {
    setAdLoading(true);
    setMode(type === 'daily' ? 'watching_daily' : 'watching_farm');

    try {
      const earned = await showRewardedAd();

      if (earned) {
        // User watched full ad — record reward
        recordAdWatched(type);

        if (type === 'daily') {
          const newCount = dailyAdsWatched + 1;
          if (newCount >= ADS_FOR_DAILY_UNLOCK) {
            setTimeout(() => onUnlocked(), 300);
          } else {
            setMode('choose');
          }
        }

        if (type === 'farm') {
          const newFarmCount = farmAdsWatched + 1;
          if (newFarmCount >= ADS_FOR_WEEKLY_UNLOCK) {
            Alert.alert(
              '🎉 7 Days Unlocked!',
              'You\'ve earned 7 days of unlimited downloads. Thank you for your support!',
              [{ text: 'Awesome!', onPress: onUnlocked }]
            );
          } else {
            setMode('farm_progress');
          }
        }
      } else {
        // User dismissed ad without watching fully
        Alert.alert('Ad Not Completed', 'Please watch the full ad to earn your reward.');
        setMode('choose');
      }
    } catch (err: any) {
      console.warn('[UsageGate] Ad error:', err.message);
      Alert.alert('Ad Unavailable', 'Could not load an ad right now. Please try again in a moment.');
      setMode('choose');
    } finally {
      setAdLoading(false);
    }
  }, [dailyAdsWatched, farmAdsWatched]);

  const handleClose = () => {
    if (adLoading) return; // Don't close while ad is loading
    setMode('choose');
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={adLoading ? undefined : handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* ═══════ MODE: Choose ═══════ */}
          {mode === 'choose' && (
            <>
              {/* Header */}
              <Animated.View style={[styles.header, { transform: [{ scale: pulseAnim }] }]}>
                <View style={styles.limitIcon}>
                  <Ionicons name="lock-closed" size={32} color={Colors.accent.warning} />
                </View>
                <Text style={styles.title}>Daily Limit Reached</Text>
                <Text style={styles.subtitle}>
                  You've used your 3 free downloads today.{'\n'}
                  Watch a short ad to keep downloading!
                </Text>
              </Animated.View>

              {/* Option 1: Watch 2 ads for today */}
              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => { setMode('watching_daily'); watchAd('daily'); }}
                activeOpacity={0.8}
              >
                <View style={styles.optionIconWrap}>
                  <Ionicons name="play-circle" size={28} color={Colors.accent.primary} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Watch Ad → Unlimited Today</Text>
                  <Text style={styles.optionDesc}>
                    {dailyAdsRemaining} ad{dailyAdsRemaining !== 1 ? 's' : ''} remaining • ~{dailyAdsRemaining * AD_DURATION_SECONDS}s
                  </Text>
                </View>
                <View style={styles.optionBadge}>
                  <Text style={styles.optionBadgeText}>{dailyAdsRemaining}/{ADS_FOR_DAILY_UNLOCK}</Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Ad Farm */}
              <TouchableOpacity
                style={[styles.optionCard, styles.farmCard]}
                onPress={() => setMode('farm_progress')}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIconWrap, { backgroundColor: Colors.accent.success + '15' }]}>
                  <Ionicons name="calendar" size={28} color={Colors.accent.success} />
                </View>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Ad Farm → 7 Days Free</Text>
                  <Text style={styles.optionDesc}>
                    Watch 20 ads total, unlock a full week
                  </Text>
                </View>
                <View style={[styles.optionBadge, { backgroundColor: Colors.accent.success + '20' }]}>
                  <Text style={[styles.optionBadgeText, { color: Colors.accent.success }]}>
                    {farmAdsWatched}/{ADS_FOR_WEEKLY_UNLOCK}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Cancel */}
              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>Maybe Later</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ═══════ MODE: Watching Ad (Daily) ═══════ */}
          {mode === 'watching_daily' && (
            <View style={styles.adScreen}>
              <View style={styles.adPlaceholder}>
                <ActivityIndicator size="large" color={Colors.accent.primary} />
                <Text style={styles.adLabel}>
                  {adLoading ? 'Loading Ad...' : 'Ad Playing'}
                </Text>
                <Text style={styles.adNote}>
                  Thanks for supporting AYN! 💜
                </Text>
              </View>
              <Text style={styles.timerLabel}>
                Ad {dailyAdsWatched + 1} of {ADS_FOR_DAILY_UNLOCK} for today's unlock
              </Text>
            </View>
          )}

          {/* ═══════ MODE: Watching Ad (Farm) ═══════ */}
          {mode === 'watching_farm' && (
            <View style={styles.adScreen}>
              <View style={styles.adPlaceholder}>
                <ActivityIndicator size="large" color={Colors.accent.success} />
                <Text style={styles.adLabel}>
                  {adLoading ? 'Loading Ad...' : 'Ad Farm — Ad Playing'}
                </Text>
                <Text style={styles.adNote}>
                  {farmAdsWatched + 1}/{ADS_FOR_WEEKLY_UNLOCK} toward your 7-day unlock 🌱
                </Text>
              </View>
              <Text style={styles.timerLabel}>
                Watching ad for Ad Farm progress
              </Text>
            </View>
          )}

          {/* ═══════ MODE: Farm Progress ═══════ */}
          {mode === 'farm_progress' && (
            <>
              <View style={styles.header}>
                <View style={[styles.limitIcon, { backgroundColor: Colors.accent.success + '15' }]}>
                  <Ionicons name="leaf" size={32} color={Colors.accent.success} />
                </View>
                <Text style={styles.title}>Ad Farm 🌱</Text>
                <Text style={styles.subtitle}>
                  Watch 20 ads at your own pace.{'\n'}
                  Earn 7 days of unlimited downloads!
                </Text>
              </View>

              {/* Farm progress */}
              <View style={styles.farmProgress}>
                <View style={styles.farmProgressHeader}>
                  <Text style={styles.farmProgressLabel}>Progress</Text>
                  <Text style={styles.farmProgressCount}>
                    {farmAdsWatched} / {ADS_FOR_WEEKLY_UNLOCK}
                  </Text>
                </View>
                <View style={styles.farmTrack}>
                  <View
                    style={[
                      styles.farmFill,
                      { width: `${(farmAdsWatched / ADS_FOR_WEEKLY_UNLOCK) * 100}%` },
                    ]}
                  />
                </View>
                {/* Dot indicators */}
                <View style={styles.dotRow}>
                  {Array.from({ length: ADS_FOR_WEEKLY_UNLOCK }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        i < farmAdsWatched && styles.dotFilled,
                      ]}
                    />
                  ))}
                </View>
              </View>

              {/* Watch ad button */}
              <TouchableOpacity
                style={styles.watchFarmBtn}
                onPress={() => { setMode('watching_farm'); watchAd('farm'); }}
                activeOpacity={0.8}
              >
                <Ionicons name="play-circle" size={22} color="#fff" />
                <Text style={styles.watchFarmBtnText}>
                  Watch Ad ({farmAdsRemaining} remaining)
                </Text>
              </TouchableOpacity>

              {/* Back & cancel */}
              <View style={styles.farmActions}>
                <TouchableOpacity
                  style={styles.farmBackBtn}
                  onPress={() => setMode('choose')}
                >
                  <Ionicons name="arrow-back" size={16} color={Colors.text.muted} />
                  <Text style={styles.farmBackText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleClose}>
                  <Text style={styles.cancelText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.bg.secondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: Spacing.lg,
    paddingBottom: 40,
    maxHeight: '85%',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  limitIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent.warning + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Option cards
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.accent.primary + '30',
    gap: 12,
  },
  farmCard: {
    borderColor: Colors.accent.success + '30',
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  optionDesc: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    marginTop: 2,
  },
  optionBadge: {
    backgroundColor: Colors.accent.primary + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  optionBadgeText: {
    color: Colors.accent.primary,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },

  // Cancel
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  cancelText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    fontWeight: '600',
  },

  // Ad playback screen
  adScreen: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  adPlaceholder: {
    width: '100%',
    height: 220,
    backgroundColor: Colors.bg.primary,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  adLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginTop: Spacing.md,
  },
  adNote: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    marginTop: 4,
  },

  // Timer
  timerWrap: {
    width: '100%',
    alignItems: 'center',
  },
  timerText: {
    fontSize: FontSize.hero,
    fontWeight: '900',
    color: Colors.accent.primary,
    marginBottom: Spacing.sm,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.bg.primary,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.accent.primary,
    borderRadius: 3,
  },
  timerLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },

  // Farm progress
  farmProgress: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  farmProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  farmProgressLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  farmProgressCount: {
    color: Colors.accent.success,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  farmTrack: {
    height: 8,
    backgroundColor: Colors.bg.primary,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  farmFill: {
    height: '100%',
    backgroundColor: Colors.accent.success,
    borderRadius: 4,
  },
  dotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.bg.elevated,
  },
  dotFilled: {
    backgroundColor: Colors.accent.success,
  },

  // Farm buttons
  watchFarmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.success,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    gap: 8,
    marginBottom: Spacing.md,
  },
  watchFarmBtnText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  farmActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  farmBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  farmBackText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
