export type AppEnvironment = 'development' | 'qa' | 'staging' | 'production';

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly backoffMultiplier: number;
}

export interface EnvironmentConfig {
  readonly environment: AppEnvironment;
  readonly environmentLabel: string;
  readonly apiBaseUrl: string;
  readonly authEndpoint: string;
  readonly websocketUrl?: string;
  readonly requestTimeoutMs: number;
  readonly retryPolicy: RetryPolicy;
  readonly enableDebugLogging: boolean;
  readonly enableNetworkDiagnostics: boolean;
  readonly allowMockDataFallback: boolean;
  readonly isProductionSafe: boolean; // Flag to disallow automated/destructive operations
  readonly telemetrySampleRate: number;
}
