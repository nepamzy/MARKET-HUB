import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { corsOrigins } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";
import { adminRouter } from "./modules/admin/admin.routes";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { cartRouter } from "./modules/cart/cart.routes";
import { healthRouter } from "./modules/health/health.routes";
import { createPublicInvitesRouter, organizationInvitationsRouter } from "./modules/invitations/invitations.routes";
import { organizationOnboardingRouter } from "./modules/kyc/kyc.routes";
import { organizationsRouter } from "./modules/organizations/organizations.routes";
import { checkoutRouter, organizationOrdersRouter, ordersRouter } from "./modules/orders/orders.routes";
import { categoriesRouter, organizationProductsRouter, publicProductsRouter } from "./modules/products/products.routes";
import { organizationRequisitionsRouter } from "./modules/procurement/requisitions.routes";
import { organizationRfqInboxRouter, organizationRfqsRouter, rfqDetailRouter } from "./modules/procurement/rfqs.routes";
import { organizationSupplierResponsesRouter } from "./modules/procurement/supplierResponses.routes";
import { directoryRouter, organizationSupplierRouter } from "./modules/supplier/supplier.routes";
import { usersRouter } from "./modules/users/users.routes";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { requestId: string }).requestId,
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    })
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/non-browser requests (no Origin header) and any
        // explicitly configured origin. Never reflect an arbitrary origin.
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api/health", healthRouter);
  app.use("/api/auth", createAuthRouter());
  app.use("/api/users", usersRouter);
  app.use("/api/organizations", organizationsRouter);
  app.use("/api/organizations", organizationInvitationsRouter);
  app.use("/api/organizations", organizationOnboardingRouter);
  app.use("/api/organizations", organizationSupplierRouter);
  app.use("/api/organizations", organizationProductsRouter);
  app.use("/api/organizations", organizationOrdersRouter);
  app.use("/api/organizations", organizationRequisitionsRouter);
  app.use("/api/organizations", organizationRfqsRouter);
  app.use("/api/organizations", organizationRfqInboxRouter);
  app.use("/api/organizations", organizationSupplierResponsesRouter);
  app.use("/api/rfqs", rfqDetailRouter);
  app.use("/api/directory", directoryRouter);
  app.use("/api/products", publicProductsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/invites", createPublicInvitesRouter());
  app.use("/api/cart", cartRouter);
  app.use("/api/checkout", checkoutRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
