import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "../lib/errors";

type Source = "body" | "query" | "params";

/**
 * Validates and replaces `req[source]` with the parsed (and coerced) data.
 *
 * Uses `safeParse` and converts failures to `AppError` directly here rather
 * than throwing `ZodError` and relying on `instanceof ZodError` in the
 * global error handler: under Vitest's Vite-transformed module graph, the
 * "zod" package can end up loaded as two distinct module instances (a
 * classic dual-package hazard), which makes cross-file `instanceof ZodError`
 * checks unreliable. Handling it in one place, in the same module that
 * calls `parse`, sidesteps that entirely.
 */
export function validate(schema: ZodTypeAny, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(
        AppError.badRequest(
          "Request validation failed",
          result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
        )
      );
      return;
    }
    (req as unknown as Record<Source, unknown>)[source] = result.data;
    next();
  };
}
