import { z } from "zod";
import { TOURNAMENT_STATUSES } from "@karate/types";
import { paginationQuerySchema, uuidSchema } from "./academy";

export const tournamentIdParamsSchema = z.object({
  tournamentId: uuidSchema,
});
export type TournamentIdParams = z.infer<typeof tournamentIdParamsSchema>;

/** Public browse/search — status defaults to REGISTRATION_OPEN, the only state a player needs to discover. */
export const listTournamentsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(TOURNAMENT_STATUSES).optional(),
});
export type ListTournamentsQuery = z.infer<typeof listTournamentsQuerySchema>;

export const transitionTournamentStatusSchema = z.object({
  status: z.enum(TOURNAMENT_STATUSES),
  reason: z.string().trim().min(1).max(500).optional(),
});
export type TransitionTournamentStatusRequest = z.infer<typeof transitionTournamentStatusSchema>;
