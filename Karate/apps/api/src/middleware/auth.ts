import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@karate/types";
import { AuthenticationError } from "@karate/shared";
import { loadServerEnv } from "@karate/config";

export interface AuthenticatedUser {
  id: string;
  roles: UserRole[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface AccessTokenPayload {
  sub: string;
  roles: UserRole[];
}

/**
 * Verifies the bearer access token and attaches the authenticated user to
 * the request. Role/organization claims are read ONLY from the verified
 * token — never from a client-supplied header or body field — because all
 * authorization decisions must be server-side and tamper-proof.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    next(new AuthenticationError("Missing bearer token."));
    return;
  }

  try {
    const env = loadServerEnv();
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    req.user = { id: payload.sub, roles: payload.roles };
    next();
  } catch {
    next(new AuthenticationError("Invalid or expired access token."));
  }
}

/** Like `authenticate`, but does not fail when no token is present. */
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  if (!req.header("authorization")) {
    next();
    return;
  }
  authenticate(req, res, next);
}
