import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Usage & Monetization Store
 * ═══════════════════════════════════════════════════
 * 
 *  Tier Model (v2):
 *  • 4 free downloads per cycle
 *  • After 4: watch 2 rewarded ads → 6 hours unlimited
 *  • After 6hrs expire → 4 free again (grace) → 2 ads → 6hrs
 *  • Ad Farm: watch 20 full ads → 7 days unlimited
 *  • Interstitial ad every 5th download (non-blocking)
 *  • Rewarded ad → 4th concurrent download slot (45 min)
 */

const FREE_CYCLE_LIMIT = 4;
const ADS_FOR_CYCLE_UNLOCK = 2;
const CYCLE_UNLOCK_HOURS = 6;
const ADS_FOR_WEEKLY_UNLOCK = 20;
const WEEKLY_UNLOCK_DAYS = 7;
const AD_DURATION_SECONDS = 15;
const INTERSTITIAL_INTERVAL = 5;
const EXTRA_SLOT_MINUTES = 45;
const MAX_CONCURRENT_DEFAULT = 3;
const MAX_CONCURRENT_BOOSTED = 4;

// Legacy exports for backward compat
const FREE_DAILY_LIMIT = FREE_CYCLE_LIMIT;
const ADS_FOR_DAILY_UNLOCK = ADS_FOR_CYCLE_UNLOCK;

export {
  FREE_DAILY_LIMIT,
  FREE_CYCLE_LIMIT,
  ADS_FOR_DAILY_UNLOCK,
  ADS_FOR_CYCLE_UNLOCK,
  CYCLE_UNLOCK_HOURS,
  ADS_FOR_WEEKLY_UNLOCK,
  WEEKLY_UNLOCK_DAYS,
  AD_DURATION_SECONDS,
  INTERSTITIAL_INTERVAL,
  EXTRA_SLOT_MINUTES,
  MAX_CONCURRENT_DEFAULT,
  MAX_CONCURRENT_BOOSTED,
};

interface UsageState {
  // ── Cycle tracking ──
  cycleDownloads: number;        // downloads in current free cycle
  cycleAdsWatched: number;       // ads watched toward cycle unlock
  cycleUnlockExpiry: string | null; // ISO date when 6hr unlock expires

  // ── Legacy aliases (backward compat) ──
  dailyDownloads: number;
  lastDownloadDate: string;
  dailyUnlocked: boolean;
  dailyAdsWatched: number;

  // ── Ad Farm ──
  farmAdsWatched: number;
  farmUnlockExpiry: string | null;

  // ── Interstitial tracking ──
  downloadsSinceLastInterstitial: number;

  // ── Extra download slot ──
  extraSlotExpiry: string | null;

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
  isCycleUnlocked: () => boolean;
  getUnlockStatus: () => 'free' | 'ads_needed' | 'unlimited_daily' | 'unlimited_weekly';

  // ── Interstitial ──
  incrementInterstitialCounter: () => void;
  resetInterstitialCounter: () => void;
  shouldShowInterstitial: () => boolean;

  // ── Extra slot ──
  hasExtraSlot: () => boolean;
  unlockExtraSlot: () => void;
  getMaxConcurrent: () => number;
  getExtraSlotRemainingMs: () => number;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      // Cycle
      cycleDownloads: 0,
      cycleAdsWatched: 0,
      cycleUnlockExpiry: null,

      // Legacy aliases
      dailyDownloads: 0,
      lastDownloadDate: '',
      dailyUnlocked: false,
      dailyAdsWatched: 0,

      // Farm
      farmAdsWatched: 0,
      farmUnlockExpiry: null,

      // Interstitial
      downloadsSinceLastInterstitial: 0,

      // Extra slot
      extraSlotExpiry: null,

      // Stats
      totalDownloads: 0,
      totalAdsWatched: 0,

      // ══════════════════════════════════════
      //  Record a download
      // ══════════════════════════════════════
      recordDownload: () => {
        const state = get();
        const today = getTodayStr();

        // Check if cycle unlock expired → reset cycle
        const cycleExpired = state.cycleUnlockExpiry
          && new Date(state.cycleUnlockExpiry) <= new Date();

        set({
          cycleDownloads: cycleExpired ? 1 : state.cycleDownloads + 1,
          cycleAdsWatched: cycleExpired ? 0 : state.cycleAdsWatched,
          cycleUnlockExpiry: cycleExpired ? null : state.cycleUnlockExpiry,
          totalDownloads: state.totalDownloads + 1,
          downloadsSinceLastInterstitial: state.downloadsSinceLastInterstitial + 1,
          // Legacy
          dailyDownloads: state.lastDownloadDate !== today
            ? 1 : state.dailyDownloads + 1,
          lastDownloadDate: today,
        });
      },

      // ══════════════════════════════════════
      //  Record an ad watched
      // ══════════════════════════════════════
      recordAdWatched: (type) => {
        const state = get();
        set({ totalAdsWatched: state.totalAdsWatched + 1 });

        if (type === 'daily') {
          const newCount = state.cycleAdsWatched + 1;
          const unlocked = newCount >= ADS_FOR_CYCLE_UNLOCK;
          set({
            cycleAdsWatched: newCount,
            dailyAdsWatched: newCount,
            dailyUnlocked: unlocked,
            ...(unlocked ? {
              cycleUnlockExpiry: new Date(
                Date.now() + CYCLE_UNLOCK_HOURS * 60 * 60 * 1000
              ).toISOString(),
              cycleDownloads: 0, // Reset for next grace period
            } : {}),
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
                  farmAdsWatched: 0,
                }
              : {}),
          });
        }
      },

      resetFarmProgress: () => set({ farmAdsWatched: 0 }),

      // ══════════════════════════════════════
      //  Can user download right now?
      // ══════════════════════════════════════
      canDownload: () => {
        const state = get();

        // Weekly unlock active?
        if (state.farmUnlockExpiry && new Date(state.farmUnlockExpiry) > new Date()) {
          return true;
        }

        // 6-hour cycle unlock active?
        if (state.cycleUnlockExpiry && new Date(state.cycleUnlockExpiry) > new Date()) {
          return true;
        }

        // Cycle unlock expired → grace period (new 4 free downloads)
        if (state.cycleUnlockExpiry && new Date(state.cycleUnlockExpiry) <= new Date()) {
          // Expired — check if grace downloads remain
          if (state.cycleDownloads < FREE_CYCLE_LIMIT) return true;
          return false;
        }

        // No unlock ever / first time — under free limit
        if (state.cycleDownloads < FREE_CYCLE_LIMIT) return true;

        return false;
      },

      getRemainingFreeDownloads: () => {
        const state = get();

        // If weekly unlocked
        if (state.farmUnlockExpiry && new Date(state.farmUnlockExpiry) > new Date()) {
          return 999; // unlimited
        }

        // If cycle unlocked
        if (state.cycleUnlockExpiry && new Date(state.cycleUnlockExpiry) > new Date()) {
          return 999; // unlimited
        }

        return Math.max(0, FREE_CYCLE_LIMIT - state.cycleDownloads);
      },

      isCycleUnlocked: () => {
        const state = get();
        return !!(state.cycleUnlockExpiry && new Date(state.cycleUnlockExpiry) > new Date());
      },

      isDailyUnlocked: () => {
        const state = get();
        return !!(state.cycleUnlockExpiry && new Date(state.cycleUnlockExpiry) > new Date());
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

        // 6-hour cycle unlock
        if (state.cycleUnlockExpiry && new Date(state.cycleUnlockExpiry) > new Date()) {
          return 'unlimited_daily';
        }

        // Under free limit (including grace after expired unlock)
        if (state.cycleDownloads < FREE_CYCLE_LIMIT) return 'free';

        // Needs ads
        return 'ads_needed';
      },

      // ══════════════════════════════════════
      //  Interstitial tracking
      // ══════════════════════════════════════
      incrementInterstitialCounter: () => {
        set((s) => ({
          downloadsSinceLastInterstitial: s.downloadsSinceLastInterstitial + 1,
        }));
      },

      resetInterstitialCounter: () => {
        set({ downloadsSinceLastInterstitial: 0 });
      },

      shouldShowInterstitial: () => {
        const state = get();
        return state.downloadsSinceLastInterstitial >= INTERSTITIAL_INTERVAL;
      },

      // ══════════════════════════════════════
      //  Extra download slot (4th concurrent)
      // ══════════════════════════════════════
      hasExtraSlot: () => {
        const state = get();
        return !!(state.extraSlotExpiry && new Date(state.extraSlotExpiry) > new Date());
      },

      unlockExtraSlot: () => {
        set({
          extraSlotExpiry: new Date(
            Date.now() + EXTRA_SLOT_MINUTES * 60 * 1000
          ).toISOString(),
        });
      },

      getMaxConcurrent: () => {
        const state = get();
        const hasSlot = state.extraSlotExpiry && new Date(state.extraSlotExpiry) > new Date();
        return hasSlot ? MAX_CONCURRENT_BOOSTED : MAX_CONCURRENT_DEFAULT;
      },

      getExtraSlotRemainingMs: () => {
        const state = get();
        if (!state.extraSlotExpiry) return 0;
        const remaining = new Date(state.extraSlotExpiry).getTime() - Date.now();
        return Math.max(0, remaining);
      },
    }),
    {
      name: 'ayn-usage-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
