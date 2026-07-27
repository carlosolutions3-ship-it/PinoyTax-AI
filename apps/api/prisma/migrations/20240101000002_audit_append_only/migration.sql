-- Enforces that audit.audit_logs is append-only at the database layer, not
-- just by application convention. Create a dedicated runtime role for the
-- API (pinoytax_app) if it doesn't already exist, then revoke UPDATE/DELETE
-- on the audit tables from it. Adjust the role name to match your actual
-- deployment's DATABASE_URL user if different.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pinoytax_app') THEN
    CREATE ROLE pinoytax_app LOGIN PASSWORD 'changeme_in_production';
  END IF;
END $$;

GRANT USAGE ON SCHEMA identity, org, payroll, tax_engine, compliance, forms, documents, ai, notifications, audit
  TO pinoytax_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO pinoytax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA org TO pinoytax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA payroll TO pinoytax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tax_engine TO pinoytax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA compliance TO pinoytax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA forms TO pinoytax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA documents TO pinoytax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai TO pinoytax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA notifications TO pinoytax_app;

-- audit_logs and security_events: INSERT + SELECT only. No UPDATE, no
-- DELETE, ever, for the application role — this is what makes the audit
-- trail tamper-evident even if application code has a bug.
GRANT SELECT, INSERT ON audit.audit_logs TO pinoytax_app;
GRANT SELECT, INSERT ON audit.security_events TO pinoytax_app;
REVOKE UPDATE, DELETE ON audit.audit_logs FROM pinoytax_app;
REVOKE UPDATE, DELETE ON audit.security_events FROM pinoytax_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA identity, org, payroll, tax_engine, compliance, forms, documents, ai, notifications, audit
  TO pinoytax_app;
