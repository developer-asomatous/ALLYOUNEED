import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUsageStore, MAX_CONCURRENT_DEFAULT, MAX_CONCURRENT_BOOSTED } from '../store/usageStore';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Download Queue Manager
 * ═══════════════════════════════════════════════════
 *
 *  Handles:
 *  • Concurrent download limiting (max 3, or 4 with boost)
 *  • Download queue with priority
 *  • Retry failed downloads
 *  • Offline queuing
 *  • Cleanup of stale polling timers
 */

const MAX_CONCURRENT_DOWNLOADS = 3; // Default, can be boosted to 4

/** Get the current max concurrent downloads (3 default, 4 if boosted) */
function getDynamicMaxConcurrent(): number {
  try {
    return useUsageStore.getState().getMaxConcurrent();
  } catch {
    return MAX_CONCURRENT_DEFAULT;
  }
}

export interface QueuedDownload {
  id: string;
  url: string;
  formatId: string;
  outputFormat: string;
  audioOnly: boolean;
  imageOnly: boolean;
  priority: number; // lower = higher priority
  createdAt: number;
  retryCount: number;
}

interface DownloadQueueState {
  queue: QueuedDownload[];
  activeIds: string[];
  maxConcurrent: number;

  // Actions
  enqueue: (item: Omit<QueuedDownload, 'priority' | 'createdAt' | 'retryCount'>) => void;
  dequeue: () => QueuedDownload | null;
  markActive: (id: string) => void;
  markComplete: (id: string) => void;
  markFailed: (id: string) => void;
  removeFromQueue: (id: string) => void;
  getQueueLength: () => number;
  canStartNew: () => boolean;
  clearQueue: () => void;
}

export const useDownloadQueue = create<DownloadQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      activeIds: [],
      maxConcurrent: MAX_CONCURRENT_DOWNLOADS,

      enqueue: (item) => {
        set((s) => ({
          queue: [
            ...s.queue,
            {
              ...item,
              priority: s.queue.length,
              createdAt: Date.now(),
              retryCount: 0,
            },
          ],
        }));
      },

      dequeue: () => {
        const state = get();
        if (state.queue.length === 0) return null;
        // Dynamic max: check if extra slot is active
        const dynamicMax = getDynamicMaxConcurrent();
        if (state.activeIds.length >= dynamicMax) return null;

        const next = state.queue[0];
        set((s) => ({
          queue: s.queue.slice(1),
          activeIds: [...s.activeIds, next.id],
        }));
        return next;
      },

      markActive: (id) => {
        set((s) => ({
          activeIds: s.activeIds.includes(id) ? s.activeIds : [...s.activeIds, id],
        }));
      },

      markComplete: (id) => {
        set((s) => ({
          activeIds: s.activeIds.filter((x) => x !== id),
        }));
      },

      markFailed: (id) => {
        set((s) => {
          const item = s.queue.find((q) => q.id === id);
          const newActive = s.activeIds.filter((x) => x !== id);

          // Re-queue with retry if under limit
          if (item && item.retryCount < 3) {
            return {
              activeIds: newActive,
              queue: [...s.queue, { ...item, retryCount: item.retryCount + 1 }],
            };
          }

          return { activeIds: newActive };
        });
      },

      removeFromQueue: (id) => {
        set((s) => ({
          queue: s.queue.filter((q) => q.id !== id),
          activeIds: s.activeIds.filter((x) => x !== id),
        }));
      },

      getQueueLength: () => get().queue.length,

      canStartNew: () => {
        const state = get();
        const dynamicMax = getDynamicMaxConcurrent();
        return state.activeIds.length < dynamicMax;
      },

      clearQueue: () => set({ queue: [], activeIds: [] }),
    }),
    {
      name: 'ayn-download-queue',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

// ── Polling Timer Registry ──
// Prevents timer leaks by tracking all active polling intervals

const activePollers = new Map<string, ReturnType<typeof setInterval>>();

export function registerPoller(jobId: string, interval: ReturnType<typeof setInterval>): void {
  // Clear any existing poller for this job
  const existing = activePollers.get(jobId);
  if (existing) clearInterval(existing);
  activePollers.set(jobId, interval);
}

export function clearPoller(jobId: string): void {
  const interval = activePollers.get(jobId);
  if (interval) {
    clearInterval(interval);
    activePollers.delete(jobId);
  }
}

export function clearAllPollers(): void {
  activePollers.forEach((interval) => clearInterval(interval));
  activePollers.clear();
}

export function getActivePollerCount(): number {
  return activePollers.size;
}
