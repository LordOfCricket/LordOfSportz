import type { NextFunction, Request, Response } from "express";

/** Logs one line per completed request with method, path, status, and duration. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    req.log.info(
      { method: req.method, path: req.path, statusCode: res.statusCode, durationMs: Math.round(durationMs) },
      "request completed",
    );
  });

  next();
}
