-- Closes a gap in migration 20240101000001_row_level_security: enabling RLS
-- alone does not apply the policy to a table's owner (Postgres exempts
-- owners from RLS by default). Since the role that runs `prisma migrate
-- deploy` owns every table it creates, and application deployments may
-- reasonably connect using that same owner role (see DEPLOYMENT.md /
-- PRODUCTION_CHECKLIST.md for the pinoytax vs. pinoytax_app discussion),
-- the tenant_isolation policies from migration 000001 would silently not
-- apply to that connection even after app.current_company_id is wired up.
-- FORCE ROW LEVEL SECURITY closes that gap for every table the previous
-- migration enabled RLS on.
--
-- This does not change current runtime behavior: the tenant_isolation
-- policies still fall back to their permissive branch whenever
-- app.current_company_id is unset (which is true for all request paths
-- today — see PrismaService.withTenantContext's doc comment). This
-- migration only ensures that once that session variable is wired into the
-- request path, RLS enforcement actually takes effect regardless of which
-- role the application connects as.

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE column_name = 'company_id'
      AND table_schema IN ('org', 'payroll', 'tax_engine', 'compliance', 'documents', 'ai', 'notifications', 'audit')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY;', tbl.table_schema, tbl.table_name);
  END LOOP;
END $$;

ALTER TABLE org.companies FORCE ROW LEVEL SECURITY;
