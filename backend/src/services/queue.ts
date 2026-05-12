import { downloadMedia, downloadDirect } from './ytdlp';
import { isTorrentInput, downloadTorrentFile } from './torrent';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const STORAGE_PATH = process.env.STORAGE_PATH || '/tmp/ayn-downloads';

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

// In-memory job state — works without Redis
const jobStates = new Map<string, {
  status: 'queued' | 'downloading' | 'processing' | 'done' | 'failed';
  progress: number;
  speed: string;
  eta: string;
  downloadUrl: string | null;
  filePath: string | null;
  error: string | null;
  createdAt: number;
}>();

// Simple concurrent download limiter
let activeJobs = 0;
const MAX_CONCURRENT = 3;
const pendingQueue: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (activeJobs < MAX_CONCURRENT) {
    activeJobs++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    pendingQueue.push(() => { activeJobs++; resolve(); });
  });
}

function releaseSlot() {
  activeJobs--;
  const next = pendingQueue.shift();
  if (next) next();
}

/**
 * Create a download job (no Redis required)
 */
export async function createDownloadJob(params: {
  url: string;
  formatId?: string;
  outputFormat?: string;
  audioOnly?: boolean;
  audioQuality?: string;
  imageOnly?: boolean;
  fileIndex?: number; // For torrent file selection
}): Promise<{ jobId: string }> {
  const jobId = uuidv4().slice(0, 12);

  jobStates.set(jobId, {
    status: 'queued',
    progress: 0,
    speed: '0 B/s',
    eta: '--:--',
    downloadUrl: null,
    filePath: null,
    error: null,
    createdAt: Date.now(),
  });

  // Process in background
  processJob(jobId, params).catch((err) => {
    console.error(`Job ${jobId} error:`, err.message);
  });

  return { jobId };
}

/**
 * Process a download job
 */
async function processJob(jobId: string, params: {
  url: string;
  formatId?: string;
  outputFormat?: string;
  audioOnly?: boolean;
  audioQuality?: string;
  imageOnly?: boolean;
  fileIndex?: number;
}) {
  const { url, formatId, outputFormat, audioOnly, audioQuality, imageOnly, fileIndex } = params;
  const state = jobStates.get(jobId);
  if (!state) return;

  await acquireSlot();

  try {
    state.status = 'downloading';

    // Determine file extension
    let ext: string;
    if (imageOnly || formatId === 'thumbnail') {
      ext = outputFormat || 'jpg';
    } else if (formatId === 'direct' || formatId === 'original') {
      ext = outputFormat || path.extname(url.split('?')[0]).slice(1) || 'bin';
    } else if (audioOnly) {
      ext = outputFormat || 'mp3';
    } else {
      ext = outputFormat || 'mp4';
    }

    const filename = `${jobId}.${ext}`;
    const outputPath = path.join(STORAGE_PATH, filename);

    // Determine download method
    let resultPath: string;

    // ── Torrent / Magnet downloads ──
    const isMagnetFormat = formatId && formatId.startsWith('magnet:');
    if (isTorrentInput(url) || isMagnetFormat || (formatId && formatId.startsWith('torrent-file-'))) {
      const torrentFileIndex = fileIndex ?? (formatId && formatId.startsWith('torrent-file-') ? parseInt(formatId.replace('torrent-file-', ''), 10) : 0);
      const torrentSource = isMagnetFormat ? formatId : url;
      
      resultPath = await downloadTorrentFile(torrentSource, torrentFileIndex, STORAGE_PATH, (progress, speed, eta) => {
        state.progress = progress;
        state.speed = speed;
        state.eta = eta;
      });
    }
    // ── Direct file downloads ──
    else if (formatId === 'direct' || formatId === 'original') {
      resultPath = await downloadDirect(url, outputPath, (progress, speed, eta) => {
        state.progress = progress;
        state.speed = speed;
        state.eta = eta;
      });
    }
    // ── yt-dlp downloads ──
    else {
      resultPath = await downloadMedia(url, outputPath, {
        formatId,
        audioOnly,
        outputFormat,
        audioQuality,
        imageOnly,
      }, (progress, speed, eta) => {
        state.progress = progress;
        state.speed = speed;
        state.eta = eta;
      });
    }

    state.status = 'done';
    state.progress = 100;
    state.filePath = resultPath;
    state.downloadUrl = `/v1/stream/${jobId}`;
    console.log(`✅ Job ${jobId} completed: ${resultPath}`);
  } catch (err: any) {
    state.status = 'failed';
    state.error = err.message || 'Download failed';
    console.error(`❌ Job ${jobId} failed:`, err.message);
  } finally {
    releaseSlot();
  }
}

/**
 * Get job status
 */
export function getJobStatus(jobId: string) {
  return jobStates.get(jobId) || null;
}

/**
 * Remove a job and its file
 */
export function removeJob(jobId: string) {
  const state = jobStates.get(jobId);
  if (state?.filePath && fs.existsSync(state.filePath)) {
    fs.unlinkSync(state.filePath);
  }
  jobStates.delete(jobId);
}

// Cleanup old files every 10 minutes
setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [jobId, state] of jobStates.entries()) {
    if (state.status === 'done' && state.createdAt < tenMinutesAgo) {
      removeJob(jobId);
    }
  }
}, 5 * 60 * 1000);
