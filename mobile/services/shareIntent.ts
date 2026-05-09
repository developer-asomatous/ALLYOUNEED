import { useEffect, useRef, useCallback } from 'react';
import { AppState, Platform, Linking } from 'react-native';
import ReceiveSharingIntent from 'react-native-receive-sharing-intent';
import { useAppStore } from '../store/appStore';
import { useUsageStore } from '../store/usageStore';
import { isValidUrl } from '../utils/helpers';
import { fetchInfo, startDownload, getJobStatus } from './api';

/**
 * Extract a URL from shared text.
 * Instagram/YouTube/TikTok etc. often share text that contains a URL
 * surrounded by other text. This extracts the first valid URL.
 */
function extractUrl(text: string): string | null {
  if (!text) return null;

  // Try the whole string first
  const trimmed = text.trim();
  if (isValidUrl(trimmed)) return trimmed;

  // Extract URL pattern from text
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = trimmed.match(urlRegex);
  if (matches && matches.length > 0) {
    return matches[0];
  }

  return null;
}

/**
 * Hook that handles incoming share intents.
 * Call this in your root layout — it listens for shared URLs and
 * automatically starts downloads using the default quality settings.
 */
export function useShareIntentHandler() {
  const {
    setInputUrl,
    setMediaInfo,
    setFetchingInfo,
    setSelectedFormat,
    setMediaType,
    addDownload,
    updateDownload,
    mediaType,
    defaultQuality,
  } = useAppStore();

  const processingRef = useRef(false);
  const { canDownload, recordDownload } = useUsageStore();

  const autoDownload = useCallback(async (url: string) => {
    if (processingRef.current) return;

    // Check usage limit — for share intents, silently skip if limit reached
    if (!canDownload()) {
      console.warn('[ShareIntent] Daily download limit reached, skipping auto-download');
      // Still set the URL so user can manually trigger after watching ad
      setInputUrl(url);
      return;
    }

    processingRef.current = true;

    try {
      // Set the URL in the input (so user can see what's happening)
      setInputUrl(url);
      setFetchingInfo(true);

      // Fetch media info
      const info = await fetchInfo(url);
      setMediaInfo(info);

      // Determine media type
      const detectedType: 'video' | 'audio' | 'image' = info.isImage
        ? 'image'
        : info.formats.some((f: any) => f.type === 'video')
          ? 'video'
          : 'audio';
      setMediaType(detectedType);

      // Auto-select best format based on default quality
      const typeFormats = info.formats.filter((f: any) => f.type === detectedType);
      const selectedFormat = typeFormats[0] || info.formats[0];

      if (!selectedFormat) {
        setFetchingInfo(false);
        processingRef.current = false;
        return;
      }

      setSelectedFormat(selectedFormat);
      setFetchingInfo(false);

      // Start download automatically
      const { jobId } = await startDownload({
        url: info.url,
        formatId: selectedFormat.id,
        outputFormat: selectedFormat.ext,
        audioOnly: detectedType === 'audio',
        imageOnly: detectedType === 'image',
      });

      // Record download for usage tracking
      recordDownload();

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

      // Poll job status
      const interval = setInterval(async () => {
        try {
          const status = await getJobStatus(jobId);
          updateDownload(jobId, {
            status: status.status as any,
            progress: status.progress,
            speed: status.speed,
            eta: status.eta,
            error: status.error || undefined,
          });
          if (status.status === 'done' || status.status === 'failed') {
            clearInterval(interval);
          }
        } catch {
          clearInterval(interval);
        }
      }, 1000);

      // Clear the input for next share
      setInputUrl('');
      setMediaInfo(null);
    } catch (err: any) {
      console.warn('[ShareIntent] Auto-download failed:', err.message);
      // Don't clear URL on error — let user see what happened and retry manually
      setFetchingInfo(false);
    } finally {
      processingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      // Handle shares coming from other apps on Android
      ReceiveSharingIntent.getReceivedFiles(
        (files: any[]) => {
          if (files && files.length > 0) {
            const shared = files[0];
            // For text shares (URLs), the text is in weblink or text field
            const sharedText = shared.weblink || shared.text || shared.contentUri || '';
            const url = extractUrl(sharedText);
            if (url) {
              autoDownload(url);
            }
          }
        },
        (error: any) => {
          console.warn('[ShareIntent] Error receiving shared files:', error);
        },
        'com.ayn.allyouneed' // Your app's package name
      );

      return () => {
        ReceiveSharingIntent.clearReceivedFiles();
      };
    }

    if (Platform.OS === 'ios') {
      // Handle URL scheme deep links on iOS (ayn://download?url=...)
      const handleUrl = (event: { url: string }) => {
        const { url } = event;
        if (url.startsWith('ayn://')) {
          const parsed = new URL(url);
          const sharedUrl = parsed.searchParams.get('url');
          if (sharedUrl && isValidUrl(sharedUrl)) {
            autoDownload(sharedUrl);
          }
        }
      };

      // Check if app was opened with a URL
      Linking.getInitialURL().then((url) => {
        if (url) handleUrl({ url });
      });

      // Listen for URL events while app is running
      const subscription = Linking.addEventListener('url', handleUrl);
      return () => subscription.remove();
    }
  }, [autoDownload]);

  // Also handle app coming to foreground (re-check clipboard on iOS)
  useEffect(() => {
    if (Platform.OS === 'android') {
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          // Re-check for new share intents when app becomes active
          ReceiveSharingIntent.getReceivedFiles(
            (files: any[]) => {
              if (files && files.length > 0) {
                const shared = files[0];
                const sharedText = shared.weblink || shared.text || shared.contentUri || '';
                const url = extractUrl(sharedText);
                if (url) {
                  autoDownload(url);
                }
              }
            },
            (error: any) => {},
            'com.ayn.allyouneed'
          );
        }
      });
      return () => subscription.remove();
    }
  }, [autoDownload]);
}
