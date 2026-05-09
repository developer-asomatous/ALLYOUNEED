import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Usage & Monetization Store
 * ═══════════════════════════════════════════════════
 * 
 *  Tier Model:
 *  • ₹10 one-time purchase (the app itself)
 *  • 3 free downloads/day
 *  • After 3: watch 2 rewarded ads → unlimited THAT day
 *  • Ad Farm: watch 20 full ads → 7 days unlimited
 *  • Ko-fi in Settings
 */

const FREE_DAILY_LIMIT = 3;
const ADS_FOR_DAILY_UNLOCK = 2;
const ADS_FOR_WEEKLY_UNLOCK = 20;
const WEEKLY_UNLOCK_DAYS = 7;
const AD_DURATION_SECONDS = 15; // Simulated ad length

export { FREE_DAILY_LIMIT, ADS_FOR_DAILY_UNLOCK, ADS_FOR_WEEKLY_UNLOCK, WEEKLY_UNLOCK_DAYS, AD_DURATION_SECONDS };

interface UsageState {
  // ── Daily tracking ──
  dailyDownloads: number;
  lastDownloadDate: string; // YYYY-MM-DD
  dailyUnlocked: boolean;  // true = unlimited for today (via 2 ads)
  dailyAdsWatched: number; // ads watched toward daily unlock

  // ── Ad Farm ──
  farmAdsWatched: number;        // total ads toward 20 for weekly unlock
  farmUnlockExpiry: string | null; // ISO date when weekly unlock expires

  // ── Lifetime stats ──
  totalDownloads: number;
  totalAdsWatched: number;

  // ── Actions ──
  recordDownload: () => void;
  recordAdWatched: (type: 'daily' | 'farm') => void;
  resetFarmProgress: () => void;
  canDownload: () => boolean;
  getRemainingFreeDownloads: () => number;
  isDailyUnlocked: () => boolean;
  isWeeklyUnlocked: () => boolean;
  getUnlockStatus: () => 'free' | 'ads_needed' | 'unlimited_daily' | 'unlimited_weekly';
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(dateStr: string): boolean {
  return dateStr === getTodayStr();
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      // Daily
      dailyDownloads: 0,
      lastDownloadDate: '',
      dailyUnlocked: false,
      dailyAdsWatched: 0,

      // Farm
      farmAdsWatched: 0,
      farmUnlockExpiry: null,

      // Stats
      totalDownloads: 0,
      totalAdsWatched: 0,

      // ── Record a download ──
      recordDownload: () => {
        const state = get();
        const today = getTodayStr();
        const isNewDay = state.lastDownloadDate !== today;

        set({
          dailyDownloads: isNewDay ? 1 : state.dailyDownloads + 1,
          lastDownloadDate: today,
          totalDownloads: state.totalDownloads + 1,
          // Reset daily unlocks on new day
          ...(isNewDay ? { dailyUnlocked: false, dailyAdsWatched: 0 } : {}),
        });
      },

      // ── Record an ad watched ──
      recordAdWatched: (type) => {
        const state = get();
        set({ totalAdsWatched: state.totalAdsWatched + 1 });

        if (type === 'daily') {
          const newCount = state.dailyAdsWatched + 1;
          set({
            dailyAdsWatched: newCount,
            dailyUnlocked: newCount >= ADS_FOR_DAILY_UNLOCK,
          });
        }

        if (type === 'farm') {
          const newCount = state.farmAdsWatched + 1;
          const unlocked = newCount >= ADS_FOR_WEEKLY_UNLOCK;
          set({
            farmAdsWatched: newCount,
            ...(unlocked
              ? {
                  farmUnlockExpiry: new Date(
                    Date.now() + WEEKLY_UNLOCK_DAYS * 24 * 60 * 60 * 1000
                  ).toISOString(),
                  farmAdsWatched: 0, // Reset counter after unlock
                }
              : {}),
          });
        }
      },

      resetFarmProgress: () => set({ farmAdsWatched: 0 }),

      // ── Can user download right now? ──
      canDownload: () => {
        const state = get();
        const today = getTodayStr();
        const isNewDay = state.lastDownloadDate !== today;

        // Weekly unlock active?
        if (state.farmUnlockExpiry && new Date(state.farmUnlockExpiry) > new Date()) {
          return true;
        }

        // New day = reset
        if (isNewDay) return true;

        // Under free limit
        if (state.dailyDownloads < FREE_DAILY_LIMIT) return true;

        // Daily unlocked via ads
        if (state.dailyUnlocked) return true;

        return false;
      },

      getRemainingFreeDownloads: () => {
        const state = get();
        const today = getTodayStr();
        if (state.lastDownloadDate !== today) return FREE_DAILY_LIMIT;
        return Math.max(0, FREE_DAILY_LIMIT - state.dailyDownloads);
      },

      isDailyUnlocked: () => {
        const state = get();
        return isToday(state.lastDownloadDate) && state.dailyUnlocked;
      },

      isWeeklyUnlocked: () => {
        const state = get();
        return !!(state.farmUnlockExpiry && new Date(state.farmUnlockExpiry) > new Date());
      },

      getUnlockStatus: () => {
        const state = get();

        // Weekly unlock
        if (state.farmUnlockExpiry && new Date(state.farmUnlockExpiry) > new Date()) {
          return 'unlimited_weekly';
        }

        const today = getTodayStr();
        const isNewDay = state.lastDownloadDate !== today;

        // Daily unlocked
        if (!isNewDay && state.dailyUnlocked) return 'unlimited_daily';

        // Under free limit
        if (isNewDay || state.dailyDownloads < FREE_DAILY_LIMIT) return 'free';

        // Needs ads
        return 'ads_needed';
      },
    }),
    {
      name: 'ayn-usage-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
