-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "organization_invite_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "inviteeEmail" TEXT,
    "role" "MembershipRole" NOT NULL DEFAULT 'STAFF',
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invite_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_join_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inviteLinkId" TEXT,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_invite_links_tokenHash_key" ON "organization_invite_links"("tokenHash");

-- CreateIndex
CREATE INDEX "organization_invite_links_organizationId_idx" ON "organization_invite_links"("organizationId");

-- CreateIndex
CREATE INDEX "organization_join_requests_organizationId_status_idx" ON "organization_join_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "organization_join_requests_userId_idx" ON "organization_join_requests"("userId");

-- AddForeignKey
ALTER TABLE "organization_invite_links" ADD CONSTRAINT "organization_invite_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invite_links" ADD CONSTRAINT "organization_invite_links_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_join_requests" ADD CONSTRAINT "organization_join_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_join_requests" ADD CONSTRAINT "organization_join_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_join_requests" ADD CONSTRAINT "organization_join_requests_inviteLinkId_fkey" FOREIGN KEY ("inviteLinkId") REFERENCES "organization_invite_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_join_requests" ADD CONSTRAINT "organization_join_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
