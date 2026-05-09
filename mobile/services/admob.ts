import { Platform } from 'react-native';
import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

/**
 * ═══════════════════════════════════════
 *  AYN AdMob Rewarded Ad Service
 * ═══════════════════════════════════════
 *
 * Uses Google AdMob rewarded ads for:
 *   1. Daily unlock (watch 2 ads → unlimited today)
 *   2. Ad Farm (watch 20 ads → 7 days unlimited)
 *
 * In __DEV__ mode, uses Google's test ad IDs.
 * In production, uses the real ad unit IDs.
 */

// ── Ad Unit IDs ──
const REWARDED_AD_UNIT_ID = __DEV__
  ? TestIds.REWARDED
  : 'ca-app-pub-9788661852462172/7680460339';

// ── State ──
let currentAd: RewardedAd | null = null;
let isAdLoading = false;
let isAdReady = false;

/**
 * Preload a rewarded ad so it's ready to show instantly.
 * Call this early (e.g., on app start or after showing an ad).
 */
export function preloadRewardedAd(): void {
  if (isAdLoading || isAdReady) return;

  isAdLoading = true;
  currentAd = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID, {
    keywords: ['media', 'downloader', 'video', 'music'],
  });

  currentAd.addAdEventListener(AdEventType.LOADED, () => {
    isAdLoading = false;
    isAdReady = true;
  });

  currentAd.addAdEventListener(AdEventType.ERROR, (error) => {
    isAdLoading = false;
    isAdReady = false;
    console.warn('[AdMob] Ad load error:', error.message);
  });

  currentAd.load();
}

/**
 * Show a rewarded ad and return a promise that resolves when the user
 * earns the reward (watched the full ad), or rejects on error/dismiss.
 *
 * @returns Promise<boolean> — true if reward earned, false if dismissed
 */
export function showRewardedAd(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!currentAd || !isAdReady) {
      // Try to load and show
      const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID, {
        keywords: ['media', 'downloader', 'video', 'music'],
      });

      let rewardEarned = false;

      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        rewardEarned = true;
      });

      ad.addAdEventListener(AdEventType.CLOSED, () => {
        // Preload next ad
        isAdReady = false;
        currentAd = null;
        preloadRewardedAd();
        resolve(rewardEarned);
      });

      ad.addAdEventListener(AdEventType.ERROR, (error) => {
        console.warn('[AdMob] Ad error:', error.message);
        isAdReady = false;
        currentAd = null;
        reject(new Error(`Ad failed: ${error.message}`));
      });

      ad.addAdEventListener(AdEventType.LOADED, () => {
        ad.show();
      });

      ad.load();
      return;
    }

    // Ad already preloaded — show it
    let rewardEarned = false;

    currentAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      rewardEarned = true;
    });

    currentAd.addAdEventListener(AdEventType.CLOSED, () => {
      isAdReady = false;
      currentAd = null;
      preloadRewardedAd();
      resolve(rewardEarned);
    });

    currentAd.addAdEventListener(AdEventType.ERROR, (error) => {
      isAdReady = false;
      currentAd = null;
      reject(new Error(`Ad failed: ${error.message}`));
    });

    currentAd.show();
  });
}

/**
 * Check if a rewarded ad is ready to show (preloaded).
 */
export function isRewardedAdReady(): boolean {
  return isAdReady;
}
