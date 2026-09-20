import { prisma } from "@karate/database";
import type { ListTournamentsQuery, TransitionTournamentStatusRequest } from "@karate/validation";
import { AuthorizationError, NotFoundError } from "@karate/shared";
import { assertValidTournamentTransition } from "../../domain/tournamentLifecycle";

const TOURNAMENT_SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  venue: true,
  countryCode: true,
  status: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  startDate: true,
  endDate: true,
} as const;

/** Public browse list — no private organizer detail, paginated, indexed on `status`. */
export async function listPublicTournaments(query: ListTournamentsQuery) {
  const where = query.status ? { status: query.status } : {};
  const [items, totalItems] = await Promise.all([
    prisma.tournament.findMany({
      where,
      select: TOURNAMENT_SUMMARY_SELECT,
      orderBy: { startDate: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.tournament.count({ where }),
  ]);
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize),
  };
}

/** Public detail — includes competitions/categories so a player can pick one to register into. */
export async function getTournamentDetail(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      ...TOURNAMENT_SUMMARY_SELECT,
      description: true,
      competitions: {
        select: {
          id: true,
          discipline: true,
          name: true,
          category: {
            select: {
              id: true,
              name: true,
              genderRestriction: true,
              ageMin: true,
              ageMax: true,
              weightMinKg: true,
              weightMaxKg: true,
            },
          },
        },
      },
    },
  });
  if (!tournament) {
    throw new NotFoundError("Tournament", tournamentId);
  }
  return tournament;
}

/**
 * Loads the tournament together with the organizer chain needed for
 * authorization. Kept as one query (not split into "load" + "authorize"
 * middleware) because the authorization check itself needs the tournament's
 * organizer->academy chain, which only exists once this row is fetched —
 * fetching it twice would be wasted work for no safety benefit.
 */
export async function getTournamentWithOrganizer(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organizer: { include: { academy: true } } },
  });
  if (!tournament) {
    throw new NotFoundError("Tournament", tournamentId);
  }
  return tournament;
}

/**
 * Organization-level authorization for tournament management, mirroring
 * `requireAcademyAdministrator` but reached through Tournament -> organizer
 * -> academy instead of a direct `:academyId` route param. A user's global
 * ACADEMY role claim is never sufficient on its own — this always checks a
 * concrete AcademyAdministrator row for the academy that actually organizes
 * this specific tournament.
 */
export async function assertUserCanManageTournament(
  tournament: Awaited<ReturnType<typeof getTournamentWithOrganizer>>,
  userId: string,
): Promise<void> {
  const academyId = tournament.organizer.academyId;
  if (!academyId) {
    // Non-academy organizer types (FEDERATION/ASSOCIATION/OTHER) have no
    // authorization path implemented yet — see ADR-0001. Fail closed.
    throw new AuthorizationError("This tournament's organizer type does not support management yet.");
  }

  const membership = await prisma.academyAdministrator.findUnique({
    where: { academyId_userId: { academyId, userId } },
  });
  if (!membership) {
    throw new AuthorizationError("You do not administer this tournament's organizing academy.");
  }
}

export async function transitionTournamentStatus(
  tournamentId: string,
  userId: string,
  input: TransitionTournamentStatusRequest,
) {
  const tournament = await getTournamentWithOrganizer(tournamentId);
  await assertUserCanManageTournament(tournament, userId);
  assertValidTournamentTransition(tournament.status, input.status);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: input.status },
    });
    await tx.tournamentStatusHistory.create({
      data: {
        tournamentId,
        fromStatus: tournament.status,
        toStatus: input.status,
        changedByUserId: userId,
        reason: input.reason,
      },
    });
    return updated;
  });
}
