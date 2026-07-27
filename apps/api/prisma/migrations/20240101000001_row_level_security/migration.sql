-- Enables Row-Level Security as a defense-in-depth tenant isolation layer.
--
-- CURRENT STATUS: as of this migration, no application request path sets
-- app.current_company_id (see PrismaService.withTenantContext's doc comment
-- for why, and what a full wire-up would require). Until a request-scoped
-- transaction wrapper is added, these policies operate in their permissive
-- fallback branch for all normal application traffic, and the ACTIVE tenant
-- isolation boundary today is the explicit `where: { companyId }` filtering
-- present in every service under src/modules/**. This migration is applied
-- now so the schema and policies exist and are ready to enforce isolation
-- the moment request-scoped context-setting is wired in — treat it as
-- infrastructure-in-place, not yet a live control.

-- Note: current_setting('app.current_company_id', true) uses the
-- missing_ok=true form, which returns NULL rather than erroring when the
-- session variable has never been set (e.g. maintenance connections) — no
-- database-level default is required for that case.

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
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', tbl.table_schema, tbl.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I.%I USING (
         company_id::text = current_setting(''app.current_company_id'', true)
         OR current_setting(''app.current_company_id'', true) IS NULL
         OR current_setting(''app.current_company_id'', true) = ''''
       );',
      tbl.table_schema, tbl.table_name
    );
  END LOOP;
END $$;

-- companies itself is scoped by its own id, not a company_id column.
ALTER TABLE org.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON org.companies USING (
  id::text = current_setting('app.current_company_id', true)
  OR current_setting('app.current_company_id', true) IS NULL
  OR current_setting('app.current_company_id', true) = ''
);

COMMENT ON POLICY tenant_isolation ON org.companies IS
  'Defense-in-depth: application-layer company scoping is the primary
   control; this policy catches cases where a query forgets to filter by
   company. The empty-string fallback allows administrative/reporting
   connections that intentionally query across all tenants (e.g. platform
   admin endpoints) as long as they do not set app.current_company_id.';
