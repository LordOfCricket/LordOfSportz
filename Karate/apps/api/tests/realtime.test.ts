import { createServer } from "node:http";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as Client } from "socket.io-client";
import { loadServerEnv } from "@karate/config";
import { createLogger } from "@karate/logger";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app";
import { createRealtimeServer } from "../src/lib/realtime";
import { createAcademyWithOrganizer, createDraftTournament, registerAndLogin } from "./helpers";

describe("realtime socket flow", () => {
  let httpServer: ReturnType<typeof createServer>;
  let url: string;

  beforeAll(async () => {
    const env = loadServerEnv();
    const logger = createLogger({ serviceName: "karate-api-realtime-test", environment: "test", level: "silent" });
    const app = createApp(env, logger);
    httpServer = createServer(app);
    createRealtimeServer(httpServer, logger);
    await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected bound HTTP server");
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (httpServer) await new Promise<void>((resolve, reject) => httpServer.close((err) => (err ? reject(err) : resolve())));
  });

  it("rejects unauthenticated socket connections", async () => {
    const client = Client(url, { transports: ["websocket"], timeout: 2000 });
    const [error] = await Promise.race([
      once(client, "connect_error").then(([err]) => [err]),
      once(client, "connect").then(() => [null]),
    ]);
    client.close();
    expect(error).toBeTruthy();
  });

  it("authorizes and emits tournament events to subscribed clients", async () => {
    const user = await registerAndLogin(await createApp(loadServerEnv(), createLogger({ serviceName: "karate-api-realtime-test-2", environment: "test", level: "silent" })), "ACADEMY");
    const { organizer } = await createAcademyWithOrganizer(user.userId);
    const tournament = await createDraftTournament(organizer.id, user.userId);

    const socket = Client(url, {
      transports: ["websocket"],
      auth: { token: user.accessToken },
      timeout: 4000,
    });

    await once(socket, "connect");
    const ack = await new Promise<{ ok: boolean }>((resolve) => {
      socket.emit("subscribe", { roomType: "tournament", roomId: tournament.id }, (result: { ok: boolean }) => resolve(result));
    });
    expect(ack.ok).toBe(true);

    const received = new Promise<{ eventType: string }>((resolve) => {
      socket.on("event", (event) => resolve(event));
    });

    const payload = { tournamentId: tournament.id, sequence: 1, occurredAt: new Date().toISOString(), payload: { version: 1 } };
    const token = jwt.sign({ sub: user.userId, roles: ["ACADEMY"] }, loadServerEnv().JWT_ACCESS_SECRET, { expiresIn: 60 });
    const socketEvent = { eventId: "evt-1", eventType: "SCHEDULE_CHANGED", entityType: "Schedule", entityId: tournament.id, tournamentId: tournament.id, sequence: 1, occurredAt: new Date().toISOString(), payload: { version: 1 }, actorUserId: user.userId };
    // trigger through helper API used by app code
    const { emitCompetitionEvent } = await import("../src/lib/realtime");
    emitCompetitionEvent(socketEvent);

    const event = await Promise.race([
      received,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);

    expect(event.eventType).toBe("SCHEDULE_CHANGED");
    socket.close();
  });
});
