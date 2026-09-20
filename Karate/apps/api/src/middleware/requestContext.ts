import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { HTTP_HEADER_REQUEST_ID } from "@karate/constants";
import { withRequestId, type Logger } from "@karate/logger";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
    }
  }
}

/**
 * Assigns a correlation ID to every request (reusing an inbound one if a
 * trusted upstream proxy already set it) and attaches a child logger that
 * carries it on every log line for the lifetime of the request.
 */
export function requestContext(baseLogger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const inboundId = req.header(HTTP_HEADER_REQUEST_ID);
    const requestId = inboundId && inboundId.length <= 100 ? inboundId : randomUUID();

    req.requestId = requestId;
    req.log = withRequestId(baseLogger, requestId);
    res.setHeader(HTTP_HEADER_REQUEST_ID, requestId);
    next();
  };
}
