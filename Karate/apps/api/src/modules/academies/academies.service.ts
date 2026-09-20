import { prisma } from "@karate/database";
import type {
  AcademySearchQuery,
  CreateAcademyRequest,
  CreateMembershipRequest,
  MembershipRequestAction,
  UpdateAcademyRequest,
} from "@karate/validation";
import { ConflictError, NotFoundError } from "@karate/shared";

const ACADEMY_SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  countryCode: true,
  city: true,
  logoUrl: true,
  status: true,
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createAcademy(ownerUserId: string, input: CreateAcademyRequest) {
  const baseSlug = slugify(input.name);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  return prisma.academy.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      countryCode: input.countryCode,
      city: input.city,
      createdById: ownerUserId,
      administrators: { create: [{ userId: ownerUserId, role: "OWNER" }] },
    },
  });
}

export async function searchAcademies(query: AcademySearchQuery) {
  const where = {
    status: "ACTIVE" as const,
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.academy.findMany({
      where,
      select: ACADEMY_SUMMARY_SELECT,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.academy.count({ where }),
  ]);

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize),
  };
}

export async function getAcademyById(academyId: string) {
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: ACADEMY_SUMMARY_SELECT,
  });
  if (!academy) {
    throw new NotFoundError("Academy", academyId);
  }
  const [playerCount, coachCount] = await Promise.all([
    prisma.academyPlayerMembership.count({ where: { academyId, status: "ACTIVE" } }),
    prisma.academyCoachAffiliation.count({ where: { academyId, status: "ACTIVE" } }),
  ]);
  return { ...academy, playerCount, coachCount };
}

/** Academies the authenticated user administers (owns or is an admin of). */
export async function listMyAcademies(userId: string) {
  const admins = await prisma.academyAdministrator.findMany({
    where: { userId },
    include: { academy: { select: ACADEMY_SUMMARY_SELECT } },
  });
  return admins.map((a) => ({ ...a.academy, adminRole: a.role }));
}

export async function updateAcademy(academyId: string, input: UpdateAcademyRequest) {
  const academy = await prisma.academy.findUnique({ where: { id: academyId } });
  if (!academy) {
    throw new NotFoundError("Academy", academyId);
  }
  const updated = await prisma.academy.update({
    where: { id: academyId },
    data: {
      name: input.name,
      description: input.description,
      countryCode: input.countryCode,
      city: input.city,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
    },
    select: ACADEMY_SUMMARY_SELECT,
  });
  return updated;
}

/**
 * Coach/player self-service request to join an academy. Which profile
 * (coach vs player) drives the request is derived from the CALLER's own
 * profile — never from client-supplied ids — so a user can only ever
 * request membership on their own behalf.
 */
export async function createMembershipRequest(
  academyId: string,
  userId: string,
  input: CreateMembershipRequest,
) {
  const academy = await prisma.academy.findUnique({ where: { id: academyId } });
  if (!academy) {
    throw new NotFoundError("Academy", academyId);
  }

  const [coachProfile, playerProfile] = await Promise.all([
    prisma.coachProfile.findUnique({ where: { userId } }),
    prisma.playerProfile.findUnique({ where: { userId } }),
  ]);

  const target = coachProfile
    ? {
        targetType: "COACH" as const,
        initiatedBy: "COACH" as const,
        coachId: coachProfile.id,
        playerId: undefined,
      }
    : playerProfile
      ? {
          targetType: "PLAYER" as const,
          initiatedBy: "PLAYER" as const,
          playerId: playerProfile.id,
          coachId: undefined,
        }
      : null;

  if (!target) {
    throw new ConflictError("Create your player or coach profile before requesting to join an academy.");
  }

  const existingPending = await prisma.academyMembershipRequest.findFirst({
    where: {
      academyId,
      status: "PENDING",
      targetType: target.targetType,
      ...(target.coachId ? { coachId: target.coachId } : { playerId: target.playerId }),
    },
  });
  if (existingPending) {
    throw new ConflictError("You already have a pending request for this academy.");
  }

  try {
    return await prisma.academyMembershipRequest.create({
      data: { academyId, message: input.message, ...target },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("You already have a pending request for this academy.");
    }
    throw error;
  }
}

/** Active player members — used to populate pickers (e.g. grading participants) without exposing raw ids to the client. */
export async function listActivePlayers(academyId: string) {
  const memberships = await prisma.academyPlayerMembership.findMany({
    where: { academyId, status: "ACTIVE" },
    include: { player: { select: { id: true, displayName: true } } },
  });
  return memberships.map((m) => m.player);
}

/** Pending requests an academy administrator needs to act on. */
export async function listPendingMembershipRequests(academyId: string) {
  const requests = await prisma.academyMembershipRequest.findMany({
    where: { academyId, status: "PENDING" },
    include: {
      player: { select: { id: true, displayName: true } },
      coach: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return requests.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    initiatedBy: r.initiatedBy,
    message: r.message,
    createdAt: r.createdAt,
    applicant: r.targetType === "PLAYER" ? r.player : r.coach,
  }));
}

/**
 * Accept/reject a pending coach or player membership request. On accept,
 * this creates the corresponding historical membership/affiliation row
 * rather than mutating anything in place, per the "membership history must
 * never be destroyed" requirement.
 */
export async function resolveMembershipRequest(
  academyId: string,
  respondingUserId: string,
  input: MembershipRequestAction,
) {
  const request = await prisma.academyMembershipRequest.findUnique({ where: { id: input.requestId } });
  if (!request || request.academyId !== academyId) {
    throw new NotFoundError("Membership request", input.requestId);
  }
  if (request.status !== "PENDING") {
    throw new ConflictError(`Membership request is already ${request.status}.`);
  }

  const newStatus = input.action === "ACCEPT" ? "ACCEPTED" : "REJECTED";

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.academyMembershipRequest.update({
        where: { id: request.id },
        data: { status: newStatus, respondedByUserId: respondingUserId, respondedAt: new Date() },
      });

      if (input.action === "REJECT") {
        return { request, membership: null };
      }

      if (request.targetType === "PLAYER" && request.playerId) {
        const membership = await tx.academyPlayerMembership.create({
          data: {
            academyId,
            playerId: request.playerId,
            status: "ACTIVE",
            respondedAt: new Date(),
            startedAt: new Date(),
          },
        });
        return { request, membership };
      }

      if (request.targetType === "COACH" && request.coachId) {
        const membership = await tx.academyCoachAffiliation.create({
          data: {
            academyId,
            coachId: request.coachId,
            status: "ACTIVE",
            respondedAt: new Date(),
            startedAt: new Date(),
          },
        });
        return { request, membership };
      }

      throw new ConflictError("Membership request is missing a target coach/player.");
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("This person already has an active membership at this academy.");
    }
    throw error;
  }
}
