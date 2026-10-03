-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RFQ_CREATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('DRAFT', 'ISSUED');

-- CreateEnum
CREATE TYPE "RfqSupplierTargetStatus" AS ENUM ('INVITED', 'RESPONDED');

-- CreateEnum
CREATE TYPE "SupplierResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "requisitions" (
    "id" TEXT NOT NULL,
    "sequenceNumber" SERIAL NOT NULL,
    "buyerOrganizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_items" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "productId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "specification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisition_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" TEXT NOT NULL,
    "sequenceNumber" SERIAL NOT NULL,
    "buyerOrganizationId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "RfqStatus" NOT NULL DEFAULT 'DRAFT',
    "responseDeadline" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_items" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "requisitionItemId" TEXT,
    "productId" TEXT,
    "itemName" TEXT NOT NULL,
    "specification" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_supplier_targets" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierOrganizationId" TEXT NOT NULL,
    "status" "RfqSupplierTargetStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "rfq_supplier_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_responses" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierOrganizationId" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "status" "SupplierResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_response_items" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "rfqItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "leadTimeDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_response_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requisitions_sequenceNumber_key" ON "requisitions"("sequenceNumber");

-- CreateIndex
CREATE INDEX "requisitions_buyerOrganizationId_idx" ON "requisitions"("buyerOrganizationId");

-- CreateIndex
CREATE INDEX "requisitions_status_idx" ON "requisitions"("status");

-- CreateIndex
CREATE INDEX "requisition_items_requisitionId_idx" ON "requisition_items"("requisitionId");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_sequenceNumber_key" ON "rfqs"("sequenceNumber");

-- CreateIndex
CREATE INDEX "rfqs_buyerOrganizationId_idx" ON "rfqs"("buyerOrganizationId");

-- CreateIndex
CREATE INDEX "rfqs_requisitionId_idx" ON "rfqs"("requisitionId");

-- CreateIndex
CREATE INDEX "rfqs_status_idx" ON "rfqs"("status");

-- CreateIndex
CREATE INDEX "rfq_items_rfqId_idx" ON "rfq_items"("rfqId");

-- CreateIndex
CREATE INDEX "rfq_supplier_targets_supplierOrganizationId_idx" ON "rfq_supplier_targets"("supplierOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_supplier_targets_rfqId_supplierOrganizationId_key" ON "rfq_supplier_targets"("rfqId", "supplierOrganizationId");

-- CreateIndex
CREATE INDEX "supplier_responses_supplierOrganizationId_idx" ON "supplier_responses"("supplierOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_responses_rfqId_supplierOrganizationId_key" ON "supplier_responses"("rfqId", "supplierOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_response_items_responseId_rfqItemId_key" ON "supplier_response_items"("responseId", "rfqItemId");

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_items" ADD CONSTRAINT "requisition_items_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_items" ADD CONSTRAINT "requisition_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_requisitionItemId_fkey" FOREIGN KEY ("requisitionItemId") REFERENCES "requisition_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_supplier_targets" ADD CONSTRAINT "rfq_supplier_targets_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_supplier_targets" ADD CONSTRAINT "rfq_supplier_targets_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_responses" ADD CONSTRAINT "supplier_responses_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_responses" ADD CONSTRAINT "supplier_responses_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_responses" ADD CONSTRAINT "supplier_responses_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_response_items" ADD CONSTRAINT "supplier_response_items_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "supplier_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_response_items" ADD CONSTRAINT "supplier_response_items_rfqItemId_fkey" FOREIGN KEY ("rfqItemId") REFERENCES "rfq_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
