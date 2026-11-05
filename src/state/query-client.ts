import { QueryClient } from '@tanstack/react-query';
import type { TenantId } from '@/config/company/types';

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 15, // 15 minutes
      retry: (failureCount, error: any) => {
        // Do not retry 401 or 403 authorization failures
        if (error?.status === 401 || error?.status === 403) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false, // Never auto-retry non-idempotent mutations
    },
  },
});

/**
 * Creates an immutable, strongly-scoped query key bound to a specific tenant ID.
 * Example: createTenantQueryKey('acme-corp', 'analytics', 'dashboard', { range: '30d' })
 * Results in: ['tenant', 'acme-corp', 'analytics', 'dashboard', { range: '30d' }]
 */
export function createTenantQueryKey(
  tenantId: TenantId,
  scope: string,
  ...args: unknown[]
): readonly unknown[] {
  if (!tenantId) {
    throw new Error('[TenantQueryKey] TenantId is required to construct a tenant-scoped query key');
  }
  return Object.freeze(['tenant', tenantId, scope, ...args]);
}

/**
 * Removes all cached queries belonging to a specific tenant from the TanStack query cache.
 * Call this when switching tenants or when tenant permissions change.
 */
export function clearTenantCache(client: QueryClient, tenantId: TenantId): void {
  client.removeQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key[0] === 'tenant' && key[1] === tenantId;
    },
  });
}

/**
 * Completely purges all cached query and mutation data across all tenants.
 * Call this during user logout or environment transition.
 */
export function clearAllTenantCaches(client: QueryClient): void {
  client.clear();
}
