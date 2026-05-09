/**
 * Parse yt-dlp progress line
 * Example: [download]  67.4% of 42.93MiB at  4.23MiB/s ETA 00:08
 */
export function parseProgress(line: string): {
  progress: number;
  speed: string;
  eta: string;
} | null {
  const match = line.match(/(\d+\.?\d*)%.*?at\s+([\d.]+\w+\/s).*?ETA\s+(\S+)/);
  if (!match) return null;

  return {
    progress: parseFloat(match[1]),
    speed: match[2],
    eta: match[3],
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Sanitize a filename
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}
