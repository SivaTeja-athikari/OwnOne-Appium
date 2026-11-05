import type { AppEnvironment, EnvironmentConfig } from './types';
import { ENVIRONMENTS } from './environments';
import { validateEnvironmentConfig, ConfigurationValidationError } from './validation';
import { localStorage } from '@/core/storage/local-storage';

const ENVIRONMENT_STORAGE_KEY = 'app.active-environment';

function getExpoExtra(): Record<string, any> | undefined {
  try {
    // Only access expo-constants if available in the runtime environment
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constantsModule = (globalThis as any).expoConstants || (typeof require !== 'undefined' ? require('expo-constants') : null);
    const Constants = constantsModule?.default || constantsModule;
    return Constants?.expoConfig?.extra ?? Constants?.manifest?.extra;
  } catch {
    return undefined;
  }
}

let currentEnvName: AppEnvironment = resolveInitialEnvironment();
let currentConfig: EnvironmentConfig = resolveAndValidate(currentEnvName);

const envListeners = new Set<(config: EnvironmentConfig) => void>();

function resolveInitialEnvironment(): AppEnvironment {
  // 1. Check Expo extra configuration from app.json / dynamic app config
  const extra = getExpoExtra();
  const extraEnv = extra?.appEnv;
  if (typeof extraEnv === 'string' && isValidEnvironment(extraEnv)) {
    return extraEnv;
  }

  // 2. Check public environment variable (set at build/run time)
  const envVar = process.env.EXPO_PUBLIC_APP_ENV;
  if (typeof envVar === 'string' && isValidEnvironment(envVar)) {
    return envVar;
  }

  // 3. Check NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }

  // Default to development for local workflows
  return 'development';
}

function isValidEnvironment(val: string): val is AppEnvironment {
  return ['development', 'qa', 'staging', 'production'].includes(val);
}

function resolveAndValidate(env: AppEnvironment): EnvironmentConfig {
  const config = ENVIRONMENTS[env];
  if (!config) {
    throw new ConfigurationValidationError(`No configuration registered for environment '${env}'`);
  }
  validateEnvironmentConfig(config);
  return config;
}

/**
 * Returns the currently active validated environment configuration.
 */
export function getActiveEnvironmentConfig(): EnvironmentConfig {
  return currentConfig;
}

/**
 * Observable subscription for environment changes (used by non-prod diagnostic banners & API client reset).
 */
export function subscribeToEnvironmentChanges(callback: (config: EnvironmentConfig) => void): () => void {
  envListeners.add(callback);
  return () => {
    envListeners.delete(callback);
  };
}

/**
 * Safely switch environment in non-production builds.
 * Throws in production or when attempting to switch away from production.
 */
export function switchEnvironment(targetEnv: AppEnvironment): EnvironmentConfig {
  if (currentConfig.environment === 'production') {
    throw new ConfigurationValidationError('Runtime environment switching is strictly prohibited in production builds.');
  }

  const newConfig = resolveAndValidate(targetEnv);
  currentEnvName = targetEnv;
  currentConfig = newConfig;

  // Notify listeners (e.g. API client, Query client, Auth store)
  for (const listener of envListeners) {
    try {
      listener(newConfig);
    } catch (err) {
      console.error('[Config] Error in environment change listener:', err);
    }
  }

  return newConfig;
}

/** Load a previously selected non-production environment before auth hydration. */
export async function restoreEnvironmentSelection(): Promise<EnvironmentConfig> {
  if (currentConfig.environment === 'production') return currentConfig;
  try {
    const saved = await localStorage.getItem(ENVIRONMENT_STORAGE_KEY);
    if (saved && isValidEnvironment(saved) && saved !== 'production' && saved !== currentEnvName) {
      return switchEnvironment(saved);
    }
  } catch (error) {
    console.warn('[Config] Could not restore saved environment:', error);
  }
  return currentConfig;
}

/** Persist a non-production selection before applying it and notifying listeners. */
export async function selectEnvironment(targetEnv: AppEnvironment): Promise<EnvironmentConfig> {
  if (targetEnv === 'production') {
    throw new ConfigurationValidationError('Runtime environment switching to production is prohibited.');
  }
  resolveAndValidate(targetEnv);
  await localStorage.setItem(ENVIRONMENT_STORAGE_KEY, targetEnv);
  return switchEnvironment(targetEnv);
}

export * from './types';
export * from './environments';
export * from './validation';
