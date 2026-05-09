import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * ═══════════════════════════════════════════════════
 *  Network Connectivity Monitor
 * ═══════════════════════════════════════════════════
 *
 * Provides real-time network status with:
 *  • Connection type detection (wifi/cellular/none)
 *  • Online/offline state
 *  • Auto-reconnect callbacks
 *  • Debounced status to avoid flicker
 */

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string;
  isWifi: boolean;
  isCellular: boolean;
}

const DEBOUNCE_MS = 300; // Debounce rapid connectivity changes

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    connectionType: 'unknown',
    isWifi: false,
    isCellular: false,
  });

  const reconnectCallbacks = useRef<Set<() => void>>(new Set());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // Debounce rapid changes (e.g., switching wifi → cellular)
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(() => {
        const connected = state.isConnected ?? false;
        const reachable = state.isInternetReachable;

        setStatus({
          isConnected: connected,
          isInternetReachable: reachable,
          connectionType: state.type,
          isWifi: state.type === 'wifi',
          isCellular: state.type === 'cellular',
        });

        // Fire reconnect callbacks when coming back online
        if (connected && wasOffline.current) {
          reconnectCallbacks.current.forEach((cb) => {
            try { cb(); } catch (e) { console.warn('[Network] Reconnect callback error:', e); }
          });
        }

        wasOffline.current = !connected;
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  /**
   * Register a callback to run when the device comes back online.
   * Returns an unsubscribe function.
   */
  const onReconnect = useCallback((callback: () => void) => {
    reconnectCallbacks.current.add(callback);
    return () => {
      reconnectCallbacks.current.delete(callback);
    };
  }, []);

  return { ...status, onReconnect };
}
