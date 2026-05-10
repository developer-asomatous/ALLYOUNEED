import { useEffect, useRef, useCallback } from 'react';
import { AppState, Platform, Linking, NativeModules } from 'react-native';
import ReceiveSharingIntent from 'react-native-receive-sharing-intent';
import { useAppStore } from '../store/appStore';
import { useUsageStore } from '../store/usageStore';
import { isValidUrl, isShortenerUrl, resolveRedirectUrl } from '../utils/helpers';
import { isYouTubeUrl } from './youtubeClient';
import { fetchInfo, startDownload, getJobStatus, warmupBackend } from './api';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { API_BASE_URL } from '../constants/theme';
import {
  showDownloadStarted,
  showDownloadComplete,
  showDownloadFailed,
  updateDownloadProgress,
  shouldNotifyProgress,
  clearProgressThrottle,
} from './notifications';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Share-to-Download — True Background Handler
 * ═══════════════════════════════════════════════════
 *
 *  When a URL is shared from Instagram/YouTube/etc:
 *  1. App receives the URL
 *  2. Immediately sends user back to previous app
 *  3. Shows "Download starting..." notification
 *  4. Fetches info → starts download → polls → saves
 *  5. Shows "Download complete ✅" notification
 *  All happens in background. User never has to interact.
 */

function extractUrl(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (isValidUrl(trimmed)) return trimmed;
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = trimmed.match(urlRegex);
  if (matches && matches.length > 0) return matches[0];
  return null;
}

/** Send user back to previous app without killing the process */
function goBackToPreviousApp() {
  if (Platform.OS === 'android') {
    try {
      // Uses native AppMinimizer module → Activity.moveTaskToBack(true)
      // This keeps the app alive in background so downloads continue
      NativeModules.AppMinimizer?.minimize();
    } catch (e) {
      // Fallback: do nothing — app stays open but download still runs
    }
  }
}

export function useShareIntentHandler() {
  const {
    addDownload,
    updateDownload,
  } = useAppStore();
  const processingRef = useRef(false);
  const { canDownload, recordDownload } = useUsageStore();

  /**
   * Fully automatic background download.
   * Fetches info, picks best format, starts download,
   * polls until done, saves to gallery. All silent.
   */
  const autoDownload = useCallback(async (url: string) => {
    if (processingRef.current) return;
    processingRef.current = true;

    // Send user back immediately — don't make them wait
    setTimeout(() => goBackToPreviousApp(), 300);

    // Show immediate notification so user knows it's working
    const tempNotifId = await showDownloadStarted('pending', url.substring(0, 50), 'media').catch(() => '');

    try {
      // Ensure backend is warm
      await warmupBackend();

      // Resolve shortened URLs (messycloud.ink, bit.ly, etc.)
      let resolvedUrl = url;
      if (isShortenerUrl(url)) {
        resolvedUrl = await resolveRedirectUrl(url);
      }

      // Fetch media info — api.ts handles timeout+retry internally
      const info = await fetchInfo(resolvedUrl);

      if (!info || !info.formats || info.formats.length === 0) {
        // If no formats but we have the URL, try direct download
        showDownloadFailed('pending', url, 'No downloadable formats found').catch(() => {});
        processingRef.current = false;
        return;
      }

      // Auto-select best format
      const detectedType: 'video' | 'audio' | 'image' = info.isImage
        ? 'image'
        : info.formats.some((f: any) => f.type === 'video')
          ? 'video'
          : 'audio';
      
      const typeFormats = info.formats.filter((f: any) => f.type === detectedType);
      // Pick best quality: first video format (usually highest quality) or first available
      const selectedFormat = typeFormats[0] || info.formats[0];

      if (!selectedFormat) {
        showDownloadFailed('pending', info.title || url, 'No compatible format found').catch(() => {});
        processingRef.current = false;
        return;
      }

      // If we got a direct streaming URL (YouTube client-side), download directly on phone
      const hasDirectUrl = (selectedFormat as any).url && isYouTubeUrl(info.url);

      if (hasDirectUrl) {
        // Direct device download — no backend needed
        const directUrl = (selectedFormat as any).url;
        const jobId = `yt-direct-${Date.now()}`;
        const ext = selectedFormat.ext || 'mp4';
        const safeTitle = (info.title || 'youtube_video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
        const filename = `${safeTitle}.${ext}`;
        const localUri = `${FileSystem.cacheDirectory}${filename}`;

        showDownloadStarted(jobId, info.title, 'youtube').catch(() => {});
        addDownload({
          id: jobId,
          url: info.url,
          title: info.title,
          thumbnail: info.thumbnail,
          platform: 'youtube',
          status: 'downloading',
          progress: 0,
          speed: '0 B/s',
          eta: '--:--',
          format: ext,
          quality: selectedFormat.quality,
          fileSize: selectedFormat.filesize || undefined,
          createdAt: Date.now(),
        });

        // Download file directly to phone
        const downloadResumable = FileSystem.createDownloadResumable(
          directUrl,
          localUri,
          { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36' } },
          (downloadProgress) => {
            const pct = downloadProgress.totalBytesWritten / (downloadProgress.totalBytesExpectedToWrite || 1);
            updateDownload(jobId, { progress: Math.round(pct * 100), status: 'downloading' });
          },
        );

        try {
          const result = await downloadResumable.downloadAsync();
          if (result?.uri) {
            // Save to gallery
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status === 'granted') {
              await MediaLibrary.createAssetAsync(result.uri);
            }
            updateDownload(jobId, { progress: 100, status: 'completed', localUri: result.uri });
            recordDownload();
            showDownloadComplete(jobId, info.title, 'youtube').catch(() => {});
          }
        } catch (dlErr: any) {
          updateDownload(jobId, { status: 'failed' });
          showDownloadFailed(jobId, info.title, dlErr.message || 'Download failed').catch(() => {});
        }
        processingRef.current = false;
        return;
      }

      // Non-YouTube or no direct URL: use backend download pipeline
      const { jobId } = await startDownload({
        url: info.url,
        formatId: selectedFormat.id,
        outputFormat: selectedFormat.ext,
        audioOnly: detectedType === 'audio',
        imageOnly: detectedType === 'image',
      });

      // Update notification with actual title
      showDownloadStarted(jobId, info.title, info.platform).catch(() => {});

      // Add to download store
      addDownload({
        id: jobId,
        url: info.url,
        title: info.title,
        thumbnail: info.thumbnail,
        platform: info.platform,
        status: 'downloading',
        progress: 0,
        speed: '0 B/s',
        eta: '--:--',
        format: selectedFormat.ext,
        quality: selectedFormat.quality,
        fileSize: selectedFormat.filesize || undefined,
        createdAt: Date.now(),
      });

      // Poll until complete — all in background
      pollUntilDone(jobId, info.title, selectedFormat.ext);

    } catch (err: any) {
      console.warn('[AYN-Share] Background download failed:', err.message);
      // Parse error for smart notification
      const details = (err.details || err.message || '').toLowerCase();
      let errMsg = 'Could not process this link';
      if (details.includes('login') || details.includes('cookies') || details.includes('logged-in')) {
        errMsg = 'This post requires login — try a public link';
      } else if (details.includes('private') || details.includes('restricted')) {
        errMsg = 'This content is private';
      } else if (details.includes('not found') || details.includes('unavailable') || details.includes('deleted')) {
        errMsg = 'Content removed or unavailable';
      } else if (err.isTimeout) {
        errMsg = 'Server did not respond — try again later';
      } else if (err.isNetworkError) {
        errMsg = 'No internet connection';
      }
      showDownloadFailed('pending', url.substring(0, 50), errMsg).catch(() => {});
    } finally {
      processingRef.current = false;
    }
  }, []);

  /**
   * Poll job status in background until done/failed.
   * Saves file to device gallery when complete.
   */
  const pollUntilDone = useCallback((jobId: string, title: string, ext: string) => {
    let failCount = 0;
    const maxFails = 10; // Allow 10 consecutive poll failures before giving up

    const interval = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId);
        failCount = 0; // Reset on success

        updateDownload(jobId, {
          status: status.status as any,
          progress: status.progress,
          speed: status.speed,
          eta: status.eta,
          error: status.error || undefined,
        });

        // Throttled progress notification
        if (shouldNotifyProgress(jobId) && status.progress > 0) {
          updateDownloadProgress(jobId, title, status.progress, status.speed).catch(() => {});
        }

        if (status.status === 'done') {
          clearInterval(interval);
          clearProgressThrottle(jobId);
          recordDownload();

          // Download file to device and save to gallery
          try {
            await saveFileToDevice(jobId, title, ext);
            showDownloadComplete(jobId, title).catch(() => {});
          } catch (saveErr: any) {
            console.warn('[AYN-Share] Save to gallery failed:', saveErr.message);
            // Still show complete — file is available on server
            showDownloadComplete(jobId, title).catch(() => {});
          }
        } else if (status.status === 'failed') {
          clearInterval(interval);
          clearProgressThrottle(jobId);
          showDownloadFailed(jobId, title, status.error || 'Download failed').catch(() => {});
        }
      } catch (pollErr: any) {
        failCount++;
        if (failCount >= maxFails) {
          clearInterval(interval);
          clearProgressThrottle(jobId);
          showDownloadFailed(jobId, title, 'Lost connection to server').catch(() => {});
        }
        // Otherwise just retry on next interval
      }
    }, 1500);

    // Safety: auto-stop polling after 30 minutes
    setTimeout(() => {
      clearInterval(interval);
      clearProgressThrottle(jobId);
    }, 30 * 60 * 1000);
  }, []);

  /**
   * Download the completed file from server and save to device storage/gallery.
   */
  const saveFileToDevice = useCallback(async (jobId: string, title: string, ext: string) => {
    const safeName = (title || 'download')
      .replace(/[^a-zA-Z0-9_\-. ]/g, '')
      .substring(0, 50)
      .trim();
    const filename = `${safeName}_${jobId.substring(0, 8)}.${ext}`;
    const streamUrl = API_BASE_URL.replace('/v1', '') + `/v1/stream/${jobId}`;
    const localUri = `${FileSystem.cacheDirectory}${filename}`;

    const downloadResult = await FileSystem.downloadAsync(streamUrl, localUri);
    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status ${downloadResult.status}`);
    }

    updateDownload(jobId, { localUri: downloadResult.uri });

    // Save to gallery if it's a media file
    const mediaExts = ['mp4', 'mkv', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'm4a'];
    if (mediaExts.includes(ext.toLowerCase())) {
      const { status: permStatus } = await MediaLibrary.requestPermissionsAsync();
      if (permStatus === 'granted') {
        await MediaLibrary.saveToLibraryAsync(downloadResult.uri);
      }
    }
  }, []);

  // ── Android Share Intent Listener ──
  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        ReceiveSharingIntent.getReceivedFiles(
          (files: any[]) => {
            if (files && files.length > 0) {
              const shared = files[0];
              const sharedText = shared.weblink || shared.text || shared.contentUri || '';
              const url = extractUrl(sharedText);
              if (url) autoDownload(url);
            }
          },
          (error: any) => {
            // Safe to ignore — this fires when app opens normally (not via share)
          },
          'com.ayn.allyouneed'
        );
      } catch (e) {
        // Safe to ignore
      }
      return () => {
        try { ReceiveSharingIntent.clearReceivedFiles(); } catch (e) {}
      };
    }

    if (Platform.OS === 'ios') {
      const handleUrl = (event: { url: string }) => {
        const { url } = event;
        if (url.startsWith('ayn://')) {
          const parsed = new URL(url);
          const sharedUrl = parsed.searchParams.get('url');
          if (sharedUrl && isValidUrl(sharedUrl)) autoDownload(sharedUrl);
        }
      };
      Linking.getInitialURL().then((url) => {
        if (url) handleUrl({ url });
      });
      const subscription = Linking.addEventListener('url', handleUrl);
      return () => subscription.remove();
    }
  }, [autoDownload]);

  // ── Re-check on app resume (Android) ──
  useEffect(() => {
    if (Platform.OS === 'android') {
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          try {
            ReceiveSharingIntent.getReceivedFiles(
              (files: any[]) => {
                if (files && files.length > 0) {
                  const shared = files[0];
                  const sharedText = shared.weblink || shared.text || shared.contentUri || '';
                  const url = extractUrl(sharedText);
                  if (url) autoDownload(url);
                }
              },
              (error: any) => {},
              'com.ayn.allyouneed'
            );
          } catch (e) {}
        }
      });
      return () => subscription.remove();
    }
  }, [autoDownload]);
}
