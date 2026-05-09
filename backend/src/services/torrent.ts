import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Torrent Engine — WebTorrent-powered
 * ═══════════════════════════════════════════════════
 *
 *  Supports:
 *  • Magnet links (magnet:?xt=...)
 *  • .torrent file URLs (http://.../*.torrent)
 *  • Info hashes (40-char hex or 32-char base32)
 *  • File selection (pick the largest or specific file)
 *  • Real-time progress with peers/speed/ETA
 *  • Auto-cleanup after download
 */

const STORAGE_PATH = process.env.STORAGE_PATH || '/tmp/ayn-downloads';

/**
 * High-availability public trackers for faster peer discovery.
 * More trackers = more peers = faster downloads.
 */
const TRACKER_LIST = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://tracker.bitsearch.to:1337/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker1.bt.moack.co.kr:80/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://tracker.pomf.se:80/announce',
  'udp://tracker.monitorit4.me:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://tracker.altrosky.nl:6969/announce',
  'udp://tracker-udp.gbitt.info:80/announce',
  'udp://retracker.lanta-net.ru:2710/announce',
  'udp://opentracker.i2p.rocks:6969/announce',
];

// Singleton WebTorrent client — reused across all jobs
let client: WebTorrent.Instance | null = null;

function getClient(): WebTorrent.Instance {
  if (!client) {
    client = new WebTorrent({
      maxConns: 200,          // Increased from 80 for more peers
      tracker: {
        announce: TRACKER_LIST,
      },
    });

    client.on('error', (err: string | Error) => {
      console.error('[Torrent] Client error:', typeof err === 'string' ? err : err.message);
    });

    console.log(`✅ WebTorrent initialized (${TRACKER_LIST.length} trackers, 200 max connections)`);
  }
  return client;
}

/**
 * Inject trackers into magnet links that don't have them.
 * Many magnet links are bare (just xt=urn:btih:HASH) — adding
 * tracker announce URLs dramatically speeds up peer discovery.
 */
function enrichMagnet(magnetUri: string): string {
  if (!magnetUri.startsWith('magnet:')) return magnetUri;

  // Count existing trackers
  const existingTrackers = (magnetUri.match(/&tr=/g) || []).length;

  // If fewer than 5 trackers, append our list
  if (existingTrackers < 5) {
    const trackerParams = TRACKER_LIST
      .map((t) => `&tr=${encodeURIComponent(t)}`)
      .join('');
    return magnetUri + trackerParams;
  }

  return magnetUri;
}

// ── Detection helpers ──

export function isMagnetLink(url: string): boolean {
  return url.startsWith('magnet:');
}

export function isTorrentUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return lower.endsWith('.torrent');
}

export function isInfoHash(input: string): boolean {
  // 40-char hex or 32-char base32
  return /^[a-fA-F0-9]{40}$/.test(input) || /^[a-zA-Z2-7]{32}$/.test(input);
}

export function isTorrentInput(url: string): boolean {
  return isMagnetLink(url) || isTorrentUrl(url) || isInfoHash(url);
}

// ── Torrent info ──

export interface TorrentFileInfo {
  name: string;
  size: number;
  path: string;
  index: number;
}

export interface TorrentInfo {
  title: string;
  thumbnail: string;
  thumbnails: { url: string }[];
  duration: number;
  platform: string;
  uploader: string;
  description: string;
  formats: {
    id: string;
    ext: string;
    quality: string;
    filesize: number | null;
    type: 'video' | 'audio' | 'image';
  }[];
  url: string;
  isImage: boolean;
  isTorrent: boolean;
  files: TorrentFileInfo[];
  totalSize: number;
  infoHash: string;
}

/**
 * Fetch torrent metadata (files, sizes) without downloading content
 */
export function fetchTorrentInfo(magnetOrUrl: string): Promise<TorrentInfo> {
  return new Promise((resolve, reject) => {
    const wt = getClient();
    const timeout = setTimeout(() => {
      reject(new Error('Torrent metadata fetch timed out (30s). Check the magnet link.'));
    }, 30000);

    // Convert bare info hash to magnet and enrich with trackers
    let input = magnetOrUrl;
    if (isInfoHash(magnetOrUrl)) {
      input = `magnet:?xt=urn:btih:${magnetOrUrl}`;
    }
    input = enrichMagnet(input);

    try {
      wt.add(input, { path: STORAGE_PATH, destroyStoreOnDestroy: true }, (torrent) => {
        clearTimeout(timeout);

        const files: TorrentFileInfo[] = torrent.files.map((f, i) => ({
          name: f.name,
          size: f.length,
          path: f.path,
          index: i,
        }));

        // Sort by size descending (largest = likely the main content)
        files.sort((a, b) => b.size - a.size);

        // Build format list from torrent files
        const formats = files.map((f, idx) => {
          const ext = path.extname(f.name).slice(1).toLowerCase() || 'bin';
          const isVideo = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'ts', 'm4v'].includes(ext);
          const isAudio = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'wma', 'opus'].includes(ext);
          const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext);

          return {
            id: `torrent-file-${f.index}`,
            ext,
            quality: isVideo
              ? `File ${idx + 1} • ${formatSize(f.size)}`
              : isAudio
              ? `${ext.toUpperCase()} • ${formatSize(f.size)}`
              : `${formatSize(f.size)}`,
            filesize: f.size,
            type: (isVideo ? 'video' : isAudio ? 'audio' : isImg ? 'image' : 'video') as 'video' | 'audio' | 'image',
          };
        });

        // Remove the torrent so we're not seeding/downloading yet
        torrent.destroy({ destroyStore: true });

        const mainFile = files[0];
        const title = torrent.name || mainFile?.name || 'Unknown Torrent';

        resolve({
          title,
          thumbnail: '',
          thumbnails: [],
          duration: 0,
          platform: 'torrent',
          uploader: '',
          description: `${files.length} file${files.length !== 1 ? 's' : ''} • ${formatSize(torrent.length)}`,
          formats,
          url: magnetOrUrl,
          isImage: false,
          isTorrent: true,
          files,
          totalSize: torrent.length,
          infoHash: torrent.infoHash,
        });
      });
    } catch (err: any) {
      clearTimeout(timeout);
      reject(new Error(`Torrent error: ${err.message}`));
    }
  });
}

/**
 * Download a specific file from a torrent
 */
export function downloadTorrentFile(
  magnetOrUrl: string,
  fileIndex: number,
  outputDir: string,
  onProgress?: (progress: number, speed: string, eta: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const wt = getClient();

    // Timeout for metadata + start
    const metaTimeout = setTimeout(() => {
      reject(new Error('Torrent metadata timeout (60s)'));
    }, 60000);

    let input = magnetOrUrl;
    if (isInfoHash(magnetOrUrl)) {
      input = `magnet:?xt=urn:btih:${magnetOrUrl}`;
    }
    input = enrichMagnet(input);

    try {
      wt.add(input, { path: outputDir }, (torrent) => {
        clearTimeout(metaTimeout);

        // Select only the requested file; deselect all others
        torrent.files.forEach((f, i) => {
          if (i !== fileIndex) {
            f.deselect();
          }
        });

        const targetFile = torrent.files[fileIndex];
        if (!targetFile) {
          torrent.destroy();
          reject(new Error(`File index ${fileIndex} not found in torrent`));
          return;
        }

        targetFile.select();

        console.log(`[Torrent] Downloading: ${targetFile.name} (${formatSize(targetFile.length)})`);

        // Progress reporting
        const progressInterval = setInterval(() => {
          const dl = torrent.downloaded;
          const total = targetFile.length;
          const pct = total > 0 ? (dl / total) * 100 : 0;
          const speed = torrent.downloadSpeed;
          const remaining = speed > 0 ? (total - dl) / speed : 0;

          const peers = `${torrent.numPeers} peer${torrent.numPeers !== 1 ? 's' : ''}`;

          onProgress?.(
            Math.min(pct, 99.9),
            `${formatSpeed(speed)} • ${peers}`,
            formatEta(remaining),
          );
        }, 1000);

        let completed = false;

        torrent.on('done', () => {
          completed = true;
          clearInterval(progressInterval);
          onProgress?.(100, '0 B/s', '00:00');

          const filePath = path.join(outputDir, targetFile.path);

          // Verify file exists
          if (fs.existsSync(filePath)) {
            console.log(`✅ Torrent download complete: ${filePath}`);
            torrent.destroy({ destroyStore: false }); // Keep the file!
            resolve(filePath);
          } else {
            torrent.destroy();
            reject(new Error('Downloaded file not found on disk'));
          }
        });

        // Overall timeout: 2 hours
        setTimeout(() => {
          if (!completed) {
            clearInterval(progressInterval);
            torrent.destroy();
            reject(new Error('Torrent download timed out (2 hours)'));
          }
        }, 2 * 60 * 60 * 1000);
      });
    } catch (err: any) {
      clearTimeout(metaTimeout);
      reject(new Error(`Torrent error: ${err.message}`));
    }
  });
}

// ── Formatting helpers ──

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--:--';
  if (seconds > 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
