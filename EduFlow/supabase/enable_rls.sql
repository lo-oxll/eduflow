-- Run once after the schema exists (also executed by the "Initialize Supabase Schema" workflow).
-- EduFlow talks to Postgres directly through DATABASE_URL (role "postgres", which bypasses RLS).
-- Supabase additionally exposes every table in the public schema through its REST API using the
-- public anon key. Enabling RLS with no policies + revoking grants closes that door completely.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
