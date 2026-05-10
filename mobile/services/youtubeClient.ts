/**
 * ═══════════════════════════════════════════════════
 *  YouTube Client-Side Extraction
 * ═══════════════════════════════════════════════════
 *
 * Downloads YouTube videos directly from the phone.
 * The phone's residential IP is never blocked by YouTube,
 * unlike our datacenter-hosted backend (Render).
 *
 * Flow:
 *  1. Fetch YouTube page HTML from phone
 *  2. Extract ytInitialPlayerResponse JSON from HTML
 *  3. Parse streaming URLs and metadata
 *  4. Return MediaInfo-compatible object
 */

import { MediaInfo } from '../store/appStore';

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/**
 * Extract a YouTube video ID from various URL formats
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // bare ID
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Check if a URL is a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}

interface StreamingFormat {
  itag: number;
  url?: string;
  signatureCipher?: string;
  mimeType: string;
  qualityLabel?: string;
  quality: string;
  width?: number;
  height?: number;
  contentLength?: string;
  audioQuality?: string;
  fps?: number;
  bitrate?: number;
}

/**
 * Fetch YouTube video info directly from the phone (client-side).
 * Returns a MediaInfo-compatible object ready for the download flow.
 */
export async function fetchYouTubeClientInfo(url: string): Promise<MediaInfo> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error('Invalid YouTube URL');

  // Try the mobile innertube API first (most reliable)
  try {
    return await fetchViaInnerTube(videoId);
  } catch (e: any) {
    console.warn('[YT-Client] InnerTube failed:', e.message);
  }

  // Fallback: scrape from YouTube page HTML
  return await fetchViaPageScrape(videoId);
}

/**
 * Method 1: YouTube InnerTube API (the official internal API)
 * This is what the YouTube app itself uses.
 */
async function fetchViaInnerTube(videoId: string): Promise<MediaInfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const body = {
      videoId,
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.29.37',
          androidSdkVersion: 34,
          hl: 'en',
          gl: 'US',
          userAgent: MOBILE_UA,
        },
      },
    };

    const response = await fetch(
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': MOBILE_UA,
          'X-YouTube-Client-Name': '3', // ANDROID
          'X-YouTube-Client-Version': '19.29.37',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`InnerTube HTTP ${response.status}`);

    const data = await response.json();

    if (data.playabilityStatus?.status !== 'OK') {
      throw new Error(
        data.playabilityStatus?.reason || 'Video not playable',
      );
    }

    return parsePlayerResponse(data, videoId);
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

/**
 * Method 2: Scrape YouTube page HTML for ytInitialPlayerResponse
 */
async function fetchViaPageScrape(videoId: string): Promise<MediaInfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          'User-Agent': MOBILE_UA,
          'Accept-Language': 'en-US,en;q=0.9',
          Accept: 'text/html',
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    const html = await response.text();

    // Extract ytInitialPlayerResponse from page
    const match = html.match(
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
    );
    if (!match) throw new Error('Could not find player response in page');

    const data = JSON.parse(match[1]);

    if (data.playabilityStatus?.status !== 'OK') {
      throw new Error(
        data.playabilityStatus?.reason || 'Video not playable',
      );
    }

    return parsePlayerResponse(data, videoId);
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

/**
 * Parse YouTube player response into our MediaInfo format
 */
function parsePlayerResponse(data: any, videoId: string): MediaInfo {
  const videoDetails = data.videoDetails || {};
  const streamingData = data.streamingData || {};

  // Collect all formats
  const allFormats: StreamingFormat[] = [
    ...(streamingData.formats || []),
    ...(streamingData.adaptiveFormats || []),
  ];

  // Convert to our format structure
  const formats = allFormats
    .filter((f: StreamingFormat) => f.url) // Only formats with direct URLs (no cipher)
    .map((f: StreamingFormat) => {
      const isVideo = f.mimeType?.startsWith('video/');
      const isAudio = f.mimeType?.startsWith('audio/');
      const ext = f.mimeType?.includes('mp4')
        ? 'mp4'
        : f.mimeType?.includes('webm')
          ? 'webm'
          : 'mp4';

      return {
        id: String(f.itag),
        ext,
        quality: f.qualityLabel || f.quality || (isAudio ? 'audio' : 'unknown'),
        type: isVideo ? 'video' : isAudio ? 'audio' : ('video' as 'video' | 'audio'),
        filesize: f.contentLength ? parseInt(f.contentLength) : null,
        url: f.url!,
        width: f.width || null,
        height: f.height || null,
        fps: f.fps || null,
        vcodec: isVideo ? 'h264' : null,
        acodec: isAudio ? 'aac' : null,
      };
    })
    // Sort: videos first (highest quality), then audio
    .sort((a: any, b: any) => {
      if (a.type !== b.type) return a.type === 'video' ? -1 : 1;
      return (b.height || 0) - (a.height || 0);
    });

  if (formats.length === 0) {
    throw new Error('No downloadable formats found (video may require sign-in)');
  }

  const thumbnail =
    videoDetails.thumbnail?.thumbnails?.slice(-1)?.[0]?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: videoDetails.title || 'YouTube Video',
    thumbnail,
    duration: parseInt(videoDetails.lengthSeconds || '0'),
    platform: 'youtube',
    formats,
    isImage: false,
  };
}
