import { FieldReports } from '@/features/submissions/field-reports';
import { useAuthStore } from '@/state/auth-store';
import { useEnvironment } from '@/hooks/use-environment';
import { useMemo } from 'react';

export default function ReportsScreen() {
  const userId = useAuthStore(s => s.currentUser?.id);
  const tenantId = useAuthStore(s => s.activeTenant?.id);
  const { environment } = useEnvironment();
  const scope = useMemo(() => ({ environment, userId: userId ?? '', tenantId: tenantId ?? '' }), [environment,userId,tenantId]);
  if (!userId || !tenantId) return null;
  return <FieldReports key={`${environment}:${userId}:${tenantId}`} scope={scope} />;
}
