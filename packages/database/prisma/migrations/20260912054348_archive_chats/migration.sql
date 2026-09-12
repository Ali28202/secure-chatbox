-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "chats_archived_at_idx" ON "chats"("archived_at");
