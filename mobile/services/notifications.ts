import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Notification Service
 * ═══════════════════════════════════════════════════
 *
 *  Handles local notifications for download events:
 *  • Download started
 *  • Download progress (throttled)
 *  • Download complete (with open action)
 *  • Download failed (with retry hint)
 */

let isConfigured = false;

/** Configure notification handler & channels. Call once on app start. */
export async function configureNotifications(): Promise<void> {
  if (isConfigured) return;

  // Configure foreground behavior
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowInForeground: true,
    }),
  });

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('downloads', {
      name: 'Downloads',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 100],
      lightColor: '#00D4FF',
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync('download-progress', {
      name: 'Download Progress',
      importance: Notifications.AndroidImportance.LOW,
      enableVibrate: false,
      showBadge: false,
    });
  }

  isConfigured = true;
}

/** Request notification permissions. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Show "Download starting" notification */
export async function showDownloadStarted(
  jobId: string,
  title: string,
  platform: string,
): Promise<string> {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⬇️ Download Starting',
      body: `"${truncate(title, 50)}" from ${platform}`,
      data: { jobId, type: 'download_started' },
      ...(Platform.OS === 'android' && { channelId: 'downloads' }),
    },
    trigger: null, // Show immediately
  });
  return id;
}

/** Update download progress notification (replaces previous) */
export async function updateDownloadProgress(
  jobId: string,
  title: string,
  progress: number,
  speed: string,
): Promise<string> {
  const id = await Notifications.scheduleNotificationAsync({
    identifier: `progress-${jobId}`,
    content: {
      title: `📥 ${Math.round(progress)}% — ${truncate(title, 40)}`,
      body: `Speed: ${speed}`,
      data: { jobId, type: 'download_progress' },
      ...(Platform.OS === 'android' && { channelId: 'download-progress' }),
    },
    trigger: null,
  });
  return id;
}

/** Show "Download complete" notification */
export async function showDownloadComplete(
  jobId: string,
  title: string,
): Promise<string> {
  // Dismiss progress notification
  await Notifications.dismissNotificationAsync(`progress-${jobId}`).catch(() => {});

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '✅ Download Complete',
      body: `"${truncate(title, 50)}" saved to your device`,
      data: { jobId, type: 'download_complete' },
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: 'downloads' }),
    },
    trigger: null,
  });
  return id;
}

/** Show "Download failed" notification */
export async function showDownloadFailed(
  jobId: string,
  title: string,
  error?: string,
): Promise<string> {
  // Dismiss progress notification
  await Notifications.dismissNotificationAsync(`progress-${jobId}`).catch(() => {});

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '❌ Download Failed',
      body: error
        ? `"${truncate(title, 40)}": ${truncate(error, 60)}`
        : `"${truncate(title, 50)}" could not be downloaded`,
      data: { jobId, type: 'download_failed' },
      ...(Platform.OS === 'android' && { channelId: 'downloads' }),
    },
    trigger: null,
  });
  return id;
}

/** Dismiss all download notifications */
export async function dismissAllDownloadNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}

// ── Helpers ──

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

// Throttle map for progress notifications (don't spam)
const lastProgressNotification = new Map<string, number>();
const PROGRESS_THROTTLE_MS = 5000; // Update progress notification every 5s max

/** Check if we should send a progress notification (throttled) */
export function shouldNotifyProgress(jobId: string): boolean {
  const now = Date.now();
  const last = lastProgressNotification.get(jobId) || 0;
  if (now - last < PROGRESS_THROTTLE_MS) return false;
  lastProgressNotification.set(jobId, now);
  return true;
}

/** Clear throttle state for a job */
export function clearProgressThrottle(jobId: string): void {
  lastProgressNotification.delete(jobId);
}
