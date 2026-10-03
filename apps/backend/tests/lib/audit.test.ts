import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { recordAudit } from "../../src/lib/audit";
import { logger } from "../../src/lib/logger";

describe("recordAudit", () => {
  it("never throws when the underlying write fails", async () => {
    // A non-existent actorUserId violates the audit_logs -> users foreign
    // key at the database level — a real write failure, not a mock, kept
    // consistent with how the rest of this suite tests against a real
    // database rather than mocking Prisma.
    await expect(
      recordAudit({
        actorUserId: randomUUID(),
        action: "TEST_ACTION_THAT_WILL_FAIL",
      })
    ).resolves.toBeUndefined();
  });

  it("surfaces a failed audit write through the application logger", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);

    const badActorId = randomUUID();
    await recordAudit({ actorUserId: badActorId, action: "TEST_ACTION_THAT_WILL_FAIL" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [context, message] = errorSpy.mock.calls[0]!;
    expect(message).toBe("Failed to write audit log entry");
    expect(context).toMatchObject({ action: "TEST_ACTION_THAT_WILL_FAIL" });

    errorSpy.mockRestore();
  });

  it("still records a valid audit entry successfully (no regression)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);

    // No actorUserId/organizationId — both are optional and nullable, so
    // this is a valid, FK-constraint-free insert.
    await expect(
      recordAudit({ action: "TEST_VALID_ACTION", targetType: "Test", targetId: "1" })
    ).resolves.toBeUndefined();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
