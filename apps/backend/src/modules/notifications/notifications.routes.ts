import { Router } from "express";
import { notificationListQuerySchema } from "@market-hub/shared";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { getUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead } from "./notifications.service";

/** Mounted at /api/notifications — every route is already scoped to the
 * authenticated caller's own notifications; there is no :userId in any of
 * these paths, so there is nothing to additionally authorize per-row
 * beyond "is this the recipient," which the service layer itself checks. */
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", validate(notificationListQuerySchema, "query"), async (req, res, next) => {
  try {
    const { unreadOnly, page, pageSize } = req.query as unknown as { unreadOnly: boolean; page: number; pageSize: number };
    res.status(200).json(await listNotifications(req.user!.id, page, pageSize, unreadOnly));
  } catch (err) {
    next(err);
  }
});

notificationsRouter.get("/unread-count", async (req, res, next) => {
  try {
    res.status(200).json({ unreadCount: await getUnreadCount(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/:notificationId/read", async (req, res, next) => {
  try {
    res.status(200).json({ notification: await markNotificationRead(req.user!.id, req.params.notificationId) });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    res.status(200).json(await markAllNotificationsRead(req.user!.id));
  } catch (err) {
    next(err);
  }
});
