import { NativeModules, Platform } from 'react-native';

/**
 * ═══════════════════════════════════════
 *  AYN Unity Ads Service
 * ═══════════════════════════════════════
 *
 * Uses Unity Ads for monetization via native Android SDK.
 *
 * Game IDs:
 *   Android: 6111204
 *   iOS: 6111205
 *
 * Placement IDs:
 *   Rewarded: Rewarded_Android / Rewarded_iOS
 *   Interstitial: Interstitial_Android / Interstitial_iOS
 */

// ── Native Module ──
const UnityAdsNative = NativeModules.UnityAdsModule;

// ── Configuration ──
const UNITY_GAME_ID = Platform.OS === 'ios' ? '6111205' : '6111204';
const REWARDED_PLACEMENT = Platform.OS === 'ios' ? 'Rewarded_iOS' : 'Rewarded_Android';
const INTERSTITIAL_PLACEMENT = Platform.OS === 'ios' ? 'Interstitial_iOS' : 'Interstitial_Android';
// Production mode — placements verified on Unity Dashboard
const TEST_MODE = false;

// ── State ──
let isInitialized = false;
let isAdReady = false;

/**
 * Initialize Unity Ads SDK.
 * Call this once on app startup.
 */
export async function initializeUnityAds(): Promise<void> {
  if (isInitialized) return;

  if (!UnityAdsNative) {
    console.warn('[UnityAds] Native module not available — running in Expo Go?');
    isInitialized = true; // Allow app to work without ads in Expo Go
    return;
  }

  try {
    await UnityAdsNative.initialize(UNITY_GAME_ID, TEST_MODE);
    isInitialized = true;
    console.log(`[UnityAds] ✅ Initialized — Game ID: ${UNITY_GAME_ID}, Test: ${TEST_MODE}`);

    // Pre-load the first rewarded ad
    preloadRewardedAd();
  } catch (error: any) {
    console.warn('[UnityAds] Init error:', error?.message || error);
    isInitialized = true; // Don't block the app
  }
}

/**
 * Preload a rewarded ad so it's ready to show.
 */
export async function preloadRewardedAd(): Promise<void> {
  if (!UnityAdsNative) {
    isAdReady = true; // Stub for Expo Go
    return;
  }

  try {
    await UnityAdsNative.loadAd(REWARDED_PLACEMENT);
    isAdReady = true;
    console.log('[UnityAds] ✅ Rewarded ad loaded');
  } catch (error: any) {
    isAdReady = false;
    console.warn('[UnityAds] Load error:', error?.message || error);
  }
}

/**
 * Show a rewarded ad.
 * Returns true if the user watched the full ad (earned reward).
 * Returns false if they skipped.
 */
export async function showRewardedAd(): Promise<boolean> {
  if (!UnityAdsNative) {
    console.log('[UnityAds] No native module — granting reward (dev mode)');
    return true;
  }

  if (!isInitialized) {
    await initializeUnityAds();
  }

  try {
    // If ad isn't loaded yet, load it first
    if (!isAdReady) {
      await UnityAdsNative.loadAd(REWARDED_PLACEMENT);
    }

    // Show the ad — returns true if COMPLETED, false if SKIPPED
    const rewarded: boolean = await UnityAdsNative.showAd(REWARDED_PLACEMENT);

    // Pre-load next ad
    isAdReady = false;
    preloadRewardedAd();

    return rewarded;
  } catch (error: any) {
    console.warn('[UnityAds] Show error:', error?.message || error);
    isAdReady = false;
    preloadRewardedAd(); // Try to recover
    throw new Error(`Ad failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Check if a rewarded ad is ready to show.
 */
export function isRewardedAdReady(): boolean {
  return isAdReady;
}

/**
 * Get Unity Ads configuration for reference.
 */
export function getUnityAdsConfig() {
  return {
    gameId: UNITY_GAME_ID,
    rewardedPlacement: REWARDED_PLACEMENT,
    interstitialPlacement: INTERSTITIAL_PLACEMENT,
    testMode: TEST_MODE,
    nativeAvailable: !!UnityAdsNative,
  };
}
