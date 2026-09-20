import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadServerEnv } from "@karate/config";
import { createLogger } from "@karate/logger";
import { prisma } from "@karate/database";
import { createApp } from "../src/app";

export function buildTestApp() {
  const env = loadServerEnv();
  const logger = createLogger({ serviceName: "karate-api-test", environment: "test", level: "silent" });
  return createApp(env, logger);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

const TEST_PASSWORD = "TestPassword1234";

/**
 * Registers a fresh user and returns its tokens. Deliberately does NOT also
 * call /login afterwards — register already returns a valid token pair, and
 * calling login too would create a second, independent refresh-session
 * family for the same user (a separate "device session", by design), which
 * would make session-lifecycle tests ambiguous about which family they're
 * asserting against. Dedicated login-flow tests call /login directly.
 */
export async function registerAndLogin(
  app: ReturnType<typeof buildTestApp>,
  role: "PLAYER" | "COACH" | "ACADEMY" | "SCORER",
) {
  const email = uniqueEmail(role.toLowerCase());

  const registerRes = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: TEST_PASSWORD, fullName: `Test ${role}`, role });

  return {
    email,
    accessToken: registerRes.body.data.accessToken as string,
    refreshToken: registerRes.body.data.refreshToken as string,
    userId: registerRes.body.data.userId as string,
  };
}

/** Creates an academy administered by the given user, with a TournamentOrganizer, for tournament tests. */
export async function createAcademyWithOrganizer(ownerUserId: string) {
  const academy = await prisma.academy.create({
    data: {
      name: "Test Academy",
      slug: `test-academy-${randomUUID()}`,
      status: "ACTIVE",
      createdById: ownerUserId,
      administrators: { create: [{ userId: ownerUserId, role: "OWNER" }] },
    },
  });
  const organizer = await prisma.tournamentOrganizer.create({
    data: { organizerType: "ACADEMY", academyId: academy.id },
  });
  return { academy, organizer };
}

export async function createDraftTournament(organizerId: string, createdByUserId: string) {
  return prisma.tournament.create({
    data: {
      organizerId,
      name: "Test Tournament",
      slug: `test-tournament-${randomUUID()}`,
      status: "DRAFT",
      createdByUserId,
    },
  });
}

/**
 * Creates a tournament already in REGISTRATION_OPEN with one category and
 * one competition, for registration tests — seeded directly via Prisma
 * (bypassing the lifecycle transition endpoint) since test setup is allowed
 * to establish arbitrary starting states, unlike application code.
 */
export async function createOpenTournamentWithCategory(
  organizerId: string,
  createdByUserId: string,
  overrides?: { registrationOpensAt?: Date; registrationClosesAt?: Date },
) {
  const tournament = await prisma.tournament.create({
    data: {
      organizerId,
      name: "Open Tournament",
      slug: `open-tournament-${randomUUID()}`,
      status: "REGISTRATION_OPEN",
      registrationOpensAt: overrides?.registrationOpensAt,
      registrationClosesAt: overrides?.registrationClosesAt,
      createdByUserId,
    },
  });
  const category = await prisma.category.create({
    data: { tournamentId: tournament.id, name: "Senior -75kg" },
  });
  const competition = await prisma.competition.create({
    data: { tournamentId: tournament.id, categoryId: category.id, discipline: "KUMITE", name: "Kumite Senior -75kg" },
  });
  return { tournament, category, competition };
}

/** Awards a player a VERIFIED, isCurrent belt grade directly, for tests that need a resolvable "verified current grade". */
export async function createVerifiedBeltForPlayer(playerId: string) {
  const style = await prisma.karateStyle.create({ data: { name: `Style-${randomUUID()}` } });
  const beltSystem = await prisma.beltSystem.create({
    data: { karateStyleId: style.id, name: `System-${randomUUID()}` },
  });
  const beltGrade = await prisma.beltGrade.create({
    data: { beltSystemId: beltSystem.id, name: "1st Kyu", type: "KYU", rankOrder: 1 },
  });
  await prisma.playerBeltHistory.create({
    data: {
      playerId,
      beltGradeId: beltGrade.id,
      awardedDate: new Date(),
      verificationStatus: "VERIFIED",
      isCurrent: true,
    },
  });
  return beltGrade;
}
