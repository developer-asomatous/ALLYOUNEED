import path from 'path';
import fs from 'fs';

/**
 * AYN Torrent Engine — Stubbed for production deployment.
 * WebTorrent is ESM-only and incompatible with CJS builds.
 * Torrent support will be re-enabled when we migrate to ESM.
 */

const STORAGE_PATH = process.env.STORAGE_PATH || '/tmp/ayn-downloads';

// ── Detection helpers ──

export function isMagnetLink(url: string): boolean {
  return url.startsWith('magnet:');
}

export function isTorrentUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return lower.endsWith('.torrent');
}

export function isInfoHash(input: string): boolean {
  return /^[a-fA-F0-9]{40}$/.test(input) || /^[a-zA-Z2-7]{32}$/.test(input);
}

export function isTorrentInput(url: string): boolean {
  return isMagnetLink(url) || isTorrentUrl(url) || isInfoHash(url);
}

// ── Types ──

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
 * Fetch info for a magnet link or infohash
 */
export async function fetchTorrentInfo(magnetOrUrl: string): Promise<TorrentInfo> {
  const isMag = isMagnetLink(magnetOrUrl);
  const infoHash = isMag 
    ? (magnetOrUrl.match(/btih:([a-zA-Z0-9]+)/)?.[1] || 'unknown')
    : magnetOrUrl;
  
  const name = isMag 
    ? decodeURIComponent(magnetOrUrl.match(/dn=([^&]+)/)?.[1] || 'Torrent Movie').replace(/\+/g, ' ')
    : 'Torrent Download';

  return {
    title: name,
    thumbnail: '',
    thumbnails: [],
    duration: 0,
    platform: 'torrent',
    uploader: 'P2P',
    description: isMag ? 'Magnet link metadata' : 'Torrent infohash',
    isTorrent: true,
    infoHash,
    url: magnetOrUrl,
    isImage: false,
    totalSize: 0,
    files: [
      { name: 'Full Torrent', size: 0, path: name, index: 0 }
    ],
    formats: [
      {
        id: 'torrent-0',
        ext: 'mkv',
        quality: 'Torrent',
        filesize: null,
        type: 'video'
      }
    ]
  };
}

/**
 * Download a torrent/magnet using aria2c
 */
export async function downloadTorrentFile(
  magnetOrUrl: string,
  fileIndex: number,
  outputDir: string,
  onProgress?: (progress: number, speed: string, eta: string) => void,
): Promise<string> {
  // aria2c is already imported/configured in accelerator.ts
  const { ARIA2C_BIN } = require('./accelerator');
  const { spawn } = require('child_process');

  if (!ARIA2C_BIN) {
    throw new Error('Torrent engine (aria2c) not found on server. Please install aria2.');
  }

  return new Promise((resolve, reject) => {
    const args = [
      '--dir', outputDir,
      '--seed-time', '0', // Stop seeding immediately after download
      '--summary-interval', '1',
      magnetOrUrl
    ];

    const proc = spawn(ARIA2C_BIN, args);
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      const line = data.toString();
      const match = line.match(/\((.*?)%\)\s+DL:(.*?)\s+ETA:(.*)/);
      if (match && onProgress) {
        const progress = parseFloat(match[1]);
        onProgress(progress, match[2], match[3]);
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number) => {
      if (code === 0) {
        // Find the downloaded file in outputDir
        const files = fs.readdirSync(outputDir);
        if (files.length > 0) {
          resolve(path.join(outputDir, files[0]));
        } else {
          reject(new Error('Torrent downloaded but file not found in output directory'));
        }
      } else {
        reject(new Error(`aria2c torrent download failed (code ${code}): ${stderr}`));
      }
    });
  });
}
