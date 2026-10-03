import type { PermissionLevel, PermissionResource } from "@market-hub/shared";
import { DEFAULT_PERMISSIONS } from "@market-hub/shared";
import { prisma } from "./prisma";
import type { OrganizationMembershipContext } from "../middleware/organizationAuth";

/**
 * Single source of truth for "what level of access does this member have
 * to this resource" — used by requirePermission (server-side authorization
 * gate) and by the permissions API (to show an owner what's currently in
 * effect). Never reimplement this resolution elsewhere, including in the
 * frontend — the frontend may call GET .../permissions to *display* the
 * result, but must never compute it independently as an authorization
 * decision (Rule 6/26: server-side authorization is authoritative).
 *
 * Resolution order: OWNER always resolves to EDIT on everything — ownership
 * is never a partial or overridable access level, mirroring the existing
 * "last owner can't be demoted" protection in organizations.service.ts.
 * Otherwise: an explicit MembershipPermission row wins; absent a row, the
 * membership role's DEFAULT_PERMISSIONS applies.
 */
export async function resolvePermissionLevel(
  membership: Pick<OrganizationMembershipContext, "id" | "role">,
  resource: PermissionResource
): Promise<PermissionLevel> {
  if (membership.role === "OWNER") {
    return "EDIT";
  }

  const override = await prisma.membershipPermission.findUnique({
    where: { membershipId_resource: { membershipId: membership.id, resource } },
    select: { level: true },
  });

  return override?.level ?? DEFAULT_PERMISSIONS[membership.role][resource];
}
