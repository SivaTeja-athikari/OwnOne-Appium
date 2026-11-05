import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppNetworkState } from '@/hooks/use-app-network';
import { useAuthStore } from '@/state/auth-store';
import { useEnvironment } from '@/hooks/use-environment';
import { syncReports } from './sync';

/** Foreground delivery only. Durable queued reports survive app termination. */
export function SubmissionSync() {
  const userId = useAuthStore(s => s.currentUser?.id);
  const tenantId = useAuthStore(s => s.activeTenant?.id);
  const token = useAuthStore(s => s.authToken);
  const { environment } = useEnvironment();
  const network = useAppNetworkState();
  const online = network.isConnected === true && network.isInternetReachable !== false;
  useEffect(() => {
    if (!online || !userId || !tenantId || !token) return;
    const scope = { environment,userId,tenantId };
    const attempt = () => {
      if (AppState.currentState === 'active') void syncReports(scope).catch(() => undefined);
    };
    attempt();
    const timer = setInterval(attempt,30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') attempt(); });
    return () => { clearInterval(timer); subscription.remove(); };
  },[online,userId,tenantId,token,environment]);
  return null;
}
