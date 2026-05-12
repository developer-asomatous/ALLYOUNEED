import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { getYtdlpAria2cArgs, downloadWithAria2c, isAria2cAvailable } from './accelerator';

// Resolve yt-dlp binary path
const YTDLP_PATHS = [
  '/Users/aravindg/Library/Python/3.9/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  '/opt/homebrew/bin/yt-dlp',
  'yt-dlp', // fallback to PATH
];

function getYtdlpPath(): string {
  for (const p of YTDLP_PATHS) {
    try {
      if (p === 'yt-dlp' || fs.existsSync(p)) {
        execSync(`${p} --version`, { timeout: 5000, stdio: 'pipe' });
        return p;
      }
    } catch {}
  }
  throw new Error('yt-dlp not found. Install via: pip3 install yt-dlp');
}

let YTDLP_BIN: string;
try {
  YTDLP_BIN = getYtdlpPath();
  console.log(`✅ yt-dlp found at: ${YTDLP_BIN}`);
} catch (e: any) {
  console.warn(`⚠️  ${e.message}`);
  YTDLP_BIN = 'yt-dlp';
}

// Resolve ffmpeg binary path
const FFMPEG_PATHS = [
  '/usr/local/bin/ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
  '/usr/bin/ffmpeg',
  'ffmpeg',
];

function getFfmpegPath(): string | null {
  for (const p of FFMPEG_PATHS) {
    try {
      execSync(`${p} -version`, { timeout: 3000, stdio: 'pipe' });
      return p;
    } catch {}
  }
  return null;
}

let FFMPEG_BIN: string | null = null;
try {
  FFMPEG_BIN = getFfmpegPath();
  if (FFMPEG_BIN) {
    console.log(`✅ ffmpeg found at: ${FFMPEG_BIN}`);
  } else {
    console.warn('⚠️  ffmpeg NOT found. High-quality video downloads will NOT have audio.');
  }
} catch {}

// Cookie support for YouTube bot detection bypass
const COOKIES_PATH = '/tmp/yt-cookies.txt';
let COOKIES_AVAILABLE = false;

function initCookies() {
  // Check for cookies env var (Netscape cookie format)
  const cookieData = process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES || '';
  if (cookieData.trim()) {
    try {
      fs.writeFileSync(COOKIES_PATH, cookieData.replace(/\\n/g, '\n'));
      COOKIES_AVAILABLE = true;
      console.log('✅ YouTube cookies loaded from environment');
    } catch (e) {
      console.warn('⚠️  Failed to write cookie file:', e);
    }
  }
  // Also check for a cookies file at standard locations
  if (!COOKIES_AVAILABLE) {
    const cookiePaths = ['/tmp/yt-cookies.txt', './cookies.txt', '/app/cookies.txt'];
    for (const p of cookiePaths) {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) {
        COOKIES_AVAILABLE = true;
        console.log(`✅ YouTube cookies found at: ${p}`);
        break;
      }
    }
  }
  if (!COOKIES_AVAILABLE) {
    console.warn('⚠️  No YouTube cookies — YouTube may block requests from this server IP');
  }
}
initCookies();

function getCookieArgs(): string[] {
  // Always check dynamically — cookies may be uploaded at runtime via API
  const exists = fs.existsSync(COOKIES_PATH);
  const size = exists ? fs.statSync(COOKIES_PATH).size : 0;
  console.log(`[yt-dlp] Cookie check: exists=${exists}, size=${size}, path=${COOKIES_PATH}`);
  if (exists && size > 10) {
    return ['--cookies', COOKIES_PATH];
  }
  return [];
}

export interface MediaFormat {
  id: string;
  ext: string;
  quality: string;
  filesize: number | null;
  resolution?: string;
  vcodec?: string;
  acodec?: string;
  abr?: number;
  type: 'video' | 'audio' | 'image';
  isCombined?: boolean; // True if format includes both video and audio
  directUrl?: string; // CDN download URL for direct client-side download
}

export interface MediaInfo {
  title: string;
  thumbnail: string;
  thumbnails: { url: string; width?: number; height?: number }[];
  duration: number;
  platform: string;
  uploader: string;
  description: string;
  formats: MediaFormat[];
  url: string;
  isImage: boolean;
}

/**
 * Check if URL is a direct image link
 */
function isDirectImageUrl(url: string): boolean {
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff'];
  const lower = url.toLowerCase().split('?')[0];
  return imageExts.some(ext => lower.endsWith(ext));
}

/**
 * Check if URL is a direct media file link
 */
function isDirectMediaUrl(url: string): boolean {
  const mediaExts = ['.mp4', '.mkv', '.webm', '.mov', '.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac'];
  const lower = url.toLowerCase().split('?')[0];
  return mediaExts.some(ext => lower.endsWith(ext));
}

/**
 * Fetch info for a direct image URL
 */
async function fetchDirectImageInfo(url: string): Promise<MediaInfo> {
  const ext = path.extname(url.split('?')[0]).slice(1).toLowerCase() || 'jpg';
  const filename = path.basename(url.split('?')[0]) || 'image';

  // Try to get image size via HEAD request
  let filesize: number | null = null;
  try {
    filesize = await getContentLength(url);
  } catch {}

  return {
    title: filename,
    thumbnail: url,
    thumbnails: [{ url }],
    duration: 0,
    platform: detectPlatform(url),
    uploader: '',
    description: 'Direct image download',
    isImage: true,
    formats: [
      {
        id: 'original',
        ext: ext || 'jpg',
        quality: 'Original',
        filesize,
        type: 'image',
      },
    ],
    url,
  };
}

/**
 * Get content length from URL via HEAD request
 */
function getContentLength(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
      const len = parseInt(res.headers['content-length'] || '0', 10);
      resolve(len > 0 ? len : null);
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Download a direct URL (image or any file) to outputPath
 */
export function downloadDirect(
  url: string,
  outputPath: string,
  onProgress?: (progress: number, speed: string, eta: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(outputPath);
    let receivedBytes = 0;
    let totalBytes = 0;
    const startTime = Date.now();

    const request = client.get(url, { timeout: 30000 }, (res) => {
      // Handle redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(outputPath);
        downloadDirect(res.headers.location, outputPath, onProgress).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }

      totalBytes = parseInt(res.headers['content-length'] || '0', 10);

      res.pipe(file);
      res.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (onProgress && totalBytes > 0) {
          const progress = (receivedBytes / totalBytes) * 100;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? receivedBytes / elapsed : 0;
          const remaining = speed > 0 ? (totalBytes - receivedBytes) / speed : 0;
          onProgress(progress, formatSpeed(speed), formatEta(remaining));
        }
      });

      file.on('finish', () => {
        file.close();
        resolve(outputPath);
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(outputPath, () => {});
      reject(err);
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MiB/s`;
  if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(1)} KiB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Fetch media info from a URL using yt-dlp --dump-json
 */
export function fetchMediaInfo(url: string): Promise<MediaInfo> {
  // Handle direct image URLs
  if (isDirectImageUrl(url)) {
    return fetchDirectImageInfo(url);
  }

  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--skip-download',
      '--socket-timeout', '60',
      '--extractor-retries', '3',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      ...getCookieArgs(),
      url,
    ];

    console.log(`[yt-dlp] Info args: ${JSON.stringify(args)}`);
    const proc = spawn(YTDLP_BIN, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        // If yt-dlp fails, try as direct URL
        if (isDirectMediaUrl(url)) {
          fetchDirectMediaInfo(url).then(resolve).catch(reject);
          return;
        }
        reject(new Error(`yt-dlp info failed (code ${code}): ${stderr}`));
        return;
      }

      try {
        const raw = JSON.parse(stdout);
        const formats = parseFormats(raw.formats || []);

        // Extract thumbnail formats as image downloads
        const thumbnails = (raw.thumbnails || [])
          .filter((t: any) => t.url)
          .map((t: any) => ({
            url: t.url,
            width: t.width,
            height: t.height,
          }));

        // Add thumbnail as downloadable image format
        if (raw.thumbnail) {
          const thumbExt = raw.thumbnail.includes('.webp') ? 'webp'
            : raw.thumbnail.includes('.png') ? 'png' : 'jpg';

          formats.push({
            id: 'thumbnail',
            ext: thumbExt,
            quality: 'Thumbnail',
            filesize: null,
            type: 'image',
          });
        }

        resolve({
          title: raw.title || 'Unknown',
          thumbnail: raw.thumbnail || '',
          thumbnails,
          duration: raw.duration || 0,
          platform: detectPlatform(url),
          uploader: raw.uploader || raw.channel || '',
          description: (raw.description || '').substring(0, 300),
          formats,
          isImage: false,
          url,
        });
      } catch (e) {
        reject(new Error(`Failed to parse yt-dlp output: ${e}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}. Is yt-dlp installed?`));
    });
  });
}

/**
 * Fetch info for a direct media URL (no yt-dlp needed)
 */
async function fetchDirectMediaInfo(url: string): Promise<MediaInfo> {
  const ext = path.extname(url.split('?')[0]).slice(1).toLowerCase() || 'mp4';
  const filename = path.basename(url.split('?')[0]) || 'media';
  const isAudio = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac'].includes(ext);

  let filesize: number | null = null;
  try {
    filesize = await getContentLength(url);
  } catch {}

  return {
    title: filename,
    thumbnail: '',
    thumbnails: [],
    duration: 0,
    platform: detectPlatform(url),
    uploader: '',
    description: 'Direct media download',
    isImage: false,
    formats: [
      {
        id: 'direct',
        ext,
        quality: 'Original',
        filesize,
        type: isAudio ? 'audio' : 'video',
      },
    ],
    url,
  };
}

/**
 * Download media using yt-dlp
 */
export function downloadMedia(
  url: string,
  outputPath: string,
  options: {
    formatId?: string;
    audioOnly?: boolean;
    outputFormat?: string;
    audioQuality?: string;
    imageOnly?: boolean;
  },
  onProgress?: (progress: number, speed: string, eta: string) => void
): Promise<string> {
  // Handle thumbnail download
  if (options.formatId === 'thumbnail' || options.imageOnly) {
    return downloadThumbnail(url, outputPath, onProgress);
  }

  // Handle direct file downloads — use aria2c accelerator if available
  if (options.formatId === 'direct' || options.formatId === 'original') {
    if (isAria2cAvailable()) {
      const dir = path.dirname(outputPath);
      const filename = path.basename(outputPath);
      return downloadWithAria2c(url, dir, filename, {
        connections: 16,
        retries: 3,
      }, (progress, speed, eta) => {
        onProgress?.(progress, speed, eta);
      });
    }
    return downloadDirect(url, outputPath, onProgress);
  }

  return new Promise((resolve, reject) => {
    const args: string[] = [];

    if (options.audioOnly) {
      args.push('-f', 'bestaudio');
      args.push('--extract-audio');
      args.push('--audio-format', options.outputFormat || 'mp3');
      args.push('--audio-quality', options.audioQuality || '0');
    } else if (options.formatId) {
      if (FFMPEG_BIN) {
        // Try format+audio, fallback to just the format, then best
        args.push('-f', `${options.formatId}+bestaudio/${options.formatId}/best`);
        if (options.outputFormat) {
          args.push('--merge-output-format', options.outputFormat);
        }
      } else {
        // No ffmpeg — must use a combined format or just the requested one
        // 'best' usually picks the best combined format (often 720p)
        console.warn(`[yt-dlp] No ffmpeg — falling back to single-stream for ${options.formatId}`);
        args.push('-f', `${options.formatId}/best`);
      }
    } else {
      args.push('-f', 'best');
      if (options.outputFormat) {
        args.push('--merge-output-format', options.outputFormat);
      }
    }

    args.push('--output', outputPath);
    args.push('--newline');
    args.push('--no-playlist');
    args.push('--no-warnings');
    args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    args.push(...getCookieArgs());

    // ⚡ Use aria2c as external downloader for 16x speed
    const aria2cArgs = getYtdlpAria2cArgs();
    args.push(...aria2cArgs);

    args.push(url);

    const proc = spawn(YTDLP_BIN, args);
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      const match = line.match(/(\d+\.?\d*)%.*?at\s+([\d.]+\w+\/s).*?ETA\s+(\S+)/);
      if (match && onProgress) {
        onProgress(parseFloat(match[1]), match[2], match[3]);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp download failed (code ${code}): ${stderr}`));
        return;
      }
      resolve(outputPath);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Download thumbnail image using yt-dlp --write-thumbnail
 */
function downloadThumbnail(
  url: string,
  outputPath: string,
  onProgress?: (progress: number, speed: string, eta: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '--write-thumbnail',
      '--skip-download',
      '--convert-thumbnails', 'jpg',
      '--output', outputPath.replace(/\.[^.]+$/, ''),
      '--no-playlist',
      '--no-warnings',
      url,
    ];

    const proc = spawn(YTDLP_BIN, args);
    let stderr = '';

    proc.stdout.on('data', () => {
      onProgress?.(50, '...', '00:01');
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Thumbnail download failed (code ${code}): ${stderr}`));
        return;
      }

      // yt-dlp saves thumbnail with auto extension, find it
      const dir = path.dirname(outputPath);
      const base = path.basename(outputPath).replace(/\.[^.]+$/, '');
      const files = fs.readdirSync(dir).filter(f => f.startsWith(base));

      if (files.length > 0) {
        const thumbPath = path.join(dir, files[0]);
        onProgress?.(100, '--', '00:00');
        resolve(thumbPath);
      } else {
        reject(new Error('Thumbnail file not found after download'));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

function parseFormats(rawFormats: any[]): MediaFormat[] {
  const seen = new Set<string>();
  const formats: MediaFormat[] = [];

  for (const f of rawFormats) {
    const key = `${f.ext}-${f.height || f.abr || 'unknown'}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Detect type
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(f.ext);
    const isAudio = !isImage && !f.height && (f.acodec !== 'none' || f.vcodec === 'none');
    const type: 'video' | 'audio' | 'image' = isImage ? 'image' : isAudio ? 'audio' : 'video';

    formats.push({
      id: f.format_id || '',
      ext: f.ext || 'mp4',
      quality: isImage
        ? (f.width ? `${f.width}x${f.height}` : 'Original')
        : isAudio
          ? `${f.abr || 'unknown'}kbps`
          : `${f.height || 'unknown'}p`,
      filesize: f.filesize || f.filesize_approx || null,
      resolution: f.height ? `${f.width}x${f.height}` : undefined,
      vcodec: f.vcodec !== 'none' ? f.vcodec : undefined,
      acodec: f.acodec !== 'none' ? f.acodec : undefined,
      abr: f.abr || undefined,
      type,
      isCombined: f.vcodec !== 'none' && f.acodec !== 'none',
      directUrl: f.url || undefined, // CDN URL for direct download
    });
  }

  // Sort: video first, then audio, then image
  return formats.sort((a, b) => {
    const order = { video: 0, audio: 1, image: 2 };
    if (a.type !== b.type) return order[a.type] - order[b.type];
    const aVal = parseInt(a.quality) || 0;
    const bVal = parseInt(b.quality) || 0;
    return bVal - aVal;
  });
}

function detectPlatform(url: string): string {
  const platformMap: Record<string, string> = {
    'youtube.com': 'youtube',
    'youtu.be': 'youtube',
    'instagram.com': 'instagram',
    'tiktok.com': 'tiktok',
    'twitter.com': 'twitter',
    'x.com': 'twitter',
    'facebook.com': 'facebook',
    'reddit.com': 'reddit',
    'vimeo.com': 'vimeo',
    'soundcloud.com': 'soundcloud',
    'twitch.tv': 'twitch',
    'pinterest.com': 'pinterest',
    'flickr.com': 'flickr',
    'imgur.com': 'imgur',
    'unsplash.com': 'unsplash',
  };

  for (const [domain, platform] of Object.entries(platformMap)) {
    if (url.includes(domain)) return platform;
  }
  return 'other';
}
