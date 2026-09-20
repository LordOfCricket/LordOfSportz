import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import type { Logger } from "@karate/logger";
import { prisma } from "@karate/database";
import { loadServerEnv } from "@karate/config";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";

export type RealtimeRoomType = "tournament" | "competition" | "tatami" | "bout" | "user";

export type RealtimeEventType =
  | "BOUT_CALLED"
  | "BOUT_STATE_UPDATED"
  | "SCORE_UPDATED"
  | "TIMER_UPDATED"
  | "KUMITE_STATE_UPDATED"
  | "KATA_STATE_UPDATED"
  | "RESULT_FINALIZED"
  | "TATAMI_STATUS_CHANGED"
  | "SCHEDULE_CHANGED"
  | "OFFICIAL_ASSIGNMENT_CHANGED";

export interface RealtimeEventInput {
  eventType: RealtimeEventType;
  entityType: string;
  entityId: string;
  tournamentId?: string;
  competitionId?: string;
  tatamiId?: string;
  sequence?: number;
  occurredAt?: string | Date;
  payload?: Record<string, unknown>;
  actorUserId?: string;
}

export interface RealtimeEvent extends RealtimeEventInput {
  eventId: string;
  occurredAt: string;
  sequence: number;
}

let ioServer: Server | null = null;

export function issueRealtimeToken(userId: string): string {
  const env = loadServerEnv();
  return jwt.sign({ sub: userId, roles: ["REALTIME"] }, env.JWT_ACCESS_SECRET, { expiresIn: "60s" });
}

function roomKey(roomType: RealtimeRoomType, roomId: string) {
  return `${roomType}:${roomId}`;
}

async function isTournamentManager(userId: string, tournamentId: string): Promise<boolean> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organizer: { include: { academy: { include: { administrators: { where: { userId }, select: { userId: true } } } } } } },
  });
  return Boolean(tournament?.organizer.academyId && tournament.organizer.academy?.administrators.length);
}

function getTokenFromSocket(socket: {
  handshake: {
    auth?: Record<string, unknown>;
    headers?: Record<string, unknown>;
  };
}) {
  const authMap = socket.handshake.auth as Record<string, unknown> | undefined;
  const authToken = authMap && Object.prototype.hasOwnProperty.call(authMap, "token") ? authMap["token"] : undefined;
  if (typeof authToken === "string") return authToken;

  const headerMap = socket.handshake.headers as Record<string, unknown> | undefined;
  const headerValue = headerMap && Object.prototype.hasOwnProperty.call(headerMap, "authorization") ? headerMap["authorization"] : undefined;
  if (typeof headerValue === "string" && headerValue.startsWith("Bearer ")) {
    return headerValue.slice("Bearer ".length);
  }
  return null;
}

async function authorizeRoomForUser(userId: string, roomType: RealtimeRoomType, roomId: string): Promise<boolean> {
  if (roomType === "user") {
    return userId === roomId;
  }

  if (roomType === "tournament") {
    if (await isTournamentManager(userId, roomId)) return true;
    const scorerAssignment = await prisma.officialAssignment.findFirst({
      where: { tournamentId: roomId, scorerProfile: { userId }, status: { in: ["ASSIGNED", "CONFIRMED"] } },
      select: { id: true },
    });
    return Boolean(scorerAssignment);
  }

  if (roomType === "competition") {
    const competition = await prisma.competition.findUnique({ where: { id: roomId } });
    if (!competition) return false;
    const assignment = await prisma.officialAssignment.findFirst({
      where: {
        tournamentId: competition.tournamentId,
        OR: [{ competitionId: null }, { competitionId: competition.id }],
        status: { in: ["ASSIGNED", "CONFIRMED"] },
        scorerProfile: { userId },
      },
      select: { id: true },
    });
    return Boolean(assignment) || (await isTournamentManager(userId, competition.tournamentId));
  }

  if (roomType === "tatami") {
    const tatami = await prisma.tatami.findUnique({ where: { id: roomId }, select: { id: true, tournamentId: true } });
    if (!tatami) return false;
    const assignment = await prisma.officialAssignment.findFirst({
      where: {
        tournamentId: tatami.tournamentId,
        OR: [{ tatamiId: null }, { tatamiId: tatami.id }],
        status: { in: ["ASSIGNED", "CONFIRMED"] },
        scorerProfile: { userId },
      },
      select: { id: true },
    });
    return Boolean(assignment) || (await isTournamentManager(userId, tatami.tournamentId));
  }

  if (roomType === "bout") {
    const bout = await prisma.bout.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        redPlayerId: true,
        bluePlayerId: true,
        tatamiId: true,
        round: { select: { draw: { select: { competition: { select: { tournamentId: true, id: true } } } } } },
      },
    });
    if (!bout) return false;
    if (bout.redPlayerId || bout.bluePlayerId) {
      const playerProfile = await prisma.playerProfile.findUnique({ where: { userId } });
      if (playerProfile && (bout.redPlayerId === playerProfile.id || bout.bluePlayerId === playerProfile.id)) {
        return true;
      }
    }
    const official = await prisma.officialAssignment.findFirst({
      where: {
        tournamentId: bout.round.draw.competition.tournamentId,
        AND: [
          { OR: [{ competitionId: null }, { competitionId: bout.round.draw.competition.id }] },
          { OR: [{ tatamiId: null }, { tatamiId: bout.tatamiId }] },
        ],
        status: { in: ["ASSIGNED", "CONFIRMED"] },
        scorerProfile: { userId },
      },
      select: { id: true },
    });
    if (official) return true;
    return await isTournamentManager(userId, bout.round.draw.competition.tournamentId);
  }

  return false;
}

export function getRealtimeServer(): Server | null {
  return ioServer;
}

export function createRealtimeServer(httpServer: HttpServer, logger: Logger): Server {
  if (ioServer) return ioServer;

  const env = loadServerEnv();
  ioServer = new Server(httpServer, {
    cors: { origin: env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.split(",").map((entry) => entry.trim()).filter(Boolean) : true, credentials: true },
    transports: ["websocket", "polling"],
  });

  ioServer.use(async (socket, next) => {
    const token = getTokenFromSocket(socket);
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub?: unknown; roles?: unknown };
      if (typeof payload.sub !== "string" || !Array.isArray(payload.roles) || !payload.roles.every((role): role is string => typeof role === "string")) throw new Error("invalid socket claims");
      socket.data.user = { id: payload.sub, roles: payload.roles };
      next();
    } catch {
      next(new Error("Invalid or expired access token"));
    }
  });

  ioServer.on("connection", (socket) => {
    logger.info({ userId: socket.data.user?.id }, "socket connected");

    socket.on("subscribe", async (payload: { roomType?: RealtimeRoomType; roomId?: string }, callback) => {
      if (!payload?.roomType || !payload.roomId) {
        callback?.({ ok: false, message: "roomType and roomId are required" });
        return;
      }

      const userId = socket.data.user?.id;
      if (!userId) {
        callback?.({ ok: false, message: "Authentication required" });
        return;
      }

      const authorized = await authorizeRoomForUser(userId, payload.roomType, payload.roomId);
      if (!authorized) {
        callback?.({ ok: false, message: "Unauthorized room subscription" });
        return;
      }

      const room = roomKey(payload.roomType, payload.roomId);
      socket.join(room);
      callback?.({ ok: true, room });
    });

    socket.on("unsubscribe", (payload: { roomType?: RealtimeRoomType; roomId?: string }, callback) => {
      if (!payload?.roomType || !payload.roomId) {
        callback?.({ ok: false });
        return;
      }
      socket.leave(roomKey(payload.roomType, payload.roomId));
      callback?.({ ok: true });
    });

    socket.on("disconnect", (reason) => {
      logger.info({ userId: socket.data.user?.id, reason }, "socket disconnected");
    });
  });

  return ioServer;
}

export function closeRealtimeServer(): Promise<void> {
  if (!ioServer) return Promise.resolve();
  const current = ioServer;
  ioServer = null;
  return new Promise((resolve) => current.close(() => resolve()));
}

export function emitCompetitionEvent(event: RealtimeEventInput): RealtimeEvent {
  if (!ioServer) return { ...event, eventId: randomUUID(), occurredAt: new Date().toISOString(), sequence: event.sequence ?? Date.now() };

  const normalized: RealtimeEvent = {
    eventId: randomUUID(),
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    tournamentId: event.tournamentId,
    competitionId: event.competitionId,
    tatamiId: event.tatamiId,
    sequence: event.sequence ?? Date.now(),
    occurredAt: new Date(event.occurredAt ?? Date.now()).toISOString(),
    payload: event.payload ?? {},
    actorUserId: event.actorUserId,
  };

  const targets = new Set<string>();
  if (normalized.tournamentId) targets.add(roomKey("tournament", normalized.tournamentId));
  if (normalized.competitionId) targets.add(roomKey("competition", normalized.competitionId));
  if (normalized.tatamiId) targets.add(roomKey("tatami", normalized.tatamiId));
  targets.add(roomKey("bout", normalized.entityId));
  if (normalized.actorUserId) targets.add(roomKey("user", normalized.actorUserId));

  for (const room of targets) {
    ioServer.to(room).emit("event", normalized);
  }

  return normalized;
}
