-- CreateEnum
CREATE TYPE "SystemEvent" AS ENUM ('MEMBER_ADDED', 'MEMBER_REMOVED');

-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "system_event" "SystemEvent",
ADD COLUMN     "system_target_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_key" TEXT;

-- CreateIndex
CREATE INDEX "chats_deleted_at_idx" ON "chats"("deleted_at");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_system_target_id_fkey" FOREIGN KEY ("system_target_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
