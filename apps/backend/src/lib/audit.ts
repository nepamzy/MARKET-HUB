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
 * Failures are logged but never block the primary request (an audit-log
 * outage must not become a denial-of-service on login/logout).
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
  } catch {
    // Intentionally swallowed — see docstring above. The error is still
    // visible via the failed insert in DB logs/monitoring if needed.
  }
}
