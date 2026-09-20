import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildTestApp, registerAndLogin, createAcademyWithOrganizer, createDraftTournament } from "./helpers";

const app = buildTestApp();

describe("PATCH /api/v1/tournaments/:tournamentId/status", () => {
  it("applies a valid transition and records history", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { organizer } = await createAcademyWithOrganizer(owner.userId);
    const tournament = await createDraftTournament(organizer.id, owner.userId);

    const res = await request(app)
      .patch(`/api/v1/tournaments/${tournament.id}/status`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "PUBLISHED" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("PUBLISHED");
  });

  it("rejects an invalid transition with 409 CONFLICT", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { organizer } = await createAcademyWithOrganizer(owner.userId);
    const tournament = await createDraftTournament(organizer.id, owner.userId);

    const res = await request(app)
      .patch(`/api/v1/tournaments/${tournament.id}/status`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "LIVE" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects a transition from a user who does not administer the organizing academy", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { organizer } = await createAcademyWithOrganizer(owner.userId);
    const tournament = await createDraftTournament(organizer.id, owner.userId);

    const outsider = await registerAndLogin(app, "ACADEMY");

    const res = await request(app)
      .patch(`/api/v1/tournaments/${tournament.id}/status`)
      .set("Authorization", `Bearer ${outsider.accessToken}`)
      .send({ status: "PUBLISHED" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("AUTHORIZATION_ERROR");
  });

  it("returns 404 for a non-existent tournament", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");

    const res = await request(app)
      .patch("/api/v1/tournaments/00000000-0000-0000-0000-000000000000/status")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "PUBLISHED" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a malformed status value", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");
    const { organizer } = await createAcademyWithOrganizer(owner.userId);
    const tournament = await createDraftTournament(organizer.id, owner.userId);

    const res = await request(app)
      .patch(`/api/v1/tournaments/${tournament.id}/status`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "NOT_A_REAL_STATUS" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for a malformed tournament id", async () => {
    const owner = await registerAndLogin(app, "ACADEMY");

    const res = await request(app)
      .patch("/api/v1/tournaments/not-a-uuid/status")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "PUBLISHED" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app)
      .patch("/api/v1/tournaments/00000000-0000-0000-0000-000000000000/status")
      .send({ status: "PUBLISHED" });

    expect(res.status).toBe(401);
  });
});
