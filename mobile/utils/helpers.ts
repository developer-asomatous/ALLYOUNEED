/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return 'Unknown';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format duration in seconds to mm:ss or hh:mm:ss
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mStr = h > 0 ? String(m).padStart(2, '0') : String(m);
  const sStr = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mStr}:${sStr}` : `${mStr}:${sStr}`;
}

/**
 * Detect platform from URL
 */
export function detectPlatform(url: string): string {
  // Magnet links / info hashes
  if (url.startsWith('magnet:?') || /^[a-fA-F0-9]{40}$/.test(url)) return 'torrent';
  if (url.toLowerCase().endsWith('.torrent')) return 'torrent';

  const map: Record<string, string> = {
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
  };

  for (const [domain, platform] of Object.entries(map)) {
    if (url.includes(domain)) return platform;
  }
  return 'other';
}

/**
 * Validate URL format (includes magnet links and info hashes)
 */
export function isValidUrl(url: string): boolean {
  // Magnet links
  if (url.startsWith('magnet:?')) return true;
  // 40-char hex info hash
  if (/^[a-fA-F0-9]{40}$/.test(url)) return true;
  // Standard URLs
  try {
    new URL(url);
    return /^https?:\/\/.+/.test(url);
  } catch {
    return false;
  }
}

/**
 * Get time ago string
 */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Known URL shorteners and redirect services */
const SHORTENER_DOMAINS = [
  'bit.ly', 'bitly.com', 'goo.gl', 't.co', 'tinyurl.com',
  'ow.ly', 'buff.ly', 'is.gd', 'v.gd', 'rb.gy',
  'cutt.ly', 'shorturl.at', 'tiny.cc', 'lnkd.in',
  'messycloud.ink', 'clk.ink', 'ouo.io', 'adf.ly',
  'shorte.st', 'linkvertise.com', 'shrink.pe',
];

/**
 * Check if a URL is from a known shortener/redirect service
 */
export function isShortenerUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return SHORTENER_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Result of scraping a page for download links.
 */
export interface ScrapedResult {
  /** If a social media URL was found (YouTube, Instagram etc.), use backend */
  mediaUrl?: string;
  /** Direct download links found on the page (CDN .mkv, .mp4 etc.) */
  directLinks: { url: string; filename: string; ext: string }[];
}

/** File extensions we can download directly */
const DIRECT_DOWNLOAD_EXTS = ['mkv', 'mp4', 'avi', 'webm', 'mov', 'flv', 'mp3', 'm4a', 'aac', 'flac', 'wav', 'zip', 'rar', '7z', 'iso', 'apk'];

/**
 * Resolve a shortened/redirect URL:
 * - Follows HTTP redirects
 * - Scrapes page for social media URLs → returns mediaUrl
 * - Scrapes page for direct download links → returns directLinks
 */
export async function resolveRedirectUrl(url: string): Promise<string> {
  const result = await scrapePageForLinks(url);
  // Return social media URL if found, otherwise return original
  return result.mediaUrl || url;
}

/**
 * Scrape a page for downloadable content.
 * Returns both social media URLs (for backend) and direct download links (for device).
 */
export async function scrapePageForLinks(url: string): Promise<ScrapedResult> {
  const result: ScrapedResult = { directLinks: [] };
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36',
      },
    });
    clearTimeout(timeoutId);
    
    // If we were redirected to a known media platform, use that
    if (response.url && response.url !== url && isKnownMediaPlatform(response.url)) {
      result.mediaUrl = extractMediaUrl(response.url);
      return result;
    }
    
    const body = await response.text().catch(() => '');
    
    // 1. Look for social media URLs (YouTube, Instagram, TikTok, etc.)
    const mediaPatterns = [
      /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch|shorts)|youtu\.be)\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>]+\/status\/[^\s"'<>]+/gi,
    ];
    
    for (const pattern of mediaPatterns) {
      const match = body.match(pattern);
      if (match && match[0]) {
        result.mediaUrl = match[0];
        return result; // Found a social media link — use backend
      }
    }
    
    // 2. Look for direct download links (CDN files)
    // Match href="...file.mkv?token=..." patterns
    const hrefPattern = /href=["']([^"']+\.(?:mkv|mp4|avi|webm|mov|mp3|m4a|aac|flac|zip|rar|7z|iso|apk)(?:\?[^"']*)?)["']/gi;
    let hrefMatch;
    const seenUrls = new Set<string>();
    
    while ((hrefMatch = hrefPattern.exec(body)) !== null) {
      const linkUrl = hrefMatch[1];
      if (seenUrls.has(linkUrl)) continue;
      seenUrls.add(linkUrl);
      
      const filename = extractFilename(linkUrl);
      const ext = filename.split('.').pop()?.toLowerCase() || 'mp4';
      
      if (DIRECT_DOWNLOAD_EXTS.includes(ext)) {
        result.directLinks.push({ url: linkUrl, filename, ext });
      }
    }
    
    // Also check meta refresh / JS redirect
    const metaMatch = body.match(/content=["'][^"']*url=([^"'\s>]+)/i);
    if (metaMatch && metaMatch[1] && isValidUrl(metaMatch[1])) {
      if (isKnownMediaPlatform(metaMatch[1])) {
        result.mediaUrl = metaMatch[1];
      }
    }
    
    const jsMatch = body.match(/(?:window\.location(?:\.href)?|location\.href)\s*=\s*["']([^"']+)/i);
    if (jsMatch && jsMatch[1] && isValidUrl(jsMatch[1])) {
      if (isKnownMediaPlatform(jsMatch[1])) {
        result.mediaUrl = jsMatch[1];
      }
    }
    
  } catch (err) {
    // Scraping failed — return empty result
  }
  
  return result;
}

function extractFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/');
    const last = segments[segments.length - 1];
    return decodeURIComponent(last) || 'download';
  } catch {
    const match = url.match(/([^/]+\.(?:mkv|mp4|avi|webm|mov|mp3|m4a|aac|flac|zip|rar|7z|iso|apk))/i);
    return match ? decodeURIComponent(match[1]) : 'download';
  }
}

function extractMediaUrl(url: string): string {
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'si', 'feature', 'igsh'].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url;
  }
}

function isKnownMediaPlatform(url: string): boolean {
  const platforms = ['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'facebook.com', 'reddit.com', 'vimeo.com', 'soundcloud.com', 'twitch.tv'];
  return platforms.some(p => url.includes(p));
}
