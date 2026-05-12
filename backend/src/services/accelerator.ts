import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Accelerated Download Engine — aria2c
 * ═══════════════════════════════════════════════════
 *
 *  Why this is 5-16x faster than single HTTP:
 *
 *  ┌──────────────────────────────────────────────────┐
 *  │  BEFORE (single connection):                     │
 *  │  [========================================] 2MB/s│
 *  │                                                  │
 *  │  AFTER (16 parallel connections via aria2c):     │
 *  │  [====] segment 1                                │
 *  │  [====] segment 2                                │
 *  │  [====] segment 3                                │
 *  │  ...16 segments = 16x throughput potential       │
 *  │  [========================================] 30MB/s│
 *  └──────────────────────────────────────────────────┘
 *
 *  How it works:
 *  - aria2c requests the file with HTTP Range headers
 *  - Each connection fetches a different byte-range
 *  - Segments are merged into one file automatically
 *  - If a connection stalls, others compensate
 *  - Resume support built-in (partial downloads survive crashes)
 */

// ── Detect aria2c ──
const ARIA2C_PATHS = [
  '/opt/homebrew/bin/aria2c',
  '/usr/local/bin/aria2c',
  '/usr/bin/aria2c',
  'aria2c',
];

export let ARIA2C_BIN: string | null = null;

function detectAria2c(): string | null {
  for (const p of ARIA2C_PATHS) {
    try {
      execSync(`${p} --version`, { timeout: 3000, stdio: 'pipe' });
      return p;
    } catch {}
  }
  return null;
}

try {
  ARIA2C_BIN = detectAria2c();
  if (ARIA2C_BIN) {
    console.log(`⚡ aria2c found at: ${ARIA2C_BIN} (multi-connection downloads enabled)`);
  } else {
    console.log('ℹ️  aria2c not found — using single-connection fallback');
    console.log('   Install for 5-16x faster downloads: brew install aria2');
  }
} catch {}

export function isAria2cAvailable(): boolean {
  return ARIA2C_BIN !== null;
}

/**
 * Download a URL using aria2c with multiple parallel connections.
 *
 * @param connections  Number of parallel connections (1-16)
 * @param splitSize    Min size per segment before splitting (default 1MB)
 */
export function downloadWithAria2c(
  url: string,
  outputDir: string,
  outputFilename: string,
  options: {
    connections?: number;
    splitSize?: string; // e.g., '1M'
    timeout?: number;
    retries?: number;
    headers?: Record<string, string>;
    referer?: string;
  } = {},
  onProgress?: (progress: number, speed: string, eta: string, connections: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ARIA2C_BIN) {
      reject(new Error('aria2c not available'));
      return;
    }

    const {
      connections = 16,
      splitSize = '1M',
      timeout = 60,
      retries = 5,
      headers = {},
      referer,
    } = options;

    const outputPath = path.join(outputDir, outputFilename);

    const args: string[] = [
      // Multi-connection settings
      '-x', String(connections),              // Max connections per server
      '-s', String(connections),              // Split file into N segments
      '-k', splitSize,                        // Min split size

      // Output
      '-d', outputDir,
      '-o', outputFilename,

      // Performance
      '--stream-piece-selector=inorder',       // Download in order for streaming
      '--file-allocation=none',                // Compatible with all filesystems
      '--auto-file-renaming=false',            // Don't rename
      '--allow-overwrite=true',

      // Reliability
      '--max-tries', String(retries),
      '--retry-wait', '2',                     // Wait 2s between retries
      '--timeout', String(timeout),
      '--connect-timeout', '10',
      '--max-file-not-found', '3',

      // Resume support
      '--continue=true',                       // Resume partial downloads

      // Reduce console noise, output progress in machine-readable format
      '--summary-interval=1',
      '--console-log-level=warn',
      '--download-result=hide',
      '--human-readable=true',

      // Progress format
      '--show-console-readout=true',
    ];

    // Add custom headers
    for (const [key, value] of Object.entries(headers)) {
      args.push('--header', `${key}: ${value}`);
    }

    // Referer
    if (referer) {
      args.push('--referer', referer);
    }

    // URL last
    args.push(url);

    const proc = spawn(ARIA2C_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString();

      // Parse aria2c progress output
      // Format: [#hash SIZE/TOTAL(PCT%) CN:N DL:SPEED ETA:TIME]
      const match = line.match(
        /\((\d+)%\)\s*CN:(\d+)\s*DL:([^\s]+)\s*ETA:([^\s\]]+)/
      );
      if (match && onProgress) {
        onProgress(
          parseInt(match[1], 10),
          match[3],
          match[4],
          parseInt(match[2], 10),
        );
      }

      // Also try percentage-only format
      const pctMatch = line.match(/(\d+)%/);
      if (!match && pctMatch && onProgress) {
        onProgress(parseInt(pctMatch[1], 10), '...', '--:--', connections);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`aria2c failed (code ${code}): ${stderr.slice(0, 200)}`));
        return;
      }

      if (!fs.existsSync(outputPath)) {
        reject(new Error('aria2c completed but output file not found'));
        return;
      }

      onProgress?.(100, '0 B/s', '00:00', 0);
      resolve(outputPath);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn aria2c: ${err.message}`));
    });
  });
}

/**
 * Get aria2c flags for yt-dlp --downloader aria2c integration.
 *
 * yt-dlp supports using aria2c as external downloader, which gives
 * multi-connection downloads for platform video/audio segments too.
 */
export function getYtdlpAria2cArgs(): string[] {
  // Disabled: yt-dlp 2026.x mangles aria2c args causing download failures.
  // aria2c is still used for direct file downloads (non-yt-dlp).
  // yt-dlp's built-in downloader handles YouTube/Instagram etc. fine.
  return [];
}
