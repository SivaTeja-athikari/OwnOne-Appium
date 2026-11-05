import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TENANT_REGISTRY,
  validateTenantConfig,
  validateUserTenantAccess,
  TenantValidationError,
  UnauthorizedTenantAccessError,
} from '../src/config/company/index';
import type { AuthenticatedUser } from '../src/config/company/types';

describe('Multi-Company / Multi-Tenant Configuration & Authorization', () => {
  it('should validate all registered tenant configurations', () => {
    for (const [tenantId, config] of Object.entries(TENANT_REGISTRY)) {
      assert.doesNotThrow(() => validateTenantConfig(config));
      assert.strictEqual(config.id, tenantId);
    }
  });

  it('should reject tenant config with invalid or missing fields', () => {
    const invalidConfig = {
      id: 'bad-tenant',
      displayName: 'Incomplete Tenant',
      // missing branding and businessRules
    };

    assert.throws(() => validateTenantConfig(invalidConfig), TenantValidationError);
  });

  it('should authorize user for permitted tenant and return role', () => {
    const testUser: AuthenticatedUser = {
      id: 'user_123',
      email: 'alex.smith@acme.com',
      fullName: 'Alex Smith',
      memberships: [
        {
          tenantId: 'acme-corp',
          role: 'manager',
          assignedAt: '2026-01-01T00:00:00Z',
          status: 'active',
        },
      ],
    };

    const role = validateUserTenantAccess(testUser, 'acme-corp');
    assert.strictEqual(role, 'manager');
  });

  it('should reject unauthorized tenant access attempt', () => {
    const testUser: AuthenticatedUser = {
      id: 'user_123',
      email: 'alex.smith@acme.com',
      fullName: 'Alex Smith',
      memberships: [
        {
          tenantId: 'acme-corp',
          role: 'manager',
          assignedAt: '2026-01-01T00:00:00Z',
          status: 'active',
        },
      ],
    };

    // User attempts to access zenith-financial without membership
    assert.throws(
      () => validateUserTenantAccess(testUser, 'zenith-financial'),
      (err: any) => {
        assert(err instanceof UnauthorizedTenantAccessError);
        assert.strictEqual(err.userId, 'user_123');
        assert.strictEqual(err.attemptedTenantId, 'zenith-financial');
        return true;
      }
    );
  });

  it('should reject unauthenticated access', () => {
    assert.throws(
      () => validateUserTenantAccess(null, 'acme-corp'),
      UnauthorizedTenantAccessError
    );
  });
});
