import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "@karate/database";
import {
  buildTestApp,
  registerAndLogin,
  createAcademyWithOrganizer,
  createOpenTournamentWithCategory,
} from "./helpers";

const app = buildTestApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createPlayer(displayName = "Test Player") {
  const player = await registerAndLogin(app, "PLAYER");
  const res = await request(app)
    .post("/api/v1/players/profile")
    .set(auth(player.accessToken))
    .send({ displayName, dateOfBirth: "2005-01-01", gender: "MALE" });
  return { ...player, playerId: res.body.data.id as string };
}

async function setupOpenTournament() {
  const owner = await registerAndLogin(app, "ACADEMY");
  const { academy, organizer } = await createAcademyWithOrganizer(owner.userId);
  const { tournament, category, competition } = await createOpenTournamentWithCategory(
    organizer.id,
    owner.userId,
  );
  return { owner, academy, organizer, tournament, category, competition };
}

async function createRegistration(owner: { accessToken: string }, competitionId: string) {
  const player = await createPlayer();
  const res = await request(app)
    .post("/api/v1/registrations")
    .set(auth(player.accessToken))
    .send({ competitionId });
  return { player, registrationId: res.body.data.id as string };
}

describe("Medical clearance (Phase 8)", () => {
  it("1. a new registration starts with an initial PENDING medical status", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { player, registrationId } = await createRegistration(owner, competition.id);
    const res = await request(app)
      .get(`/api/v1/registrations/${registrationId}`)
      .set(auth(player.accessToken));
    expect(res.body.data.medical.status).toBe("PENDING");
    expect(res.body.data.medical.isValid).toBe(false);
  });

  it("2. the tournament organizer can authorize a clearance", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { registrationId } = await createRegistration(owner, competition.id);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "CLEARED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CLEARED");
    expect(res.body.data.isValid).toBe(true);
  });

  it("3. the tournament organizer can record a rejection", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { registrationId } = await createRegistration(owner, competition.id);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "NOT_CLEARED", notes: "Blood pressure reading outside safe threshold" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("NOT_CLEARED");
    expect(res.body.data.isValid).toBe(false);
  });

  it("4. a player cannot self-clear their own registration", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { player, registrationId } = await createRegistration(owner, competition.id);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(player.accessToken))
      .send({ status: "CLEARED" });
    expect(res.status).toBe(403);
  });

  it("5. an unrelated academy cannot record a medical decision on another organizer's tournament", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { registrationId } = await createRegistration(owner, competition.id);
    const otherOwner = await registerAndLogin(app, "ACADEMY");
    await createAcademyWithOrganizer(otherOwner.userId);
    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(otherOwner.accessToken))
      .send({ status: "CLEARED" });
    expect(res.status).toBe(403);
  });

  it("6. a cleared registration past its expiry date is treated as EXPIRED and no longer valid", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { player, registrationId } = await createRegistration(owner, competition.id);
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "CLEARED", expiresAt: past });

    const res = await request(app)
      .get(`/api/v1/registrations/${registrationId}`)
      .set(auth(player.accessToken));
    expect(res.body.data.medical.status).toBe("EXPIRED");
    expect(res.body.data.medical.isValid).toBe(false);

    const row = await prisma.medicalClearance.findUnique({ where: { registrationId } });
    expect(row?.status).toBe("EXPIRED");
  });

  it("7. an invalid status transition is rejected", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { registrationId } = await createRegistration(owner, competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "CLEARED" });

    const res = await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "NOT_CLEARED" });
    expect(res.status).toBe(409);
  });

  it("8. medical notes never appear in the generic registration read paths", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { player, registrationId } = await createRegistration(owner, competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "NOT_CLEARED", notes: "SENSITIVE_MEDICAL_NOTE_MARKER" });

    const detail = await request(app)
      .get(`/api/v1/registrations/${registrationId}`)
      .set(auth(player.accessToken));
    expect(JSON.stringify(detail.body)).not.toContain("SENSITIVE_MEDICAL_NOTE_MARKER");
    expect(detail.body.data.medical).not.toHaveProperty("notes");

    const list = await request(app).get("/api/v1/registrations/me").set(auth(player.accessToken));
    expect(JSON.stringify(list.body)).not.toContain("SENSITIVE_MEDICAL_NOTE_MARKER");
  });

  it("9. medical notes are never stored in the audit log", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { registrationId } = await createRegistration(owner, competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "NOT_CLEARED", notes: "AUDIT_SENSITIVE_MARKER" });

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "MEDICAL_CLEARANCE_RECORDED", entityId: registrationId },
    });
    expect(JSON.stringify(auditRow?.metadata ?? {})).not.toContain("AUDIT_SENSITIVE_MARKER");
  });

  it("10. recording a medical decision creates an audit record", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { registrationId } = await createRegistration(owner, competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "CLEARED" });

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "MEDICAL_CLEARANCE_RECORDED", entityId: registrationId },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.actorUserId).toBe(owner.userId);
  });

  it("11. a NOT_CLEARED medical decision is reflected as invalid, never treated as cleared", async () => {
    const { owner, competition } = await setupOpenTournament();
    const { player, registrationId } = await createRegistration(owner, competition.id);
    await request(app)
      .post(`/api/v1/registrations/${registrationId}/medical/decision`)
      .set(auth(owner.accessToken))
      .send({ status: "NOT_CLEARED" });

    const res = await request(app)
      .get(`/api/v1/registrations/${registrationId}`)
      .set(auth(player.accessToken));
    expect(res.body.data.medical.status).toBe("NOT_CLEARED");
    expect(res.body.data.medical.isValid).toBe(false);
  });
});
