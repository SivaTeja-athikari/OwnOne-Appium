export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ApiRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  skipAuth?: boolean;
  skipTenantHeader?: boolean;
  correlationId?: string;
}

export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly correlationId: string;
}

export interface ApiErrorDetail {
  readonly field?: string;
  readonly message: string;
  readonly code?: string;
}

export interface ApiErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly details?: readonly ApiErrorDetail[];
  readonly correlationId?: string;
}
