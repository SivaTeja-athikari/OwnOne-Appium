import type { ApiErrorPayload } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly payload?: ApiErrorPayload;
  readonly correlationId?: string;

  constructor(message: string, status: number, payload?: ApiErrorPayload, correlationId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.correlationId = correlationId;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network connectivity error. Please check your connection.') {
    super(message);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms.`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication session expired or invalid.', correlationId?: string) {
    super(message, 401, undefined, correlationId);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class TenantAuthorizationError extends ApiError {
  readonly tenantId?: string;

  constructor(tenantId?: string, message = 'Access to this tenant resource is forbidden.', correlationId?: string) {
    super(message, 403, undefined, correlationId);
    this.name = 'TenantAuthorizationError';
    this.tenantId = tenantId;
    Object.setPrototypeOf(this, TenantAuthorizationError.prototype);
  }
}
