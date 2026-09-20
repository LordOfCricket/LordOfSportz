import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

type RequestSource = "body" | "query" | "params";

/**
 * Validates and REPLACES `req[source]` with the parsed/coerced value, so
 * every downstream handler works with typed, trusted data. Throws
 * (ZodError), which the central errorHandler translates into a
 * VALIDATION_ERROR response — no manual try/catch needed at call sites.
 */
export function validate(schema: ZodSchema, source: RequestSource = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (error) {
      next(error);
    }
  };
}
