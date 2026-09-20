/**
 * Consistent API envelope shapes. Every apps/api response — success or
 * error — conforms to one of these two shapes. See
 * docs/architecture/error-handling-strategy.md.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    pagination?: PaginationMeta;
    requestId: string;
    timestamp: string;
  };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    timestamp: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Stable, client-facing error codes. Never leak stack traces, SQL errors,
 * internal file paths, or raw exception messages to clients — translate
 * every failure into one of these.
 */
export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_ERROR",
  "AUTHORIZATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INFRASTRUCTURE_ERROR",
  "INTERNAL_ERROR",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}
