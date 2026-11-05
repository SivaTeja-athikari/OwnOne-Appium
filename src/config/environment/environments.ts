import type { AppEnvironment, EnvironmentConfig } from './types';

export const ENVIRONMENTS: Readonly<Record<AppEnvironment, EnvironmentConfig>> = Object.freeze({
  development: Object.freeze({
    environment: 'development',
    environmentLabel: 'Development (Local/Dev)',
    apiBaseUrl: 'https://dev-api.saasplatform.internal/v1',
    authEndpoint: 'https://dev-auth.saasplatform.internal/oauth/token',
    websocketUrl: 'wss://dev-ws.saasplatform.internal/realtime',
    requestTimeoutMs: 15000,
    retryPolicy: Object.freeze({
      maxRetries: 2,
      retryDelayMs: 500,
      backoffMultiplier: 1.5,
    }),
    enableDebugLogging: true,
    enableNetworkDiagnostics: true,
    allowMockDataFallback: true,
    isProductionSafe: false,
    telemetrySampleRate: 1.0,
  }),

  qa: Object.freeze({
    environment: 'qa',
    environmentLabel: 'Quality Assurance (QA)',
    apiBaseUrl: 'https://qa-api.saasplatform.internal/v1',
    authEndpoint: 'https://qa-auth.saasplatform.internal/oauth/token',
    websocketUrl: 'wss://qa-ws.saasplatform.internal/realtime',
    requestTimeoutMs: 20000,
    retryPolicy: Object.freeze({
      maxRetries: 3,
      retryDelayMs: 750,
      backoffMultiplier: 2.0,
    }),
    enableDebugLogging: true,
    enableNetworkDiagnostics: true,
    allowMockDataFallback: true,
    isProductionSafe: false,
    telemetrySampleRate: 1.0,
  }),

  staging: Object.freeze({
    environment: 'staging',
    environmentLabel: 'Staging (Pre-Prod)',
    apiBaseUrl: 'https://staging-api.saasplatform.com/v1',
    authEndpoint: 'https://staging-auth.saasplatform.com/oauth/token',
    websocketUrl: 'wss://staging-ws.saasplatform.com/realtime',
    requestTimeoutMs: 15000,
    retryPolicy: Object.freeze({
      maxRetries: 2,
      retryDelayMs: 500,
      backoffMultiplier: 2.0,
    }),
    enableDebugLogging: true,
    enableNetworkDiagnostics: false,
    allowMockDataFallback: false,
    isProductionSafe: false,
    telemetrySampleRate: 0.5,
  }),

  production: Object.freeze({
    environment: 'production',
    environmentLabel: 'Production',
    apiBaseUrl: 'https://api.saasplatform.com/v1',
    authEndpoint: 'https://auth.saasplatform.com/oauth/token',
    websocketUrl: 'wss://ws.saasplatform.com/realtime',
    requestTimeoutMs: 10000,
    retryPolicy: Object.freeze({
      maxRetries: 2,
      retryDelayMs: 1000,
      backoffMultiplier: 2.0,
    }),
    enableDebugLogging: false,
    enableNetworkDiagnostics: false,
    allowMockDataFallback: false,
    isProductionSafe: true,
    telemetrySampleRate: 0.1,
  }),
});
