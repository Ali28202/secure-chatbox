-- Device-bound sessions, and the phone number as a second login identifier.
--
-- Both columns are nullable, which is what makes this a one-statement migration
-- on a table that already has rows:
--
--   * `phone_number` is unique, and a unique column cannot be backfilled with a
--     placeholder without inventing eleven-digit numbers that belong to real
--     people. Postgres allows any number of NULLs under a unique index, so
--     existing accounts simply keep logging in by university id until they set
--     one. Registration requires it, so every new account has one.
--
--   * `device_id` is null until the account's first login, which is the moment
--     a device exists to bind to.
--
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "device_id" TEXT,
ADD COLUMN     "phone_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");
