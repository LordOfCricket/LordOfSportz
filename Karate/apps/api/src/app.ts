import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import type { Logger } from "@karate/logger";
import { getCorsAllowedOrigins, type ServerEnv } from "@karate/config";
import { requestContext } from "./middleware/requestContext";
import { requestLogger } from "./middleware/requestLogger";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./modules/health/health.routes";
import { academiesRouter } from "./modules/academies/academies.routes";
import { tournamentsRouter } from "./modules/tournaments/tournaments.routes";
import { playersRouter } from "./modules/players/players.routes";
import { coachesRouter } from "./modules/coaches/coaches.routes";
import { scorersRouter } from "./modules/scorers/scorers.routes";
import { beltSystemsRouter } from "./modules/grading/beltSystems.routes";
import { academyGradingEventsRouter, gradingEventsRouter } from "./modules/grading/gradingEvents.routes";
import { beltHistoryRouter, academyPendingVerificationsRouter } from "./modules/grading/beltHistory.routes";
import { certificatesRouter } from "./modules/grading/certificates.routes";
import {
  registrationsRouter,
  coachStudentsRegistrationsRouter,
  academyRegistrationsRouter,
} from "./modules/registrations/registrations.routes";
import { competitionDrawRouter, drawsRouter } from "./modules/draws/draws.routes";
import {
  tournamentScheduleRouter,
  schedulesRouter,
  playerScheduleRouter,
  coachStudentsScheduleRouter,
  academyScheduleRouter,
} from "./modules/scheduling/scheduling.routes";
import { tournamentTatamisRouter, tatamisRouter, boutsRouter } from "./modules/tatamis/tatamis.routes";
import {
  tournamentOfficialsRouter,
  officialAssignmentsRouter,
  scorerAssignmentsRouter,
} from "./modules/officials/officials.routes";
import {
  boutLifecycleRouter,
  playerBoutsRouter,
  coachStudentsBoutsRouter,
  academyBoutsRouter,
} from "./modules/bouts/bouts.routes";
import { kumiteRouter } from "./modules/kumite/kumite.routes";
import {
  kataRouter,
  kataDefinitionsRouter,
  kataStandingsRouter,
  kataTeamsRouter,
  kataTeamBoutsRouter,
} from "./modules/kata/kata.routes";
import { playerResultsRouter, tournamentStatsRouter, academyStatsRouter, coachStatsRouter, rankingsRouter } from "./modules/stats/stats.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { protestsRouter, incidentsRouter } from "./modules/platform/platform.routes";
import { searchRouter } from "./modules/search/search.routes";

export function createApp(env: ServerEnv, logger: Logger): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: getCorsAllowedOrigins(env), credentials: true }));
  app.use(requestContext(logger));
  app.use(express.json({ limit: "1mb" }));
  app.set("trust proxy", env.NODE_ENV === "production");
  app.use(requestLogger);

  app.use("/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/academies", academiesRouter);
  app.use("/api/v1/tournaments", tournamentsRouter);
  app.use("/api/v1/players", playersRouter);
  app.use("/api/v1/coaches", coachesRouter);
  app.use("/api/v1/scorers", scorersRouter);
  app.use("/api/v1/grading/belt-systems", beltSystemsRouter);
  app.use("/api/v1/academies/:academyId/grading-events", academyGradingEventsRouter);
  app.use("/api/v1/grading-events", gradingEventsRouter);
  app.use("/api/v1/grading/belt-history", beltHistoryRouter);
  app.use("/api/v1/academies/:academyId/pending-verifications", academyPendingVerificationsRouter);
  app.use("/api/v1/grading/certificates", certificatesRouter);
  app.use("/api/v1/registrations", registrationsRouter);
  app.use("/api/v1/coaches/me/students-registrations", coachStudentsRegistrationsRouter);
  app.use("/api/v1/academies/:academyId/registrations", academyRegistrationsRouter);
  app.use("/api/v1/competitions/:competitionId/draw", competitionDrawRouter);
  app.use("/api/v1/draws", drawsRouter);
  app.use("/api/v1/tournaments/:tournamentId/schedule", tournamentScheduleRouter);
  app.use("/api/v1/schedules", schedulesRouter);
  app.use("/api/v1/players/me/schedule", playerScheduleRouter);
  app.use("/api/v1/coaches/me/students-schedule", coachStudentsScheduleRouter);
  app.use("/api/v1/academies/:academyId/schedule", academyScheduleRouter);
  app.use("/api/v1/tournaments/:tournamentId/tatamis", tournamentTatamisRouter);
  app.use("/api/v1/tatamis", tatamisRouter);
  app.use("/api/v1/bouts", boutsRouter);
  app.use("/api/v1/bouts", boutLifecycleRouter);
  app.use("/api/v1/bouts/:boutId/kumite", kumiteRouter);
  app.use("/api/v1/bouts/:boutId/kata", kataRouter);
  app.use("/api/v1/kata-definitions", kataDefinitionsRouter);
  app.use("/api/v1/draws/:drawId/kata-standings", kataStandingsRouter);
  app.use("/api/v1/kata-teams", kataTeamsRouter);
  app.use("/api/v1/competitions/:competitionId/kata/team-bouts", kataTeamBoutsRouter);
  app.use("/api/v1/tournaments/:tournamentId/officials", tournamentOfficialsRouter);
  app.use("/api/v1/official-assignments", officialAssignmentsRouter);
  app.use("/api/v1/scorers/me/assignments", scorerAssignmentsRouter);
  app.use("/api/v1/players/me/bouts", playerBoutsRouter);
  app.use("/api/v1/coaches/me/students-bouts", coachStudentsBoutsRouter);
  app.use("/api/v1/academies/:academyId/bouts", academyBoutsRouter);
  app.use("/api/v1/players/me", playerResultsRouter);
  app.use("/api/v1/coaches/me", coachStatsRouter);
  app.use("/api/v1/tournaments/:tournamentId", tournamentStatsRouter);
  app.use("/api/v1/academies/:academyId", academyStatsRouter);
  app.use("/api/v1/rankings", rankingsRouter);
  app.use("/api/v1/notifications", notificationsRouter);
  app.use("/api/v1/protests", protestsRouter);
  app.use("/api/v1/incidents", incidentsRouter);
  app.use("/api/v1/search", searchRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
