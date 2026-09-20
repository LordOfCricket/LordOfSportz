import { prisma } from "@karate/database";
import type { CreatePlayerProfileRequest, UpdatePlayerProfileRequest } from "@karate/validation";
import { ConflictError, NotFoundError } from "@karate/shared";
import { getBeltHistoryForPlayer } from "../grading/beltHistory.service";

const PROFILE_INCLUDE = { primaryStyle: true, styles: true } as const;

type PlayerProfileWithRelations = NonNullable<Awaited<ReturnType<typeof findByUserId>>>;

/** Never return the raw Prisma row — this is the one place the response shape is decided. */
function toDto(profile: PlayerProfileWithRelations) {
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    photoUrl: profile.photoUrl,
    bio: profile.bio,
    status: profile.status,
    primaryStyle: profile.primaryStyle
      ? { id: profile.primaryStyle.id, name: profile.primaryStyle.name }
      : null,
    styles: profile.styles.map((s) => ({ id: s.id, name: s.name })),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function findByUserId(userId: string) {
  return prisma.playerProfile.findUnique({ where: { userId }, include: PROFILE_INCLUDE });
}

export async function createProfile(userId: string, input: CreatePlayerProfileRequest) {
  const existing = await findByUserId(userId);
  if (existing) {
    throw new ConflictError("A player profile already exists for this account.");
  }

  const profile = await prisma.playerProfile.create({
    data: {
      userId,
      displayName: input.displayName,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      photoUrl: input.photoUrl,
      bio: input.bio,
      primaryStyleId: input.primaryStyleId,
      styles: input.styleIds ? { connect: input.styleIds.map((id) => ({ id })) } : undefined,
    },
    include: PROFILE_INCLUDE,
  });
  return toDto(profile);
}

export async function getMyProfile(userId: string) {
  const profile = await findByUserId(userId);
  if (!profile) {
    throw new NotFoundError("Player profile");
  }
  return toDto(profile);
}

/** Academy membership history for the authenticated player (all statuses, newest first). */
export async function listMyMemberships(userId: string) {
  const profile = await findByUserId(userId);
  if (!profile) {
    throw new NotFoundError("Player profile");
  }
  const memberships = await prisma.academyPlayerMembership.findMany({
    where: { playerId: profile.id },
    include: { academy: { select: { id: true, name: true, slug: true, logoUrl: true } } },
    orderBy: { requestedAt: "desc" },
  });
  return memberships.map((m) => ({
    id: m.id,
    status: m.status,
    academy: m.academy,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    requestedAt: m.requestedAt,
  }));
}

/** Requests this player has sent that are still awaiting an academy's decision. */
export async function listMyPendingRequests(userId: string) {
  const profile = await findByUserId(userId);
  if (!profile) {
    throw new NotFoundError("Player profile");
  }
  const requests = await prisma.academyMembershipRequest.findMany({
    where: { playerId: profile.id, status: "PENDING" },
    include: { academy: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
  return requests.map((r) => ({ id: r.id, academy: r.academy, message: r.message, createdAt: r.createdAt }));
}

/** The player's own current grade + full history — reuses the grading domain's read logic, no duplication. */
export async function getMyBeltHistory(userId: string) {
  const profile = await findByUserId(userId);
  if (!profile) {
    throw new NotFoundError("Player profile");
  }
  return getBeltHistoryForPlayer(profile.id);
}

export async function updateProfile(userId: string, input: UpdatePlayerProfileRequest) {
  const existing = await findByUserId(userId);
  if (!existing) {
    throw new NotFoundError("Player profile");
  }

  const profile = await prisma.playerProfile.update({
    where: { userId },
    data: {
      displayName: input.displayName,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      photoUrl: input.photoUrl,
      bio: input.bio,
      primaryStyleId: input.primaryStyleId,
      styles: input.styleIds ? { set: input.styleIds.map((id) => ({ id })) } : undefined,
    },
    include: PROFILE_INCLUDE,
  });
  return toDto(profile);
}
