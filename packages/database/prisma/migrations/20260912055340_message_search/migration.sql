-- The index below uses the gin_trgm_ops operator class, which the extension
-- supplies. Prisma models the index but not the extension, so it goes here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "messages_content_idx" ON "messages" USING GIN ("content" gin_trgm_ops);
