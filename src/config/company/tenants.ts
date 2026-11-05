import type { TenantConfig, TenantId, UserRole, TenantPermission } from './types';

const ACME_ROLES: readonly UserRole[] = Object.freeze(['admin', 'manager', 'viewer'] as const);
const APEX_ROLES: readonly UserRole[] = Object.freeze(['admin', 'manager', 'viewer', 'auditor'] as const);
const ZENITH_ROLES: readonly UserRole[] = Object.freeze(['admin', 'manager', 'viewer', 'auditor'] as const);

const ADMIN_PERMS: readonly TenantPermission[] = Object.freeze([
  'analytics:view',
  'reports:export',
  'users:manage',
  'settings:edit',
  'transactions:create',
  'audit:view',
] as const);

const APEX_ADMIN_PERMS: readonly TenantPermission[] = Object.freeze([
  'analytics:view',
  'reports:export',
  'users:manage',
  'settings:edit',
  'audit:view',
] as const);

const MANAGER_PERMS: readonly TenantPermission[] = Object.freeze([
  'analytics:view',
  'reports:export',
  'transactions:create',
] as const);

const APEX_MANAGER_PERMS: readonly TenantPermission[] = Object.freeze([
  'analytics:view',
  'audit:view',
] as const);

const VIEWER_PERMS: readonly TenantPermission[] = Object.freeze(['analytics:view'] as const);
const AUDITOR_PERMS: readonly TenantPermission[] = Object.freeze(['audit:view', 'reports:export'] as const);
const APEX_AUDITOR_PERMS: readonly TenantPermission[] = Object.freeze(['audit:view'] as const);

export const TENANT_REGISTRY: Readonly<Record<string, TenantConfig>> = Object.freeze({
  'acme-corp': Object.freeze({
    id: 'acme-corp',
    displayName: 'Acme Logistics & Supply',
    legalName: 'Acme International Corporation',
    domain: 'acme.com',
    branding: Object.freeze({
      primaryColor: '#0284C7', // Oceanic Blue
      primaryContrastColor: '#FFFFFF',
      secondaryColor: '#0EA5E9',
      accentColor: '#F59E0B',
      surfaceColor: '#F0F9FF',
      cardRadius: 12,
      logoBadgeText: 'ACME',
    }),
    features: Object.freeze({
      enableAdvancedReporting: true,
      enableExportCsv: true,
      enableBiometrics: true,
      enableDocumentScanner: true,
      enableCustomDashboard: false,
      enableRealtimeAlerts: true,
    }),
    businessRules: Object.freeze({
      maxTransactionAmount: 100000,
      requireMfa: true,
      sessionTimeoutMinutes: 30,
      passwordMinLength: 10,
      currency: 'USD',
      dateFormat: 'YYYY-MM-DD',
      timezone: 'America/New_York',
    }),
    allowedRoles: ACME_ROLES,
    rolePermissions: Object.freeze({
      admin: ADMIN_PERMS,
      manager: MANAGER_PERMS,
      viewer: VIEWER_PERMS,
      auditor: AUDITOR_PERMS,
    }),
  }),

  'apex-health': Object.freeze({
    id: 'apex-health',
    displayName: 'Apex Healthcare Solutions',
    legalName: 'Apex Health Systems LLC',
    domain: 'apexhealth.org',
    branding: Object.freeze({
      primaryColor: '#059669', // Emerald Medical Green
      primaryContrastColor: '#FFFFFF',
      secondaryColor: '#10B981',
      accentColor: '#6366F1',
      surfaceColor: '#ECFDF5',
      cardRadius: 8,
      logoBadgeText: 'APEX',
    }),
    features: Object.freeze({
      enableAdvancedReporting: false,
      enableExportCsv: false, // Strict HIPAA export restrictions
      enableBiometrics: true,
      enableDocumentScanner: true,
      enableCustomDashboard: true,
      enableRealtimeAlerts: true,
    }),
    businessRules: Object.freeze({
      maxTransactionAmount: 25000,
      requireMfa: true,
      sessionTimeoutMinutes: 15, // Stricter timeout for healthcare
      passwordMinLength: 12,
      currency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      timezone: 'America/Chicago',
    }),
    allowedRoles: APEX_ROLES,
    rolePermissions: Object.freeze({
      admin: APEX_ADMIN_PERMS,
      manager: APEX_MANAGER_PERMS,
      viewer: VIEWER_PERMS,
      auditor: APEX_AUDITOR_PERMS,
    }),
  }),

  'zenith-financial': Object.freeze({
    id: 'zenith-financial',
    displayName: 'Zenith Capital Group',
    legalName: 'Zenith Global Wealth & Investments Inc.',
    domain: 'zenithcapital.com',
    branding: Object.freeze({
      primaryColor: '#7C3AED', // Royal Purple
      primaryContrastColor: '#FFFFFF',
      secondaryColor: '#8B5CF6',
      accentColor: '#10B981',
      surfaceColor: '#F5F3FF',
      cardRadius: 16,
      logoBadgeText: 'ZENITH',
    }),
    features: Object.freeze({
      enableAdvancedReporting: true,
      enableExportCsv: true,
      enableBiometrics: true,
      enableDocumentScanner: false,
      enableCustomDashboard: true,
      enableRealtimeAlerts: true,
    }),
    businessRules: Object.freeze({
      maxTransactionAmount: 1000000,
      requireMfa: true,
      sessionTimeoutMinutes: 10, // Strictest timeout for fintech
      passwordMinLength: 14,
      currency: 'EUR',
      dateFormat: 'DD/MM/YYYY',
      timezone: 'Europe/London',
    }),
    allowedRoles: ZENITH_ROLES,
    rolePermissions: Object.freeze({
      admin: ADMIN_PERMS,
      manager: MANAGER_PERMS,
      viewer: VIEWER_PERMS,
      auditor: AUDITOR_PERMS,
    }),
  }),
});

export function getTenantConfigById(tenantId: TenantId): TenantConfig | undefined {
  return TENANT_REGISTRY[tenantId];
}
