export const HTTP_HEADER_REQUEST_ID = "x-request-id";

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
} as const;

/** Web-only httpOnly cookies (never read/written from client JS). */
export const ACCESS_TOKEN_COOKIE_NAME = "karate_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "karate_refresh_token";

export const PASSWORD_MIN_LENGTH = 12;

/** Rate limit defaults; environment-specific overrides live in @karate/config. */
export const RATE_LIMIT_DEFAULTS = {
  windowMs: 60_000,
  maxRequests: 100,
} as const;
