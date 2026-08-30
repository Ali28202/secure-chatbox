\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE ' || quote_ident(:'metabase_database')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'metabase_database')
\gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'ro_role', :'ro_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'ro_role')
\gexec

SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'ro_role', :'ro_password')
\gexec

\connect :"app_database"

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_database', :'ro_role')
\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'ro_role')
\gexec
SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', :'ro_role')
\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %I', :'ro_role')
\gexec

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
