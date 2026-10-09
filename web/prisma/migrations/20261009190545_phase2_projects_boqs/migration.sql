-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('PTE', 'TENDER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PROCESSING', 'REVIEW', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('DAY', 'MONTH');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectNo" TEXT,
    "projectDate" DATE NOT NULL,
    "projectDatePrecision" "DatePrecision" NOT NULL DEFAULT 'DAY',
    "client" TEXT,
    "consultant" TEXT,
    "countryId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "buildingTypeId" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boq_documents" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rateType" "RateType" NOT NULL,
    "stageId" TEXT NOT NULL,
    "boqDate" DATE NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "pageCount" INTEGER,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB,
    "cover" JSONB,
    "extractor" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "uploadedById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boq_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_jobs" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "step" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "parentHeading" TEXT,
    "heading" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "main_descriptions" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "pageFrom" INTEGER NOT NULL,
    "pageTo" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "aiTouched" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "main_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boq_items" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "mainDescriptionId" TEXT NOT NULL,
    "itemRef" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "unitRaw" TEXT,
    "unit" TEXT,
    "qty" DECIMAL(18,4),
    "page" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "aiTouched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rates" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "bidderId" TEXT,
    "rate" DECIMAL(18,4),
    "amount" DECIMAL(20,2),
    "rateNote" TEXT,
    "currency" "Currency" NOT NULL,

    CONSTRAINT "rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_countryId_cityId_idx" ON "projects"("countryId", "cityId");

-- CreateIndex
CREATE INDEX "projects_buildingTypeId_idx" ON "projects"("buildingTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "boq_documents_fileSha256_key" ON "boq_documents"("fileSha256");

-- CreateIndex
CREATE INDEX "boq_documents_projectId_idx" ON "boq_documents"("projectId");

-- CreateIndex
CREATE INDEX "boq_documents_status_idx" ON "boq_documents"("status");

-- CreateIndex
CREATE INDEX "extraction_jobs_documentId_createdAt_idx" ON "extraction_jobs"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "bills_documentId_idx" ON "bills"("documentId");

-- CreateIndex
CREATE INDEX "sections_billId_idx" ON "sections"("billId");

-- CreateIndex
CREATE INDEX "main_descriptions_sectionId_idx" ON "main_descriptions"("sectionId");

-- CreateIndex
CREATE INDEX "boq_items_mainDescriptionId_idx" ON "boq_items"("mainDescriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "boq_items_documentId_sortOrder_key" ON "boq_items"("documentId", "sortOrder");

-- CreateIndex
CREATE INDEX "rates_itemId_idx" ON "rates"("itemId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_buildingTypeId_fkey" FOREIGN KEY ("buildingTypeId") REFERENCES "building_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_documents" ADD CONSTRAINT "boq_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_documents" ADD CONSTRAINT "boq_documents_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_documents" ADD CONSTRAINT "boq_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_documents" ADD CONSTRAINT "boq_documents_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "boq_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "boq_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "main_descriptions" ADD CONSTRAINT "main_descriptions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "boq_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_mainDescriptionId_fkey" FOREIGN KEY ("mainDescriptionId") REFERENCES "main_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rates" ADD CONSTRAINT "rates_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "boq_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Project names and numbers are unique regardless of capitals ("Q-Walk" = "q-walk").
CREATE UNIQUE INDEX "projects_name_lower_key" ON "projects" (lower("name"));
CREATE UNIQUE INDEX "projects_project_no_lower_key" ON "projects" (lower("projectNo")) WHERE "projectNo" IS NOT NULL;
