BEGIN;
CREATE TYPE "ChatType_new" AS ENUM ('DIRECT', 'GROUP');
ALTER TABLE "chats" ALTER COLUMN "type" TYPE "ChatType_new"
  USING (CASE WHEN "type" = 'DIRECT' THEN 'DIRECT' ELSE 'GROUP' END)::"ChatType_new";
ALTER TYPE "ChatType" RENAME TO "ChatType_old";
ALTER TYPE "ChatType_new" RENAME TO "ChatType";
DROP TYPE "ChatType_old";
COMMIT;
