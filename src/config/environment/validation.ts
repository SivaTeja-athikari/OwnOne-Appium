import type { AppEnvironment, EnvironmentConfig } from './types';

export class ConfigurationValidationError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(`[ConfigValidation] ${message}`);
    this.name = 'ConfigurationValidationError';
    this.details = details;
    Object.setPrototypeOf(this, ConfigurationValidationError.prototype);
  }
}

const VALID_ENVIRONMENTS: ReadonlySet<AppEnvironment> = new Set([
  'development',
  'qa',
  'staging',
  'production',
]);

function isValidUrl(urlStr: string, requireHttps = false): boolean {
  try {
    const parsed = new URL(urlStr);
    if (requireHttps) {
      return parsed.protocol === 'https:';
    }
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateEnvironmentConfig(config: unknown): asserts config is EnvironmentConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigurationValidationError('Environment configuration must be a non-null object');
  }

  const candidate = config as Partial<EnvironmentConfig>;

  if (!candidate.environment || !VALID_ENVIRONMENTS.has(candidate.environment)) {
    throw new ConfigurationValidationError(
      `Invalid environment '${candidate.environment}'. Must be one of: ${Array.from(VALID_ENVIRONMENTS).join(', ')}`
    );
  }

  const isProd = candidate.environment === 'production';

  // API Base URL validation
  if (!candidate.apiBaseUrl || typeof candidate.apiBaseUrl !== 'string') {
    throw new ConfigurationValidationError('apiBaseUrl is required and must be a string');
  }
  if (!isValidUrl(candidate.apiBaseUrl, isProd)) {
    throw new ConfigurationValidationError(
      `apiBaseUrl '${candidate.apiBaseUrl}' is invalid or does not meet HTTPS requirements for ${candidate.environment}`
    );
  }

  // Auth Endpoint validation
  if (!candidate.authEndpoint || typeof candidate.authEndpoint !== 'string') {
    throw new ConfigurationValidationError('authEndpoint is required and must be a string');
  }
  if (!isValidUrl(candidate.authEndpoint, isProd)) {
    throw new ConfigurationValidationError(
      `authEndpoint '${candidate.authEndpoint}' is invalid or does not meet HTTPS requirements for ${candidate.environment}`
    );
  }

  // Timeout validation
  if (
    typeof candidate.requestTimeoutMs !== 'number' ||
    candidate.requestTimeoutMs < 1000 ||
    candidate.requestTimeoutMs > 120000
  ) {
    throw new ConfigurationValidationError(
      `requestTimeoutMs must be a positive integer between 1000 and 120000 (received: ${candidate.requestTimeoutMs})`
    );
  }

  // Retry Policy validation
  if (!candidate.retryPolicy || typeof candidate.retryPolicy !== 'object') {
    throw new ConfigurationValidationError('retryPolicy is required and must be an object');
  }
  const { maxRetries, retryDelayMs, backoffMultiplier } = candidate.retryPolicy;
  if (typeof maxRetries !== 'number' || maxRetries < 0 || maxRetries > 5) {
    throw new ConfigurationValidationError(
      `retryPolicy.maxRetries must be between 0 and 5 (received: ${maxRetries})`
    );
  }
  if (typeof retryDelayMs !== 'number' || retryDelayMs < 0) {
    throw new ConfigurationValidationError(
      `retryPolicy.retryDelayMs must be non-negative (received: ${retryDelayMs})`
    );
  }
  if (typeof backoffMultiplier !== 'number' || backoffMultiplier < 1.0) {
    throw new ConfigurationValidationError(
      `retryPolicy.backoffMultiplier must be >= 1.0 (received: ${backoffMultiplier})`
    );
  }

  // Production security checks
  if (isProd) {
    if (candidate.allowMockDataFallback) {
      throw new ConfigurationValidationError('Mock data fallback is strictly forbidden in production');
    }
    if (candidate.enableNetworkDiagnostics) {
      throw new ConfigurationValidationError('Network diagnostics must be disabled in production builds');
    }
  }
}
