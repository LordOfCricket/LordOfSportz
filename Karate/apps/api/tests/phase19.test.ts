import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "@karate/database";
import { buildTestApp, createAcademyWithOrganizer, registerAndLogin } from "./helpers";

const app = buildTestApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("Phase 19 platform features", () => {
  it("keeps notifications private and supports read state", async () => {
    const player = await registerAndLogin(app, "PLAYER");
    const other = await registerAndLogin(app, "PLAYER");
    const notification = await prisma.notification.create({ data: { userId: player.userId, type: "TEST", title: "Private alert" } });
    expect((await request(app).get("/api/v1/notifications").set(auth(other.accessToken))).body.data).toHaveLength(0);
    const list = await request(app).get("/api/v1/notifications").set(auth(player.accessToken));
    expect(list.body.data.some((row: { id: string }) => row.id === notification.id)).toBe(true);
    const read = await request(app).post(`/api/v1/notifications/${notification.id}/read`).set(auth(player.accessToken));
    expect(read.body.data.isRead).toBe(true);
  });

  it("validates public search and protects protest review", async () => {
    const player = await registerAndLogin(app, "PLAYER");
    const owner = await registerAndLogin(app, "ACADEMY");
    const { organizer } = await createAcademyWithOrganizer(owner.userId);
    const tournament = await prisma.tournament.create({ data: { organizerId: organizer.id, name: `Search ${randomUUID()}`, slug: `search-${randomUUID()}`, createdByUserId: owner.userId } });
    expect((await request(app).get("/api/v1/search?q=x")).status).toBe(400);
    const protest = await request(app).post("/api/v1/protests").set(auth(player.accessToken)).send({ tournamentId: tournament.id, category: "OTHER", description: "Review requested" });
    expect(protest.status).toBe(201);
    expect((await request(app).post(`/api/v1/protests/${protest.body.data.id}/resolve`).set(auth(player.accessToken)).send({ status: "REJECTED", resolution: "No" })).status).toBe(403);
  });

  it("allows authorized incident reporting and certificate verification by code", async () => {
    const scorer = await registerAndLogin(app, "SCORER");
    const certificate = await prisma.certificate.create({ data: { type: "TOURNAMENT_RESULT", serialNumber: `CERT-${randomUUID()}`, verificationCode: `VERIFY-${randomUUID()}`, verificationStatus: "VERIFIED" } });
    const incident = await request(app).post("/api/v1/incidents").set(auth(scorer.accessToken)).send({ category: "SAFETY", description: "Equipment issue", severity: "MEDIUM" });
    expect(incident.status).toBe(201);
    const verified = await request(app).get(`/api/v1/grading/certificates/verify/${certificate.verificationCode}`);
    expect(verified.status).toBe(200);
    expect(verified.body.data.serialNumber).toBe(certificate.serialNumber);
  });
});
