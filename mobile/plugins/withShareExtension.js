const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

/**
 * Expo Config Plugin: Add share intent support
 * 
 * Android: Adds ACTION_SEND intent filter to MainActivity
 * iOS: Adds URL scheme and shared container
 */
function withShareExtension(config) {
  // ═══════════════════
  //  ANDROID
  // ═══════════════════
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) return config;

    const activities = application.activity;
    if (!activities || activities.length === 0) return config;

    // Find the main activity
    const mainActivity = activities.find(
      (a) => a.$?.['android:name'] === '.MainActivity'
    );
    if (!mainActivity) return config;

    // Ensure intent-filter array exists
    if (!mainActivity['intent-filter']) {
      mainActivity['intent-filter'] = [];
    }

    // Check if share intent filter already exists
    const hasShareFilter = mainActivity['intent-filter'].some((filter) =>
      filter.action?.some((a) => a.$?.['android:name'] === 'android.intent.action.SEND')
    );

    if (!hasShareFilter) {
      // Add ACTION_SEND intent filter for text/plain (URLs shared from other apps)
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });

      // Also handle ACTION_SEND for images
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'image/*' } }],
      });
    }

    // Add launchMode singleTask to handle re-opening properly
    mainActivity.$['android:launchMode'] = 'singleTask';

    return config;
  });

  // ═══════════════════
  //  iOS
  // ═══════════════════
  config = withInfoPlist(config, (config) => {
    // Add URL scheme for deep linking (ayn://)
    if (!config.modResults.CFBundleURLTypes) {
      config.modResults.CFBundleURLTypes = [];
    }

    const hasScheme = config.modResults.CFBundleURLTypes.some(
      (type) => type.CFBundleURLSchemes?.includes('ayn')
    );

    if (!hasScheme) {
      config.modResults.CFBundleURLTypes.push({
        CFBundleURLSchemes: ['ayn'],
        CFBundleURLName: 'com.ayn.share',
      });
    }

    // Register as a handler for web URLs
    if (!config.modResults.LSApplicationQueriesSchemes) {
      config.modResults.LSApplicationQueriesSchemes = [];
    }

    return config;
  });

  return config;
}

module.exports = withShareExtension;
