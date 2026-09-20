import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { buildTestApp, uniqueEmail } from "./helpers";

const app = buildTestApp();
const PASSWORD = "TestPassword1234";

describe("POST /api/v1/auth/register", () => {
  it("registers a new user and returns tokens", async () => {
    const email = uniqueEmail("register");

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD, fullName: "New Player", role: "PLAYER" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(email);
    expect(res.body.data.roles).toEqual(["PLAYER"]);
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(typeof res.body.data.refreshToken).toBe("string");
  });

  it("rejects a duplicate email with 409 CONFLICT", async () => {
    const email = uniqueEmail("duplicate");
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD, fullName: "First", role: "PLAYER" });

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD, fullName: "Second", role: "PLAYER" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects invalid input with 400 VALIDATION_ERROR and no server internals leaked", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: "short", fullName: "", role: "PLAYER" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(/at\s.+\(.+:\d+:\d+\)/); // no stack trace shape
  });
});

describe("POST /api/v1/auth/login", () => {
  let email: string;

  beforeAll(async () => {
    email = uniqueEmail("login");
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD, fullName: "Login User", role: "PLAYER" });
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(email);
  });

  it("rejects the wrong password with 401 AUTHENTICATION_ERROR", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email, password: "WrongPassword1" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTHENTICATION_ERROR");
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("returns the authenticated user with a valid token", async () => {
    const email = uniqueEmail("me");
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD, fullName: "Me User", role: "COACH" });
    const loginRes = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(email);
    expect(res.body.data.roles).toEqual(["COACH"]);
  });
});

describe("Role-gated route: POST /api/v1/academies", () => {
  it("rejects a PLAYER-role token with 403 AUTHORIZATION_ERROR", async () => {
    const email = uniqueEmail("wrongrole");
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD, fullName: "Wrong Role", role: "PLAYER" });
    const loginRes = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });

    const res = await request(app)
      .post("/api/v1/academies")
      .set("Authorization", `Bearer ${loginRes.body.data.accessToken}`)
      .send({ name: "Should Fail Academy" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("AUTHORIZATION_ERROR");
  });
});
