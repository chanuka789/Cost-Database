ALTER TABLE "boq_documents" ADD COLUMN "reviewVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "acceptedIssues" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "boq_items" ADD COLUMN "checkedAt" TIMESTAMP(3),
  ADD COLUMN "checkedById" TEXT,
  ADD COLUMN "acceptedFlags" JSONB NOT NULL DEFAULT '[]';
