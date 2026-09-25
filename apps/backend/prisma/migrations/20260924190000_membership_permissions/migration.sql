-- CreateEnum
CREATE TYPE "PermissionResource" AS ENUM ('ORDERS', 'INVENTORY', 'PROCUREMENT', 'PAYMENTS', 'CATALOGUE', 'CUSTOMERS', 'KYC', 'MEMBERS', 'SETTINGS');

-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('NONE', 'VIEW', 'EDIT');

-- CreateTable
CREATE TABLE "membership_permissions" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "resource" "PermissionResource" NOT NULL,
    "level" "PermissionLevel" NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_permissions_membershipId_idx" ON "membership_permissions"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_permissions_membershipId_resource_key" ON "membership_permissions"("membershipId", "resource");

-- AddForeignKey
ALTER TABLE "membership_permissions" ADD CONSTRAINT "membership_permissions_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_permissions" ADD CONSTRAINT "membership_permissions_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
