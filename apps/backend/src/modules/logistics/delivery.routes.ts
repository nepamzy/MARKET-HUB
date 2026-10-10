import { Router } from "express";
import { assignDriverSchema, confirmProofOfDeliverySchema, deliveryFailedSchema, recordLocationSchema } from "@market-hub/shared";
import { requireAuth, requirePlatformRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import {
  assignDriver,
  confirmProofOfDelivery,
  getDeliveryEvents,
  getDeliveryForViewer,
  getLatestLocation,
  listDeliveriesForDriver,
  markDeliveryFailed,
  markPickedUp,
  recordLocation,
} from "./delivery.service";

/** Mounted at /api/deliveries — standalone detail + actions, resolved
 * per-delivery across all three parties (seller org, buyer, driver). */
export const deliveryDetailRouter = Router();
deliveryDetailRouter.use(requireAuth);

deliveryDetailRouter.get("/:deliveryId", async (req, res, next) => {
  try {
    res.status(200).json({ delivery: await getDeliveryForViewer(req.params.deliveryId, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

deliveryDetailRouter.post(
  "/:deliveryId/assign-driver",
  validate(assignDriverSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ delivery: await assignDriver(req.params.deliveryId, req.user!.id, req.body.driverEmail) });
    } catch (err) {
      next(err);
    }
  }
);

deliveryDetailRouter.post("/:deliveryId/pickup", requirePlatformRole("DRIVER"), async (req, res, next) => {
  try {
    res.status(200).json({ delivery: await markPickedUp(req.params.deliveryId, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

deliveryDetailRouter.post(
  "/:deliveryId/location",
  requirePlatformRole("DRIVER"),
  validate(recordLocationSchema),
  async (req, res, next) => {
    try {
      res.status(201).json(await recordLocation(req.params.deliveryId, req.user!.id, req.body.latitude, req.body.longitude));
    } catch (err) {
      next(err);
    }
  }
);

deliveryDetailRouter.get("/:deliveryId/location", async (req, res, next) => {
  try {
    res.status(200).json({ location: await getLatestLocation(req.params.deliveryId, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

deliveryDetailRouter.get("/:deliveryId/events", async (req, res, next) => {
  try {
    res.status(200).json({ events: await getDeliveryEvents(req.params.deliveryId, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

deliveryDetailRouter.post(
  "/:deliveryId/proof-of-delivery",
  requirePlatformRole("DRIVER"),
  validate(confirmProofOfDeliverySchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ delivery: await confirmProofOfDelivery(req.params.deliveryId, req.user!.id, req.body) });
    } catch (err) {
      next(err);
    }
  }
);

deliveryDetailRouter.post(
  "/:deliveryId/fail",
  validate(deliveryFailedSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ delivery: await markDeliveryFailed(req.params.deliveryId, req.user!.id, req.body.reason) });
    } catch (err) {
      next(err);
    }
  }
);

/** Mounted at /api/driver — the driver's own assigned-deliveries view.
 * requirePlatformRole("DRIVER") is the whole authorization boundary here;
 * listDeliveriesForDriver itself only ever queries by the caller's own
 * id, so there is no cross-driver leakage to additionally guard against. */
export const driverDeliveriesRouter = Router();

driverDeliveriesRouter.get("/deliveries", requireAuth, requirePlatformRole("DRIVER"), async (req, res, next) => {
  try {
    res.status(200).json({ deliveries: await listDeliveriesForDriver(req.user!.id) });
  } catch (err) {
    next(err);
  }
});
