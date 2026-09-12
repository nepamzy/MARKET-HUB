import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema, registerSchema } from "@market-hub/shared";
import { isProduction } from "../../config/env";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from "../../lib/refreshTokens";
import {
  loginUser,
  logoutAllSessions,
  logoutUser,
  refreshSession,
  registerUser,
} from "./auth.service";

export const authRouter = Router();

// Deliberately tight limits on credential-guessing endpoints. This is a
// per-process in-memory limiter — adequate for a single-instance Phase A
// foundation; a shared store (e.g. Redis) is a later-phase concern if the
// API scales to multiple instances.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again later" } },
});

function setRefreshCookie(res: import("express").Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: import("express").Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

authRouter.post("/register", authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const result = await registerUser(req.body, { ip: req.ip, userAgent: req.header("user-agent") });
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.status(201).json({ user: result.user, accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const result = await loginUser(req.body, { ip: req.ip, userAgent: req.header("user-agent") });
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.status(200).json({ user: result.user, accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!presented) {
      throw AppError.unauthorized("No refresh token provided");
    }
    const result = await refreshSession(presented, { ip: req.ip, userAgent: req.header("user-agent") });
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.status(200).json({ user: result.user, accessToken: result.accessToken });
  } catch (err) {
    clearRefreshCookie(res);
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE_NAME];
    if (presented) {
      await logoutUser(presented);
    }
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await logoutAllSessions(req.user!.id);
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
