import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@karate/types";
import { AuthenticationError, AuthorizationError } from "@karate/shared";
import { prisma } from "@karate/database";

/** Requires the authenticated user to hold at least one of the given application roles. */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }
    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      next(new AuthorizationError(`Requires one of roles: ${allowedRoles.join(", ")}.`));
      return;
    }
    next();
  };
}

/**
 * Organization-level authorization: confirms the authenticated user
 * administers the academy named by `:academyId` in the route params. This
 * runs a DB check per request by design — role claims in the JWT are global
 * (PLAYER/COACH/ACADEMY/SCORER), but "which academy can this user manage"
 * is per-resource and must never be inferred from the token alone (that
 * would allow one academy admin to act on another academy's data — a
 * classic IDOR/BOLA hole).
 */
export function requireAcademyAdministrator() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        next(new AuthenticationError());
        return;
      }
      const academyId = req.params["academyId"];
      if (!academyId) {
        next(new AuthorizationError("Missing academy context."));
        return;
      }
      const membership = await prisma.academyAdministrator.findUnique({
        where: { academyId_userId: { academyId, userId: req.user.id } },
      });
      if (!membership) {
        next(new AuthorizationError("You do not administer this academy."));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
