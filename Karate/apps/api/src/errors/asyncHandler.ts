import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not forward rejected promises from async handlers to error
 * middleware on its own. This wrapper is infrastructure glue, not a
 * business-logic try/catch: it exists purely so route handlers can stay
 * `async` and simply `throw`, letting the single error-handling middleware
 * (see middleware/errorHandler.ts) decide how to respond.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
