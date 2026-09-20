import type { NextFunction, Request, Response } from "express";
import { NotFoundError } from "@karate/shared";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError("Route", `${req.method} ${req.path}`));
}
