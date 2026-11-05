import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ENVIRONMENTS,
  validateEnvironmentConfig,
  ConfigurationValidationError,
  getActiveEnvironmentConfig,
  switchEnvironment,
  subscribeToEnvironmentChanges,
} from '../src/config/environment/index';

describe('Environment Configuration & Validation', () => {
  it('should successfully validate all defined environments', () => {
    for (const envKey of Object.keys(ENVIRONMENTS) as (keyof typeof ENVIRONMENTS)[]) {
      const config = ENVIRONMENTS[envKey];
      assert.doesNotThrow(() => validateEnvironmentConfig(config));
    }
  });

  it('should enforce HTTPS for production API base URL', () => {
    const invalidProd = {
      ...ENVIRONMENTS.production,
      apiBaseUrl: 'http://insecure-api.saasplatform.com/v1',
    };

    assert.throws(
      () => validateEnvironmentConfig(invalidProd),
      ConfigurationValidationError
    );
  });

  it('should disallow mock data fallback in production', () => {
    const invalidProd = {
      ...ENVIRONMENTS.production,
      allowMockDataFallback: true,
    };

    assert.throws(
      () => validateEnvironmentConfig(invalidProd),
      /Mock data fallback is strictly forbidden in production/
    );
  });

  it('should reject invalid environment names', () => {
    const invalidEnv = {
      ...ENVIRONMENTS.development,
      environment: 'sandbox' as any,
    };

    assert.throws(
      () => validateEnvironmentConfig(invalidEnv),
      /Invalid environment 'sandbox'/
    );
  });

  it('should reject invalid timeout values', () => {
    const invalidTimeout = {
      ...ENVIRONMENTS.qa,
      requestTimeoutMs: 50, // too short
    };

    assert.throws(
      () => validateEnvironmentConfig(invalidTimeout),
      /requestTimeoutMs must be a positive integer/
    );
  });

  it('should support safe environment switching in non-prod and notify subscribers', () => {
    let notifiedConfig: any = null;
    const unsubscribe = subscribeToEnvironmentChanges((config) => {
      notifiedConfig = config;
    });

    const switched = switchEnvironment('qa');
    assert.strictEqual(switched.environment, 'qa');
    assert.strictEqual(getActiveEnvironmentConfig().environment, 'qa');
    assert.strictEqual(notifiedConfig?.environment, 'qa');

    // Switch back to development
    switchEnvironment('development');
    assert.strictEqual(getActiveEnvironmentConfig().environment, 'development');

    unsubscribe();
  });
});
