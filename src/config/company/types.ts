export type TenantId = 'acme-corp' | 'apex-health' | 'zenith-financial' | string;

export type UserRole = 'admin' | 'manager' | 'viewer' | 'auditor';

export type TenantPermission =
  | 'analytics:view'
  | 'reports:export'
  | 'users:manage'
  | 'settings:edit'
  | 'transactions:create'
  | 'audit:view';

export interface CompanyBranding {
  readonly primaryColor: string;
  readonly primaryContrastColor: string;
  readonly secondaryColor: string;
  readonly accentColor: string;
  readonly surfaceColor: string;
  readonly cardRadius: number;
  readonly logoBadgeText: string;
}

export interface FeatureFlags {
  readonly enableAdvancedReporting: boolean;
  readonly enableExportCsv: boolean;
  readonly enableBiometrics: boolean;
  readonly enableDocumentScanner: boolean;
  readonly enableCustomDashboard: boolean;
  readonly enableRealtimeAlerts: boolean;
}

export interface BusinessRules {
  readonly maxTransactionAmount: number;
  readonly requireMfa: boolean;
  readonly sessionTimeoutMinutes: number;
  readonly passwordMinLength: number;
  readonly currency: string;
  readonly dateFormat: string;
  readonly timezone: string;
}

export interface TenantConfig {
  readonly id: TenantId;
  readonly displayName: string;
  readonly legalName: string;
  readonly domain: string;
  readonly branding: CompanyBranding;
  readonly features: FeatureFlags;
  readonly businessRules: BusinessRules;
  readonly allowedRoles: readonly UserRole[];
  readonly rolePermissions: Readonly<Record<UserRole, readonly TenantPermission[]>>;
}

export interface UserTenantMembership {
  readonly tenantId: TenantId;
  readonly role: UserRole;
  readonly assignedAt: string;
  readonly status: 'active' | 'suspended' | 'pending';
}

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly memberships: readonly UserTenantMembership[];
}
