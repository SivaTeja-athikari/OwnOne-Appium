import { getActiveEnvironmentConfig } from '@/config/environment/index';
import type { ApiRequestOptions, ApiResponse, HttpMethod } from './types';
import {
  ApiError,
  AuthenticationError,
  NetworkError,
  TenantAuthorizationError,
  TimeoutError,
} from './errors';

// State references injected to avoid circular dependency
let authTokenGetter: (() => string | null) = () => null;
let activeTenantIdGetter: (() => string | null) = () => null;
let tokenRefreshHandler: (() => Promise<string | null>) | null = null;

export function setApiAuthTokenGetter(getter: () => string | null): void {
  authTokenGetter = getter;
}

export function setApiTenantIdGetter(getter: () => string | null): void {
  activeTenantIdGetter = getter;
}

export function setTokenRefreshHandler(handler: () => Promise<string | null>): void {
  tokenRefreshHandler = handler;
}

function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function sanitizeForLogging(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForLogging);

  const sensitiveKeys = new Set(['password', 'token', 'authorization', 'secret', 'mfaCode', 'otp']);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeForLogging(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class ApiClient {
  private isIdempotent(method: HttpMethod): boolean {
    return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  }

  private isTransientStatus(status: number): boolean {
    return [408, 429, 500, 502, 503, 504].includes(status);
  }

  private retryAfterMs(response: Response, fallback: number): number {
    const header = response.headers.get('Retry-After');
    if (!header) return fallback;
    const seconds = Number(header);
    const delay = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(header) - Date.now();
    return Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 30_000) : fallback;
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const config = getActiveEnvironmentConfig();
    const method: HttpMethod = options.method ?? 'GET';
    const correlationId = options.correlationId ?? generateCorrelationId();
    const timeoutMs = options.timeoutMs ?? config.requestTimeoutMs;

    // Construct URL
    const url = new URL(path.startsWith('http') ? path : `${config.apiBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`);
    if (options.params) {
      for (const [key, val] of Object.entries(options.params)) {
        if (val !== undefined) {
          url.searchParams.append(key, String(val));
        }
      }
    }

    // Construct Headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Correlation-ID': correlationId,
      'X-Environment': config.environment,
      ...options.headers,
    };

    if (!options.skipTenantHeader) {
      const tenantId = activeTenantIdGetter();
      if (tenantId) {
        headers['X-Tenant-ID'] = tenantId;
      }
    }

    if (!options.skipAuth) {
      const token = authTokenGetter();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    if (config.enableDebugLogging) {
      console.log(`[API] --> ${method} ${url.pathname} (Corr: ${correlationId})`, {
        headers: sanitizeForLogging(headers),
        body: options.body ? sanitizeForLogging(options.body) : undefined,
      });
    }

    // Attempt request with controlled retry for eligible idempotent requests
    const maxRetries = this.isIdempotent(method) ? config.retryPolicy.maxRetries : 0;
    let attempt = 0;
    let delay = config.retryPolicy.retryDelayMs;

    while (true) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const forwardAbort = () => controller.abort();

      // Link external signal if provided
      if (options.signal) {
        options.signal.addEventListener('abort', forwardAbort, { once: true });
      }

      try {
        const response = await fetch(url.toString(), {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', forwardAbort);

        // Handle 401 Unauthorized & Token Refresh
        if (response.status === 401 && !options.skipAuth && tokenRefreshHandler) {
          const newToken = await tokenRefreshHandler();
          if (newToken) {
            headers.Authorization = `Bearer ${newToken}`;
            // Retry once with refreshed token
            return this.request<T>(path, { ...options, skipAuth: false, correlationId });
          }
          throw new AuthenticationError('Unauthorized: Token expired or invalid.', correlationId);
        }

        // Handle 403 Forbidden
        if (response.status === 403) {
          const tenantId = headers['X-Tenant-ID'];
          throw new TenantAuthorizationError(tenantId, 'Forbidden: Insufficient tenant permissions.', correlationId);
        }

        // Handle other HTTP errors
        if (!response.ok) {
          let errorPayload: any = null;
          try {
            errorPayload = await response.json();
          } catch {
            // non-json response
          }
          if (this.isIdempotent(method) && this.isTransientStatus(response.status) && attempt <= maxRetries) {
            const retryDelay = this.retryAfterMs(response, delay);
            await new Promise((res) => setTimeout(res, retryDelay));
            delay *= config.retryPolicy.backoffMultiplier;
            continue;
          }
          throw new ApiError(
            errorPayload?.message ?? `Request failed with status ${response.status}`,
            response.status,
            errorPayload,
            correlationId
          );
        }

        const data: T = await response.json();
        clearTimeout(timer);

        if (config.enableDebugLogging) {
          console.log(`[API] <-- ${method} ${url.pathname} Status: ${response.status} (Corr: ${correlationId})`);
        }

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((val, key) => {
          responseHeaders[key] = val;
        });

        return {
          data,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          correlationId,
        };
      } catch (err: any) {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', forwardAbort);

        if (err.name === 'AbortError') {
          if (!options.signal?.aborted && this.isIdempotent(method) && attempt <= maxRetries) {
            await new Promise((res) => setTimeout(res, delay));
            delay *= config.retryPolicy.backoffMultiplier;
            continue;
          }
          throw new TimeoutError(timeoutMs);
        }

        if (err instanceof ApiError) {
          throw err;
        }

        const isNetworkFailure = err instanceof TypeError || err.message?.includes('fetch');

        // Only retry on network errors if idempotent and attempts remain
        if (isNetworkFailure && attempt <= maxRetries) {
          await new Promise((res) => setTimeout(res, delay));
          delay *= config.retryPolicy.backoffMultiplier;
          continue;
        }

        if (isNetworkFailure) {
          throw new NetworkError(`Network connection failed during request to ${url.pathname}`);
        }

        throw err;
      }
    }
  }

  // Convenience methods
  get<T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  delete<T>(path: string, options?: Omit<ApiRequestOptions, 'method'>) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export * from './types';
export * from './errors';
