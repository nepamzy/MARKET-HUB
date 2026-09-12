import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && incoming.length <= 100 ? incoming : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
