import type { MembershipRole, NotificationType } from "@market-hub/shared";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { ROLE_RANK } from "../../middleware/organizationAuth";
import { prisma } from "../../lib/prisma";

export interface NotifyInput {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Pass this whenever the call site sits behind something retriable (a
   * webhook, a verify-poll) rather than a one-shot guarded transition —
   * see schema.prisma's Notification doc comment. Most call sites don't
   * need one; the transition table they're already guarded by is enough. */
  dedupeKey?: string;
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
}

/**
 * Fire-and-forget-safe, same discipline as lib/audit.ts's recordAudit — a
 * notification failing to write must never fail the primary request. A
 * dedupeKey collision (the event already notified this recipient) is an
 * expected, silent no-op, not an error to log.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        recipientUserId: input.recipientUserId,
        type: input.type,
        title: input.title,
        message: input.message,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        dedupeKey: input.dedupeKey,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) return;
    logger.error({ err, type: input.type, recipientUserId: input.recipientUserId }, "Failed to write notification");
  }
}

/**
 * Fan-out to every member of an organization whose role meets `minRole` —
 * used for events where "who should know" is "whoever at that business can
 * act on this" rather than a single named user (e.g. an issued RFQ, a new
 * award). Each recipient gets an independent notify() call so one member's
 * failure never blocks another's, same fire-and-forget guarantee as notify()
 * itself. Never pass a client-supplied organizationId here — callers must
 * have already resolved it server-side (e.g. from the RFQ/Award row).
 */
export async function notifyOrganizationMembers(
  organizationId: string,
  minRole: MembershipRole,
  input: Omit<NotifyInput, "recipientUserId">
): Promise<void> {
  const members = await prisma.organizationMembership.findMany({
    where: { organizationId },
    select: { userId: true, role: true },
  });
  const recipients = members.filter((m) => ROLE_RANK[m.role] >= ROLE_RANK[minRole]);
  await Promise.all(recipients.map((m) => notify({ ...input, recipientUserId: m.userId })));
}

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  message: true,
  relatedEntityType: true,
  relatedEntityId: true,
  readAt: true,
  createdAt: true,
} as const;

export async function listNotifications(userId: string, page: number, pageSize: number, unreadOnly: boolean) {
  const where = { recipientUserId: userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: NOTIFICATION_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { recipientUserId: userId, readAt: null } }),
  ]);
  return { notifications, page, pageSize, total, unreadCount };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { recipientUserId: userId, readAt: null } });
}

/** A user may only ever mark their OWN notifications read — recipientUserId
 * is never trusted from the client, only from the authenticated caller,
 * and is part of the WHERE clause itself so a forged id can't touch
 * another user's row (an `updateMany` affecting 0 rows, not an error,
 * when the notification isn't this caller's or doesn't exist — the same
 * anti-enumeration shape used throughout this codebase). */
export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, recipientUserId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({ where: { id: notificationId, recipientUserId: userId }, select: { id: true } });
    if (!exists) {
      throw AppError.notFound("Notification not found");
    }
    // Exists and belongs to this user, already read — idempotent no-op.
  }
  return prisma.notification.findUniqueOrThrow({ where: { id: notificationId }, select: NOTIFICATION_SELECT });
}

export async function markAllNotificationsRead(userId: string): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { recipientUserId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
