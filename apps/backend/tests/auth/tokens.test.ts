import request from "supertest";
import { describe, expect, it } from "vitest";
import { backdateTokenRevocation, extractRefreshToken, registerAndLogin, testApp } from "../helpers";

describe("POST /api/auth/refresh", () => {
  it("rotates the refresh token and issues a new access token", async () => {
    const app = testApp();
    const { refreshCookie } = await registerAndLogin(app);

    const res = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.headers["set-cookie"]).toBeDefined();
    // The rotated refresh cookie must be a genuinely new token, not a reissue
    // of the same one (an access token's JWT can legitimately be identical
    // to a moment-earlier one when `iat` lands in the same second, so we
    // assert rotation on the refresh token, which is what actually matters
    // for reuse-detection to work).
    const newRefreshCookie = res.headers["set-cookie"][0];
    expect(newRefreshCookie.split(";")[0]).not.toBe(refreshCookie.split(";")[0]);
  });

  it("rejects a request with no refresh cookie", async () => {
    const app = testApp();
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("tolerates a near-simultaneous duplicate refresh (grace period) instead of nuking the session", async () => {
    // Two tabs, or a client double-firing an effect, can both present the
    // SAME still-valid refresh token at almost the same instant. Neither
    // request is an attacker — both must succeed, and the session must
    // still work afterwards.
    const app = testApp();
    const { refreshCookie } = await registerAndLogin(app);

    const [a, b] = await Promise.all([
      request(app).post("/api/auth/refresh").set("Cookie", refreshCookie),
      request(app).post("/api/auth/refresh").set("Cookie", refreshCookie),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    // Whichever cookie came out of the second response must still work —
    // the session was not torn down by the race.
    const latestCookie = b.headers["set-cookie"][0];
    const followUp = await request(app).post("/api/auth/refresh").set("Cookie", latestCookie);
    expect(followUp.status).toBe(200);
  });

  it("rejects genuine reuse of a token rotated outside the grace period and revokes the whole family", async () => {
    const app = testApp();
    const { refreshCookie } = await registerAndLogin(app);

    const first = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);
    expect(first.status).toBe(200);
    const rotatedCookie = first.headers["set-cookie"][0];

    // Simulate the rotation having happened well outside the grace window
    // (e.g. a real replay minutes later, not a concurrent race), so the
    // OLD token no longer gets the benefit of the doubt.
    await backdateTokenRevocation(extractRefreshToken(refreshCookie), 60_000);

    const reuse = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);
    expect(reuse.status).toBe(401);

    // ...and because reuse was detected, even the NEW token from that
    // family must now be revoked (theft-mitigation: the whole chain dies).
    const afterReuse = await request(app).post("/api/auth/refresh").set("Cookie", rotatedCookie);
    expect(afterReuse.status).toBe(401);
  });

  it("rejects a garbage refresh token", async () => {
    const app = testApp();
    const res = await request(app).post("/api/auth/refresh").set("Cookie", "mh_refresh=not-a-real-token");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout-all", () => {
  it("revokes every active session for the user", async () => {
    const app = testApp();
    const { accessToken, refreshCookie } = await registerAndLogin(app);

    const res = await request(app)
      .post("/api/auth/logout-all")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(204);

    const refreshRes = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);
    expect(refreshRes.status).toBe(401);
  });
});
