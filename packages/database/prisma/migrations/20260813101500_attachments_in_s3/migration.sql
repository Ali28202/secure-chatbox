-- Attachments move from the API's disk to an S3 bucket.
--
-- `file_url` was a path relative to UPLOAD_DIR — a file on whichever machine
-- happened to be running the API. It is replaced by the two columns that locate
-- an object instead: the bucket it went to, and its key within that bucket.
--
-- Written by hand rather than generated. `prisma migrate dev` would have
-- produced a DROP followed by two ADDs, which is the same shape but says nothing
-- about what happens to the rows in between — and the answer there is not
-- obvious, so it is spelled out below.

-- Step 1: the new columns, nullable for the moment so existing rows survive the
-- statement and can be dealt with deliberately.
ALTER TABLE "attachments" ADD COLUMN "s3_bucket" TEXT;
ALTER TABLE "attachments" ADD COLUMN "s3_object_key" TEXT;

-- Step 2: there is no backfill, because there is nothing to backfill *from*.
--
-- An old row names a file under UPLOAD_DIR. Those bytes were never uploaded
-- anywhere; no bucket contains them and no statement here can put them in one.
-- Carrying the rows forward would mean an attachment that renders in the bubble,
-- is signed for on demand, and 404s at the store every single time — a permanent
-- broken link that looks like a bug in the platform rather than the consequence
-- of a migration.
--
-- So the rows go, and the messages they hung off stay. Anything already uploaded
-- has to be re-sent. That is a real loss and it is stated plainly rather than
-- hidden inside a DROP COLUMN: this platform has not been deployed, the only
-- rows this can reach are development and seed data, and the alternative is
-- worse for every deployment that comes after.
DELETE FROM "attachments";

-- Step 3: now that the table is empty, the columns can carry the constraint the
-- schema declares. Every row written from here on has both.
ALTER TABLE "attachments" ALTER COLUMN "s3_bucket" SET NOT NULL;
ALTER TABLE "attachments" ALTER COLUMN "s3_object_key" SET NOT NULL;

-- Step 4: the disk is no longer part of this.
ALTER TABLE "attachments" DROP COLUMN "file_url";
