import pino, { type Logger } from "pino";

/**
 * Fields that must never reach a log line, at any nesting depth pino's
 * redact supports. Extend this list rather than trusting call sites to
 * remember to omit sensitive fields themselves.
 */
const REDACTED_PATHS = [
  "password",
  "passwordHash",
  "*.password",
  "*.passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.authorization",
  "req.headers.authorization",
  "req.headers.cookie",
  "medicalNotes",
  "*.medicalNotes",
  "clearanceDocumentUrl",
  "*.clearanceDocumentUrl",
];

export interface CreateLoggerOptions {
  serviceName: string;
  environment: "development" | "test" | "staging" | "production";
  level?: string;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const isDevelopment = options.environment === "development";

  return pino({
    name: options.serviceName,
    level: options.level ?? (isDevelopment ? "debug" : "info"),
    base: { service: options.serviceName, env: options.environment },
    redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: isDevelopment
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } }
      : undefined,
  });
}

/** Per-request child logger carrying the correlation ID through every log line. */
export function withRequestId(logger: Logger, requestId: string): Logger {
  return logger.child({ requestId });
}

export type { Logger };
