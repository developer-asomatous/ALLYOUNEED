import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MediaFormat {
  id: string;
  ext: string;
  quality: string;
  filesize: number | null;
  resolution?: string;
  type: 'video' | 'audio' | 'image';
}

export interface MediaInfo {
  title: string;
  thumbnail: string;
  thumbnails?: { url: string; width?: number; height?: number }[];
  duration: number;
  platform: string;
  uploader: string;
  description: string;
  formats: MediaFormat[];
  url: string;
  isImage?: boolean;
  // Torrent-specific
  isTorrent?: boolean;
  files?: { name: string; size: number; path: string; index: number }[];
  totalSize?: number;
  infoHash?: string;
}

export interface DownloadJob {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  platform: string;
  status: 'queued' | 'fetching' | 'downloading' | 'processing' | 'done' | 'failed';
  progress: number;
  speed: string;
  eta: string;
  localUri?: string;
  format?: string;
  quality?: string;
  fileSize?: number;
  error?: string;
  createdAt: number;
  /** Resume position for video player (ms) */
  lastPlaybackPosition?: number;
}

interface AppState {
  // Current URL input
  inputUrl: string;
  setInputUrl: (url: string) => void;

  // Media info
  mediaInfo: MediaInfo | null;
  isFetchingInfo: boolean;
  setMediaInfo: (info: MediaInfo | null) => void;
  setFetchingInfo: (fetching: boolean) => void;

  // Format selection
  selectedFormat: MediaFormat | null;
  mediaType: 'video' | 'audio' | 'image';
  setSelectedFormat: (format: MediaFormat | null) => void;
  setMediaType: (type: 'video' | 'audio' | 'image') => void;

  // Downloads (persisted)
  downloads: DownloadJob[];
  addDownload: (job: DownloadJob) => void;
  updateDownload: (id: string, updates: Partial<DownloadJob>) => void;
  removeDownload: (id: string) => void;
  clearCompleted: () => void;

  // Settings (persisted)
  defaultQuality: string;
  defaultFormat: string;
  autoClipboard: boolean;
  notificationsEnabled: boolean;
  setDefaultQuality: (quality: string) => void;
  setDefaultFormat: (format: string) => void;
  setAutoClipboard: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;

  // UI State
  showFormatPicker: boolean;
  setShowFormatPicker: (show: boolean) => void;

  // Reset
  resetMediaState: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // URL
      inputUrl: '',
      setInputUrl: (url) => set({ inputUrl: url }),

      // Media info (NOT persisted — see partialize below)
      mediaInfo: null,
      isFetchingInfo: false,
      setMediaInfo: (info) => set({ mediaInfo: info }),
      setFetchingInfo: (fetching) => set({ isFetchingInfo: fetching }),

      // Format selection (NOT persisted)
      selectedFormat: null,
      mediaType: 'video' as const,
      setSelectedFormat: (format) => set({ selectedFormat: format }),
      setMediaType: (mediaType) => set({ mediaType }),

      // Downloads
      downloads: [],
      addDownload: (job) => set((s) => ({ downloads: [job, ...s.downloads] })),
      updateDownload: (id, updates) =>
        set((s) => ({
          downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        })),
      removeDownload: (id) => set((s) => ({ downloads: s.downloads.filter((d) => d.id !== id) })),
      clearCompleted: () =>
        set((s) => ({ downloads: s.downloads.filter((d) => d.status !== 'done') })),

      // Settings
      defaultQuality: '1080p',
      defaultFormat: 'mp4',
      autoClipboard: true,
      notificationsEnabled: true,
      setDefaultQuality: (quality) => set({ defaultQuality: quality }),
      setDefaultFormat: (format) => set({ defaultFormat: format }),
      setAutoClipboard: (enabled) => set({ autoClipboard: enabled }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),

      // UI
      showFormatPicker: false,
      setShowFormatPicker: (show) => set({ showFormatPicker: show }),

      // Reset
      resetMediaState: () =>
        set({
          mediaInfo: null,
          selectedFormat: null,
          mediaType: 'video' as const,
          showFormatPicker: false,
          inputUrl: '',
        }),
    }),
    {
      name: 'ayn-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist downloads + settings, NOT transient UI state
      partialize: (state) => ({
        downloads: state.downloads,
        defaultQuality: state.defaultQuality,
        defaultFormat: state.defaultFormat,
        autoClipboard: state.autoClipboard,
        notificationsEnabled: state.notificationsEnabled,
      }),
      // On rehydrate, reset any stuck "downloading" states to "failed"
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.downloads = state.downloads.map((d) => {
            if (['downloading', 'fetching', 'processing', 'queued'].includes(d.status)) {
              return { ...d, status: 'failed', error: 'App was closed during download' } as DownloadJob;
            }
            return d;
          });
        }
      },
    },
  ),
);
