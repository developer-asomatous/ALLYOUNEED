import { API_BASE_URL } from '../constants/theme';
import { MediaInfo } from '../store/appStore';

/**
 * ═══════════════════════════════════════════════════
 *  AYN API Client v2 — Production Grade
 * ═══════════════════════════════════════════════════
 *
 *  Features:
 *  • Configurable timeout (default 15s for info, 30s for download)
 *  • Automatic retry with exponential backoff
 *  • AbortController support for cancellation
 *  • Structured error types
 *  • LRU media info cache
 */

// ── Error Types ──
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 0,
    public isTimeout: boolean = false,
    public isNetworkError: boolean = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── LRU Cache for media info ──
const CACHE_MAX_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to front (LRU behavior)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key: string, data: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest != null) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

const mediaInfoCache = new LRUCache<MediaInfo>(CACHE_MAX_SIZE, CACHE_TTL_MS);

// ── Core fetch with timeout + retry ──
async function resilientFetch(
  url: string,
  options: RequestInit & {
    timeoutMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
  } = {},
): Promise<Response> {
  const {
    timeoutMs = 15000,
    maxRetries = 2,
    retryDelayMs = 1000,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new ApiError(
          errBody.error || `HTTP ${res.status}`,
          res.status,
          false,
          false,
        );
      }

      return res;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        lastError = new ApiError('Request timed out', 0, true, false);
      } else if (err instanceof ApiError) {
        // Don't retry client errors (4xx)
        if (err.statusCode >= 400 && err.statusCode < 500) {
          throw err;
        }
        lastError = err;
      } else {
        lastError = new ApiError(
          err.message || 'Network error',
          0,
          false,
          true,
        );
      }

      // Exponential backoff before retry
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new ApiError('Request failed after retries');
}

// ── Public API ──

/**
 * Fetch media info from backend (with caching)
 */
export async function fetchInfo(url: string): Promise<MediaInfo> {
  // Check cache first
  const cached = mediaInfoCache.get(url);
  if (cached) return cached;

  const res = await resilientFetch(`${API_BASE_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    timeoutMs: 20000, // Media info can take longer
    maxRetries: 2,
  });

  const info: MediaInfo = await res.json();

  // Cache the result
  mediaInfoCache.set(url, info);

  return info;
}

/**
 * Start a download job
 */
export async function startDownload(params: {
  url: string;
  formatId?: string;
  outputFormat?: string;
  audioOnly?: boolean;
  audioQuality?: string;
  imageOnly?: boolean;
  fileIndex?: number; // For torrent file selection
}): Promise<{ jobId: string }> {
  const res = await resilientFetch(`${API_BASE_URL}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    timeoutMs: 30000,
    maxRetries: 1,
  });

  return res.json();
}

/**
 * Poll job status
 */
export async function getJobStatus(jobId: string): Promise<{
  status: string;
  progress: number;
  speed: string;
  eta: string;
  downloadUrl: string | null;
  error: string | null;
}> {
  const res = await resilientFetch(`${API_BASE_URL}/status/${jobId}`, {
    timeoutMs: 10000,
    maxRetries: 1,
    retryDelayMs: 500,
  });

  return res.json();
}

/**
 * Get stream URL for completed download
 */
export function getStreamUrl(jobId: string): string {
  return `${API_BASE_URL}/stream/${jobId}`;
}

/**
 * Cancel / cleanup a job
 */
export async function cancelJob(jobId: string): Promise<void> {
  try {
    await resilientFetch(`${API_BASE_URL}/job/${jobId}`, {
      method: 'DELETE',
      timeoutMs: 5000,
      maxRetries: 0,
    });
  } catch {
    // Best-effort cancel
  }
}

/**
 * Clear the media info cache
 */
export function clearMediaInfoCache(): void {
  mediaInfoCache.clear();
}
