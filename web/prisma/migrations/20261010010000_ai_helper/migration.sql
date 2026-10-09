-- AlterTable
ALTER TABLE "boq_documents" ADD COLUMN     "aiAllowFallback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiChoice" TEXT NOT NULL DEFAULT 'OFF',
ADD COLUMN     "aiMessage" TEXT,
ADD COLUMN     "aiRecipients" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "aiStatus" TEXT NOT NULL DEFAULT 'OFF',
ADD COLUMN     "columnMapping" JSONB;

-- AlterTable
ALTER TABLE "boq_items" ADD COLUMN     "trade" TEXT;

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "taskModels" JSONB NOT NULL DEFAULT '{}',
    "encryptedKey" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "inputPrice" DOUBLE PRECISION NOT NULL,
    "outputPrice" DOUBLE PRECISION NOT NULL,
    "monthlyBudget" DOUBLE PRECISION,
    "dataPolicy" TEXT NOT NULL,
    "testFingerprint" TEXT,
    "testedAt" TIMESTAMP(3),
    "testStatus" TEXT,
    "testLatencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "documentId" TEXT,
    "task" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedCost" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "proposed" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_providerId_createdAt_idx" ON "ai_usage"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_documentId_idx" ON "ai_usage"("documentId");

-- CreateIndex
CREATE INDEX "ai_suggestions_documentId_status_idx" ON "ai_suggestions"("documentId", "status");

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "boq_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "boq_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
