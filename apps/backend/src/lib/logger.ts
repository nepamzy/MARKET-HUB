import pino from "pino";
import { isProduction, isTest } from "../config/env";

export const logger = pino({
  level: isTest ? "silent" : isProduction ? "info" : "debug",
  transport:
    !isProduction && !isTest
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});
