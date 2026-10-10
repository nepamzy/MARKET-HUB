import { logger } from "./logger";
import { prisma } from "./prisma";

export interface AuditEntry {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget-safe audit write for security/administrative actions.
 * A failure here never blocks or fails the primary request (an audit-log
 * outage must not become a denial-of-service on login/logout) — but it is
 * always surfaced through the application's own structured logger at
 * `error` level, with enough context (action + target, never the raw
 * metadata payload) to alert on and investigate. Previously this catch
 * block silently discarded the error with only a code comment claiming it
 * was "visible via DB logs" — it wasn't actually logged anywhere the
 * application controls, so a failing audit trail could go unnoticed
 * indefinitely. This is a logging fix only; the fire-and-forget behavior
 * itself (don't block the request) is unchanged.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        organizationId: entry.organizationId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata as never,
      },
    });
  } catch (err) {
    logger.error(
      { err, action: entry.action, targetType: entry.targetType, targetId: entry.targetId },
      "Failed to write audit log entry"
    );
  }
}
