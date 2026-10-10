-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NegotiationEventAuthor" AS ENUM ('BUYER', 'SUPPLIER');

-- AlterEnum
ALTER TYPE "RfqStatus" ADD VALUE 'AWARDED';

-- CreateTable
CREATE TABLE "negotiations" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "buyerOrganizationId" TEXT NOT NULL,
    "supplierOrganizationId" TEXT NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "status" "NegotiationStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiation_events" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "authorRole" "NegotiationEventAuthor" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negotiation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiation_event_items" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "rfqItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "negotiation_event_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "awards" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "supplierOrganizationId" TEXT NOT NULL,
    "awardedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "negotiations_responseId_key" ON "negotiations"("responseId");

-- CreateIndex
CREATE INDEX "negotiations_rfqId_idx" ON "negotiations"("rfqId");

-- CreateIndex
CREATE INDEX "negotiations_buyerOrganizationId_idx" ON "negotiations"("buyerOrganizationId");

-- CreateIndex
CREATE INDEX "negotiations_supplierOrganizationId_idx" ON "negotiations"("supplierOrganizationId");

-- CreateIndex
CREATE INDEX "negotiation_events_negotiationId_idx" ON "negotiation_events"("negotiationId");

-- CreateIndex
CREATE UNIQUE INDEX "negotiation_event_items_eventId_rfqItemId_key" ON "negotiation_event_items"("eventId", "rfqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "awards_rfqId_key" ON "awards"("rfqId");

-- CreateIndex
CREATE UNIQUE INDEX "awards_responseId_key" ON "awards"("responseId");

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "supplier_responses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_events" ADD CONSTRAINT "negotiation_events_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_events" ADD CONSTRAINT "negotiation_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_event_items" ADD CONSTRAINT "negotiation_event_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "negotiation_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_event_items" ADD CONSTRAINT "negotiation_event_items_rfqItemId_fkey" FOREIGN KEY ("rfqItemId") REFERENCES "rfq_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "awards" ADD CONSTRAINT "awards_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "awards" ADD CONSTRAINT "awards_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "supplier_responses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "awards" ADD CONSTRAINT "awards_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "awards" ADD CONSTRAINT "awards_awardedByUserId_fkey" FOREIGN KEY ("awardedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
