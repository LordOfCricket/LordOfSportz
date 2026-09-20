import { prisma } from "@karate/database";
import type { CreateScorerProfileRequest, UpdateScorerProfileRequest } from "@karate/validation";
import { ConflictError, NotFoundError } from "@karate/shared";

function findByUserId(userId: string) {
  return prisma.scorerProfile.findUnique({ where: { userId } });
}

type ScorerProfileRow = NonNullable<Awaited<ReturnType<typeof findByUserId>>>;

function toDto(profile: ScorerProfileRow) {
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    photoUrl: profile.photoUrl,
    certificationLevel: profile.certificationLevel,
    status: profile.status,
    verificationStatus: profile.verificationStatus,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export async function createProfile(userId: string, input: CreateScorerProfileRequest) {
  const existing = await findByUserId(userId);
  if (existing) {
    throw new ConflictError("A scorer profile already exists for this account.");
  }

  const profile = await prisma.scorerProfile.create({
    data: {
      userId,
      displayName: input.displayName,
      photoUrl: input.photoUrl,
      certificationLevel: input.certificationLevel,
    },
  });
  return toDto(profile);
}

export async function getMyProfile(userId: string) {
  const profile = await findByUserId(userId);
  if (!profile) {
    throw new NotFoundError("Scorer profile");
  }
  return toDto(profile);
}

export async function updateProfile(userId: string, input: UpdateScorerProfileRequest) {
  const existing = await findByUserId(userId);
  if (!existing) {
    throw new NotFoundError("Scorer profile");
  }

  const profile = await prisma.scorerProfile.update({
    where: { userId },
    data: {
      displayName: input.displayName,
      photoUrl: input.photoUrl,
      certificationLevel: input.certificationLevel,
    },
  });
  return toDto(profile);
}
