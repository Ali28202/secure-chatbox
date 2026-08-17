-- Everything Metabase needs from Postgres that Metabase cannot create itself.
--
-- Run by the `metabase-init` service on every `up`, against the `postgres`
-- maintenance database, and written to be run again safely — running it again
-- is also how the analytics password is rotated.
--
-- Two separate things happen here, and it is worth keeping them apart in your
-- head:
--
--   1. Metabase's *own* database, where it keeps its questions, dashboards and
--      users. It owns that one completely.
--   2. A read-only role for reading *this platform's* database. That is the
--      connection you add in the Metabase setup wizard, and it is deliberately
--      not the account the application uses.
--
-- Variables come from the command line (`psql -v ...`), so nothing is hardcoded
-- and no password is written in this file.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Metabase's application database
-- ---------------------------------------------------------------------------
-- Metabase will happily run on an embedded H2 file instead, and its own
-- documentation says not to: H2 is a single file with no concurrent access
-- story, and the failure mode is a corrupted file that takes every dashboard
-- with it. This is one more database on a server that is already running,
-- already has a volume, and is already in whatever backup exists.
--
-- `\gexec` runs whatever the query returns, so the CREATE only happens when the
-- row is produced — `CREATE DATABASE` has no IF NOT EXISTS, and it cannot run
-- inside a transaction or a DO block either.
SELECT 'CREATE DATABASE ' || quote_ident(:'metabase_database')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'metabase_database')
\gexec

-- ---------------------------------------------------------------------------
-- 2. The role Metabase reads this platform's data as
-- ---------------------------------------------------------------------------
-- Not the application's own role, and this is the part worth being deliberate
-- about. Metabase runs whatever SQL its users type. Pointed at the account the
-- API uses, "analytics" would mean anyone who reaches the Metabase login can
-- read every private message and every password hash, and can DELETE. Pointed
-- at this role, they can count and group and chart, and that is all.
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'ro_role', :'ro_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'ro_role')
\gexec

-- Unconditional, so that changing METABASE_RO_PASSWORD in .env and bringing the
-- stack up again is all it takes to rotate it.
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'ro_role', :'ro_password')
\gexec

-- ---------------------------------------------------------------------------
-- 3. What that role may see
-- ---------------------------------------------------------------------------
\connect :"app_database"

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_database', :'ro_role')
\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'ro_role')
\gexec
SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', :'ro_role')
\gexec

-- Tables a later migration adds are covered without anyone remembering to come
-- back here. Default privileges apply to tables created by the role running
-- this statement, which is the same role `prisma migrate deploy` runs as.
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %I', :'ro_role')
\gexec

-- ---------------------------------------------------------------------------
-- 4. The two columns analytics has no business reading
-- ---------------------------------------------------------------------------
-- Postgres grants SELECT per column, so "how many messages were sent in this
-- course group last week" stays answerable while the messages themselves stay
-- unreadable — and a dashboard cannot become a way around the chat.
--
--   users.password_hash   argon2id digests. Nothing charts them.
--   users.phone_number    a personal number, and not a usage statistic.
--   users.device_id       the fingerprint a session is bound to; handing it to
--                         a query tool would make session hijacking a
--                         copy-paste away.
--   messages.content      the conversations this platform exists to protect.
--
-- Guarded on the tables existing, because in development this runs before
-- anyone has applied a migration. Bring the stack up again after `db:migrate`
-- and the grants land.
--
-- The role name arrives through a session setting rather than as `:'ro_role'`,
-- because psql does not substitute its variables inside a dollar-quoted body —
-- it would send the literal text `:'ro_role'` to the server.
SET metabase.ro_role = :'ro_role';

DO $$
DECLARE
  ro_role text := current_setting('metabase.ro_role');
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE format('REVOKE SELECT ON public.users FROM %I', ro_role);
    EXECUTE format(
      'GRANT SELECT (id, university_id, name, role, is_active, last_seen,
                     created_at, updated_at) ON public.users TO %I', ro_role);
  ELSE
    RAISE WARNING 'public.users does not exist yet — run the migrations, then bring this service up again';
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    EXECUTE format('REVOKE SELECT ON public.messages FROM %I', ro_role);
    EXECUTE format(
      'GRANT SELECT (id, sender_id, chat_id, reply_to_id, is_edited, is_deleted,
                     is_pinned, created_at, updated_at) ON public.messages TO %I', ro_role);
  END IF;
END
$$;
