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
