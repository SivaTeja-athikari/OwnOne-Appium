import type { AuthenticatedUser, TenantConfig, TenantId, UserRole } from './types';

export class TenantValidationError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(`[TenantValidation] ${message}`);
    this.name = 'TenantValidationError';
    this.details = details;
    Object.setPrototypeOf(this, TenantValidationError.prototype);
  }
}

export class UnauthorizedTenantAccessError extends Error {
  readonly userId: string;
  readonly attemptedTenantId: string;

  constructor(userId: string, attemptedTenantId: string) {
    super(`[UnauthorizedAccess] User '${userId}' is not authorized to access tenant '${attemptedTenantId}'.`);
    this.name = 'UnauthorizedTenantAccessError';
    this.userId = userId;
    this.attemptedTenantId = attemptedTenantId;
    Object.setPrototypeOf(this, UnauthorizedTenantAccessError.prototype);
  }
}

/**
 * Validates that an authenticated user has an active membership in the target tenant.
 * Returns the verified role within that tenant.
 */
export function validateUserTenantAccess(user: AuthenticatedUser | null, targetTenantId: TenantId): UserRole {
  if (!user) {
    throw new UnauthorizedTenantAccessError('unauthenticated', targetTenantId);
  }

  const membership = user.memberships.find(
    (m) => m.tenantId === targetTenantId && m.status === 'active'
  );

  if (!membership) {
    throw new UnauthorizedTenantAccessError(user.id, targetTenantId);
  }

  return membership.role;
}

/**
 * Validates the schema of a tenant config object received from the backend.
 */
export function validateTenantConfig(config: unknown): asserts config is TenantConfig {
  if (!config || typeof config !== 'object') {
    throw new TenantValidationError('Tenant configuration must be a non-null object');
  }

  const candidate = config as Partial<TenantConfig>;

  if (!candidate.id || typeof candidate.id !== 'string') {
    throw new TenantValidationError('Tenant id is required and must be a string');
  }

  if (!candidate.displayName || typeof candidate.displayName !== 'string') {
    throw new TenantValidationError('displayName is required and must be a string');
  }

  if (!candidate.branding || typeof candidate.branding !== 'object') {
    throw new TenantValidationError('branding object is required');
  }

  const { primaryColor, primaryContrastColor } = candidate.branding;
  if (!primaryColor || typeof primaryColor !== 'string') {
    throw new TenantValidationError('branding.primaryColor is required');
  }
  if (!primaryContrastColor || typeof primaryContrastColor !== 'string') {
    throw new TenantValidationError('branding.primaryContrastColor is required');
  }

  if (!candidate.features || typeof candidate.features !== 'object') {
    throw new TenantValidationError('features object is required');
  }

  if (!candidate.businessRules || typeof candidate.businessRules !== 'object') {
    throw new TenantValidationError('businessRules object is required');
  }

  const { maxTransactionAmount, sessionTimeoutMinutes } = candidate.businessRules;
  if (typeof maxTransactionAmount !== 'number' || maxTransactionAmount <= 0) {
    throw new TenantValidationError('businessRules.maxTransactionAmount must be a positive number');
  }
  if (typeof sessionTimeoutMinutes !== 'number' || sessionTimeoutMinutes <= 0) {
    throw new TenantValidationError('businessRules.sessionTimeoutMinutes must be a positive number');
  }

  if (!candidate.rolePermissions || typeof candidate.rolePermissions !== 'object') {
    throw new TenantValidationError('rolePermissions object is required');
  }
}
