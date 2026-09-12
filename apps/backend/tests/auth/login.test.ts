import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { registerAndLogin, testApp, uniqueEmail } from "../helpers";

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    const app = testApp();
    const email = uniqueEmail();
    const password = "Str0ngPassw0rd!";
    await request(app).post("/api/auth/register").send({ name: "Grace Hopper", email, password });

    const res = await request(app).post("/api/auth/login").send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it("returns a generic 401 for a wrong password without revealing the account exists", async () => {
    const app = testApp();
    const email = uniqueEmail();
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Grace", email, password: "Str0ngPassw0rd!" });

    const res = await request(app).post("/api/auth/login").send({ email, password: "WrongPassword1" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("returns the exact same generic 401 for a nonexistent account", async () => {
    const app = testApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail("ghost"), password: "WhoKnows123" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("blocks login for a suspended account with the same generic error", async () => {
    const app = testApp();
    const email = uniqueEmail();
    const password = "Str0ngPassw0rd!";
    const { userId } = await registerAndLogin(app, { email, password });
    await prisma.user.update({ where: { id: userId }, data: { accountStatus: "SUSPENDED" } });

    const res = await request(app).post("/api/auth/login").send({ email, password });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the refresh token so it can no longer be used to refresh", async () => {
    const app = testApp();
    const { refreshCookie } = await registerAndLogin(app);

    const logoutRes = await request(app).post("/api/auth/logout").set("Cookie", refreshCookie);
    expect(logoutRes.status).toBe(204);

    const refreshRes = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);
    expect(refreshRes.status).toBe(401);
  });
});

describe("GET /api/users/me", () => {
  it("rejects requests without an access token", async () => {
    const app = testApp();
    const res = await request(app).get("/api/users/me");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid access token", async () => {
    const app = testApp();
    const res = await request(app).get("/api/users/me").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's own profile", async () => {
    const app = testApp();
    const { accessToken, email } = await registerAndLogin(app);

    const res = await request(app).get("/api/users/me").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });
});
