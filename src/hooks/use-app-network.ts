import { useState, useEffect } from 'react';
import * as Network from 'expo-network';

/**
 * Real-time network state hook with active reachability polling fallback.
 * Essential for iOS Simulator where native NWPathMonitor reconnect callbacks
 * can stall while idle unless queried directly via getNetworkStateAsync.
 */
export function useAppNetworkState(): Network.NetworkState {
  const [state, setState] = useState<Network.NetworkState>({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    let mounted = true;

    void Network.getNetworkStateAsync().then((s) => {
      if (mounted) setState(s);
    });

    const subscription = Network.addNetworkStateListener((s) => {
      if (mounted) setState(s);
    });

    const interval = setInterval(async () => {
      try {
        const fresh = await Network.getNetworkStateAsync();
        if (mounted) {
          setState((prev) => {
            if (
              prev.isConnected !== fresh.isConnected ||
              prev.isInternetReachable !== fresh.isInternetReachable
            ) {
              return fresh;
            }
            return prev;
          });
        }
      } catch {
        // Ignore background query errors
      }
    }, 2000);

    return () => {
      mounted = false;
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  return state;
}
