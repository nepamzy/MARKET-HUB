import request from "supertest";
import { describe, expect, it } from "vitest";
import { testApp, uniqueEmail } from "../helpers";

describe("POST /api/auth/register", () => {
  it("creates a new user with CUSTOMER platform role and never returns the password hash", async () => {
    const app = testApp();
    const email = uniqueEmail();

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada Lovelace", email, password: "Str0ngPassw0rd!" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.platformRole).toBe("CUSTOMER");
    expect(res.body.user.accountStatus).toBe("ACTIVE");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a duplicate email with 409", async () => {
    const app = testApp();
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ name: "Ada", email, password: "Str0ngPassw0rd!" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada Duplicate", email, password: "Str0ngPassw0rd!" });

    expect(res.status).toBe(409);
  });

  it("rejects a weak password with 400", async () => {
    const app = testApp();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada", email: uniqueEmail(), password: "weak" });

    expect(res.status).toBe(400);
  });

  it("rejects an invalid email with 400", async () => {
    const app = testApp();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada", email: "not-an-email", password: "Str0ngPassw0rd!" });

    expect(res.status).toBe(400);
  });
});
