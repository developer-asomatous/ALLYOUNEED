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
 * Stubbed — torrent support disabled in production for now
 */
export async function fetchTorrentInfo(magnetOrUrl: string): Promise<TorrentInfo> {
  throw new Error('Torrent downloads are coming soon! This feature is under development.');
}

export async function downloadTorrentFile(
  magnetOrUrl: string,
  fileIndex: number,
  outputDir: string,
  onProgress?: (progress: number, speed: string, eta: string) => void,
): Promise<string> {
  throw new Error('Torrent downloads are coming soon! This feature is under development.');
}
