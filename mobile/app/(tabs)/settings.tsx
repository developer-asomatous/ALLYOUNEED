import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/appStore';
import { useUsageStore, FREE_DAILY_LIMIT, ADS_FOR_WEEKLY_UNLOCK } from '../../store/usageStore';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';

const QUALITY_OPTIONS = ['2160p', '1440p', '1080p', '720p', '480p', '360p'];
const FORMAT_OPTIONS = ['mp4', 'mkv', 'webm', 'mp3', 'flac', 'm4a'];

const COFFEE_URL = 'https://buymeacoffee.com/allyouneed';
const KOFI_URL = 'https://ko-fi.com/allyouneed';

export default function SettingsScreen() {
  const {
    defaultQuality, defaultFormat,
    setDefaultQuality, setDefaultFormat,
    autoClipboard, notificationsEnabled,
    setAutoClipboard, setNotificationsEnabled,
  } = useAppStore();
  const {
    totalDownloads,
    totalAdsWatched,
    farmAdsWatched,
    farmUnlockExpiry,
    getRemainingFreeDownloads,
    isWeeklyUnlocked,
  } = useUsageStore();

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open link');
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSub}>v1.0.0</Text>
        </View>

        {/* ── Stats Card ── */}
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: Colors.accent.primary + '15' }]}>
                <Ionicons name="download" size={16} color={Colors.accent.primary} />
              </View>
              <Text style={styles.statNumber}>{totalDownloads}</Text>
              <Text style={styles.statLabel}>Downloads</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: Colors.accent.success + '15' }]}>
                <Ionicons name="today" size={16} color={Colors.accent.success} />
              </View>
              <Text style={styles.statNumber}>{getRemainingFreeDownloads()}/{FREE_DAILY_LIMIT}</Text>
              <Text style={styles.statLabel}>Free Today</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: Colors.accent.warning + '15' }]}>
                <Ionicons name="play" size={16} color={Colors.accent.warning} />
              </View>
              <Text style={styles.statNumber}>{totalAdsWatched}</Text>
              <Text style={styles.statLabel}>Ads</Text>
            </View>
          </View>

          {/* Farm progress */}
          {farmAdsWatched > 0 && !isWeeklyUnlocked() && (
            <View style={styles.farmProgress}>
              <View style={styles.farmHeader}>
                <Ionicons name="leaf" size={14} color={Colors.accent.success} />
                <Text style={styles.farmLabel}>Ad Farm</Text>
                <Text style={styles.farmCount}>{farmAdsWatched}/{ADS_FOR_WEEKLY_UNLOCK}</Text>
              </View>
              <View style={styles.farmTrack}>
                <View style={[styles.farmFill, { width: `${(farmAdsWatched / ADS_FOR_WEEKLY_UNLOCK) * 100}%` }]} />
              </View>
            </View>
          )}

          {isWeeklyUnlocked() && farmUnlockExpiry && (
            <View style={styles.weeklyBadge}>
              <Ionicons name="shield-checkmark" size={14} color={Colors.accent.success} />
              <Text style={styles.weeklyText}>
                Unlimited until {new Date(farmUnlockExpiry).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>

        {/* ── Quality ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Quality</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {QUALITY_OPTIONS.map((q) => (
              <TouchableOpacity
                key={q}
                style={[styles.chip, defaultQuality === q && styles.chipActive]}
                onPress={() => setDefaultQuality(q)}
              >
                <Text style={[styles.chipText, defaultQuality === q && styles.chipTextActive]}>
                  {q}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Format ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Format</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {FORMAT_OPTIONS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.chip, defaultFormat === f && styles.chipActive]}
                onPress={() => setDefaultFormat(f)}
              >
                <Text style={[styles.chipText, defaultFormat === f && styles.chipTextActive]}>
                  {f.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Preferences ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.settingCard}>
            <SettingRow
              icon="clipboard"
              iconColor={Colors.accent.primary}
              label="Auto-detect clipboard"
              desc="Detect URLs from clipboard"
              value={autoClipboard}
              onChange={setAutoClipboard}
            />
            <View style={styles.settingDivider} />
            <SettingRow
              icon="notifications"
              iconColor={Colors.accent.warning}
              label="Notifications"
              desc="Alert when downloads complete"
              value={notificationsEnabled}
              onChange={setNotificationsEnabled}
            />
          </View>
        </View>

        {/* ── Support ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support the Developer</Text>

          <TouchableOpacity
            style={styles.supportBtn}
            onPress={() => handleOpenLink(COFFEE_URL)}
            activeOpacity={0.8}
          >
            <Text style={styles.supportEmoji}>☕</Text>
            <View style={styles.supportInfo}>
              <Text style={styles.supportLabel}>Buy Me a Coffee</Text>
              <Text style={styles.supportDesc}>One-time support</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.supportBtn}
            onPress={() => handleOpenLink(KOFI_URL)}
            activeOpacity={0.8}
          >
            <Text style={styles.supportEmoji}>❤️</Text>
            <View style={styles.supportInfo}>
              <Text style={styles.supportLabel}>Ko-fi</Text>
              <Text style={styles.supportDesc}>Monthly or one-time</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text.muted} />
          </TouchableOpacity>

          <View style={styles.thankYou}>
            <Ionicons name="sparkles" size={12} color={Colors.accent.warning} />
            <Text style={styles.thankYouText}>
              Every bit helps keep AYN free. Thank you! 💜
            </Text>
          </View>
        </View>

        {/* ── About ── */}
        <View style={styles.aboutSection}>
          <Text style={styles.aboutText}>ALLYOUNEED • Made with 💜</Text>
          <Text style={styles.aboutVersion}>v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({
  icon, iconColor, label, desc, value, onChange,
}: {
  icon: string; iconColor: string; label: string; desc: string;
  value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={[styles.settingIcon, { backgroundColor: iconColor + '15' }]}>
        <Ionicons name={icon as any} size={16} color={iconColor} />
      </View>
      <View style={styles.settingTextWrap}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.bg.elevated, true: Colors.accent.primary + '60' }}
        thumbColor={value ? Colors.accent.primary : Colors.text.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 120,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: FontSize.sm,
    color: Colors.text.muted,
    fontWeight: '600',
  },

  // Stats
  statsCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    ...Shadows.card,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.text.muted,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border.default,
  },
  farmProgress: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  farmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  farmLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text.secondary,
    flex: 1,
  },
  farmCount: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.accent.success,
  },
  farmTrack: {
    height: 6,
    backgroundColor: Colors.bg.primary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  farmFill: {
    height: '100%',
    backgroundColor: Colors.accent.success,
    borderRadius: 3,
  },
  weeklyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  weeklyText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.accent.success,
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
    letterSpacing: -0.2,
  },

  // Chips
  chipScroll: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bg.card,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: Colors.accent.primary + '18',
    borderColor: Colors.accent.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  chipTextActive: {
    color: Colors.accent.primary,
  },

  // Settings card
  settingCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTextWrap: {
    flex: 1,
  },
  settingLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  settingDesc: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    marginTop: 1,
  },
  settingDivider: {
    height: 1,
    backgroundColor: Colors.border.default,
    marginVertical: Spacing.sm,
    marginLeft: 44,
  },

  // Support
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  supportEmoji: {
    fontSize: 24,
  },
  supportInfo: {
    flex: 1,
  },
  supportLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  supportDesc: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    marginTop: 1,
  },
  thankYou: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  thankYouText: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    fontWeight: '500',
    flex: 1,
  },

  // About
  aboutSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 4,
  },
  aboutText: {
    fontSize: FontSize.sm,
    color: Colors.text.muted,
    fontWeight: '600',
  },
  aboutVersion: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    fontWeight: '500',
    opacity: 0.6,
  },
});
