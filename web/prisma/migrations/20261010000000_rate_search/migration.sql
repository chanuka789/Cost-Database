CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "boq_items" ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (to_tsvector('english'::regconfig, "fullDescription")) STORED;
CREATE INDEX "boq_items_search_vector_idx" ON "boq_items" USING GIN ("searchVector");
CREATE INDEX "boq_items_full_description_trgm_idx" ON "boq_items" USING GIN ("fullDescription" gin_trgm_ops);
CREATE INDEX "projects_name_trgm_idx" ON "projects" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "projects_number_trgm_idx" ON "projects" USING GIN ("projectNo" gin_trgm_ops);
CREATE INDEX "projects_date_idx" ON "projects" ("projectDate");
CREATE INDEX "boq_documents_published_filters_idx" ON "boq_documents" ("stageId", "rateType", "boqDate", "projectId") WHERE "status" = 'PUBLISHED';
CREATE INDEX "boq_items_unit_idx" ON "boq_items" ("unit");
CREATE INDEX "rates_bidder_idx" ON "rates" ("bidderId") WHERE "bidderId" IS NOT NULL;
