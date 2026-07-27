-- PinoyTax AI initial schema migration
-- Generated to match apps/api/prisma/schema.prisma (Phase 2 database design).
-- Run via `npm run prisma:deploy` (prisma migrate deploy) in production, or
-- `npm run prisma:migrate` (prisma migrate dev) in development.

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS org;
CREATE SCHEMA IF NOT EXISTS payroll;
CREATE SCHEMA IF NOT EXISTS tax_engine;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS forms;
CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE identity."AuthProvider" AS ENUM ('local', 'google', 'microsoft');
CREATE TYPE identity."UserStatus" AS ENUM ('active', 'locked', 'suspended', 'deactivated');
CREATE TYPE identity."LoginStatus" AS ENUM ('success', 'failed_password', 'failed_locked', 'failed_unverified');

CREATE TYPE org."FirmType" AS ENUM ('accounting_firm', 'bookkeeping_firm', 'tax_consultancy');
CREATE TYPE org."BusinessType" AS ENUM ('sole_prop', 'opc', 'partnership', 'corporation');
CREATE TYPE org."VatClassification" AS ENUM ('vat', 'non_vat');
CREATE TYPE org."AccountingMethod" AS ENUM ('accrual', 'cash');
CREATE TYPE org."CompanyStatus" AS ENUM ('active', 'inactive', 'under_review');
CREATE TYPE org."UserCompanyRoleStatus" AS ENUM ('pending', 'active', 'revoked');

CREATE TYPE payroll."EmploymentStatus" AS ENUM ('active', 'resigned', 'terminated');
CREATE TYPE payroll."PayFrequency" AS ENUM ('monthly', 'semi_monthly', 'weekly');
CREATE TYPE payroll."PayrollRunStatus" AS ENUM ('draft', 'processing', 'finalized', 'paid');

CREATE TYPE tax_engine."ComputationType" AS ENUM ('income_tax', 'vat', 'percentage_tax', 'ewt', 'withholding_comp');
CREATE TYPE tax_engine."ComputationStatus" AS ENUM ('draft', 'confirmed');

CREATE TYPE compliance."Agency" AS ENUM ('bir', 'sss', 'philhealth', 'pagibig', 'lgu');
CREATE TYPE compliance."FilingStatus" AS ENUM ('upcoming', 'due_today', 'overdue', 'filed');
CREATE TYPE compliance."IssueType" AS ENUM ('missing_filing', 'missing_contribution', 'missing_document', 'vat_misclassification', 'duplicate_transaction', 'duplicate_expense', 'computation_error', 'missing_info', 'other_risk');
CREATE TYPE compliance."IssueSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE compliance."IssueStatus" AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');

CREATE TYPE ai."MessageSender" AS ENUM ('user', 'assistant');
CREATE TYPE ai."ConfidenceFlag" AS ENUM ('grounded', 'low_confidence', 'missing_info');

CREATE TYPE notifications."NotificationChannel" AS ENUM ('email', 'sms', 'push', 'in_app');
CREATE TYPE notifications."NotificationStatus" AS ENUM ('queued', 'sent', 'failed', 'read');

-- ============================================================
-- IDENTITY SCHEMA
-- ============================================================

CREATE TABLE identity.users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  CITEXT UNIQUE NOT NULL,
  password_hash          TEXT,
  auth_provider          identity."AuthProvider" NOT NULL DEFAULT 'local',
  provider_user_id       TEXT,
  first_name             TEXT NOT NULL,
  last_name              TEXT NOT NULL,
  phone_number           TEXT,
  is_email_verified      BOOLEAN NOT NULL DEFAULT false,
  is_platform_admin      BOOLEAN NOT NULL DEFAULT false,
  status                 identity."UserStatus" NOT NULL DEFAULT 'active',
  failed_login_attempts  SMALLINT NOT NULL DEFAULT 0,
  locked_until           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  refresh_token_hash  TEXT NOT NULL,
  device_fingerprint  TEXT NOT NULL,
  device_name         TEXT,
  ip_address          TEXT,
  user_agent          TEXT,
  is_remember_me      BOOLEAN NOT NULL DEFAULT false,
  last_active_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user_id ON identity.sessions(user_id);

CREATE TABLE identity.login_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  status      identity."LoginStatus" NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_history_user_created ON identity.login_history(user_id, created_at);

CREATE TABLE identity.password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT
);

CREATE TABLE identity.permissions (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code   TEXT UNIQUE NOT NULL,
  label  TEXT NOT NULL
);

CREATE TABLE identity.role_permissions (
  role_id        UUID NOT NULL REFERENCES identity.roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES identity.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- ORG SCHEMA
-- ============================================================

CREATE TABLE org.firms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_name      TEXT NOT NULL,
  firm_type      org."FirmType" NOT NULL,
  contact_email  TEXT NOT NULL,
  contact_number TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE org.companies (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                  UUID REFERENCES org.firms(id),
  business_name            TEXT NOT NULL,
  trade_name               TEXT,
  business_type            org."BusinessType" NOT NULL,
  taxpayer_classification  TEXT,
  vat_classification       org."VatClassification" NOT NULL,
  tin                      TEXT UNIQUE NOT NULL,
  rdo_code                 TEXT,
  sec_registration_number  TEXT,
  dti_registration_number  TEXT,
  cda_registration_number  TEXT,
  business_address         TEXT,
  email                    TEXT,
  contact_number           TEXT,
  registration_date        DATE,
  fiscal_year_start        DATE,
  accounting_method        org."AccountingMethod" NOT NULL DEFAULT 'accrual',
  currency                 TEXT NOT NULL DEFAULT 'PHP',
  logo_url                 TEXT,
  status                   org."CompanyStatus" NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE org.branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  branch_name     TEXT NOT NULL,
  branch_address  TEXT,
  rdo_code        TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX idx_branches_company_id ON org.branches(company_id);

CREATE TABLE documents.folders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL,
  name              TEXT NOT NULL,
  parent_folder_id  UUID REFERENCES documents.folders(id)
);

CREATE TABLE documents.documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL,
  folder_id            UUID REFERENCES documents.folders(id),
  category             TEXT NOT NULL,
  file_name            TEXT NOT NULL,
  storage_key          TEXT NOT NULL,
  mime_type            TEXT,
  size_bytes           BIGINT,
  uploaded_by          UUID,
  current_version_id   UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_company_folder ON documents.documents(company_id, folder_id);

CREATE TABLE documents.document_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents.documents(id) ON DELETE CASCADE,
  storage_key     TEXT NOT NULL,
  version_number  INTEGER NOT NULL,
  uploaded_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_versions_document_id ON documents.document_versions(document_id);

ALTER TABLE documents.documents
  ADD CONSTRAINT fk_documents_current_version
  FOREIGN KEY (current_version_id) REFERENCES documents.document_versions(id);

CREATE TABLE org.company_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  document_type  TEXT NOT NULL,
  document_id    UUID REFERENCES documents.documents(id),
  verified       BOOLEAN NOT NULL DEFAULT false,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_documents_company_id ON org.company_documents(company_id);

CREATE TABLE org.user_company_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  role_id       UUID NOT NULL REFERENCES identity.roles(id),
  invited_by    UUID REFERENCES identity.users(id),
  status        org."UserCompanyRoleStatus" NOT NULL DEFAULT 'pending',
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  UNIQUE (user_id, company_id, role_id)
);
CREATE INDEX idx_user_company_roles_company_id ON org.user_company_roles(company_id);

ALTER TABLE documents.folders
  ADD CONSTRAINT fk_folders_company FOREIGN KEY (company_id) REFERENCES org.companies(id) ON DELETE CASCADE;
ALTER TABLE documents.documents
  ADD CONSTRAINT fk_documents_company FOREIGN KEY (company_id) REFERENCES org.companies(id) ON DELETE CASCADE;

-- ============================================================
-- PAYROLL SCHEMA
-- ============================================================

CREATE TABLE payroll.employees (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  tin                TEXT,
  sss_number         TEXT,
  philhealth_number  TEXT,
  pagibig_number     TEXT,
  employment_status  payroll."EmploymentStatus" NOT NULL DEFAULT 'active',
  date_hired         DATE,
  basic_salary       NUMERIC(14,2) NOT NULL,
  pay_frequency      payroll."PayFrequency" NOT NULL DEFAULT 'monthly',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_company_id ON payroll.employees(company_id);

CREATE TABLE payroll.payroll_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  status        payroll."PayrollRunStatus" NOT NULL DEFAULT 'draft',
  created_by    UUID,
  finalized_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payroll_runs_company_id ON payroll.payroll_runs(company_id);

CREATE TABLE payroll.payslips (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id           UUID NOT NULL REFERENCES payroll.payroll_runs(id) ON DELETE CASCADE,
  employee_id              UUID NOT NULL REFERENCES payroll.employees(id),
  basic_pay                NUMERIC(14,2) NOT NULL,
  overtime_pay             NUMERIC(14,2) NOT NULL DEFAULT 0,
  holiday_pay              NUMERIC(14,2) NOT NULL DEFAULT 0,
  allowances               NUMERIC(14,2) NOT NULL DEFAULT 0,
  sss_contribution         NUMERIC(14,2) NOT NULL DEFAULT 0,
  philhealth_contribution  NUMERIC(14,2) NOT NULL DEFAULT 0,
  pagibig_contribution     NUMERIC(14,2) NOT NULL DEFAULT 0,
  withholding_tax          NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_pay                NUMERIC(14,2) NOT NULL,
  total_deductions         NUMERIC(14,2) NOT NULL,
  net_pay                  NUMERIC(14,2) NOT NULL,
  computation_snapshot     JSONB
);
CREATE INDEX idx_payslips_payroll_run_id ON payroll.payslips(payroll_run_id);
CREATE INDEX idx_payslips_employee_id ON payroll.payslips(employee_id);

-- ============================================================
-- TAX ENGINE SCHEMA
-- ============================================================

CREATE TABLE tax_engine.tax_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code         TEXT UNIQUE NOT NULL,
  description       TEXT,
  applies_to        TEXT,
  source_reference  TEXT,
  effective_from    DATE NOT NULL,
  effective_to      DATE,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tax_engine.tax_rates_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES tax_engine.tax_rules(id) ON DELETE CASCADE,
  rate_value      NUMERIC(8,5) NOT NULL,
  bracket_min     NUMERIC(14,2),
  bracket_max     NUMERIC(14,2),
  effective_from  DATE NOT NULL,
  effective_to    DATE
);
CREATE INDEX idx_tax_rates_history_rule_id ON tax_engine.tax_rates_history(rule_id);

CREATE TABLE tax_engine.tax_computations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  computation_type  tax_engine."ComputationType" NOT NULL,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  inputs            JSONB NOT NULL,
  rule_ids_used     UUID[] NOT NULL DEFAULT '{}',
  result            NUMERIC(14,2),
  missing_inputs    TEXT[] NOT NULL DEFAULT '{}',
  status            tax_engine."ComputationStatus" NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tax_computations_company_id ON tax_engine.tax_computations(company_id);

-- ============================================================
-- COMPLIANCE SCHEMA
-- ============================================================

CREATE TABLE compliance.filing_deadlines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  form_code     TEXT NOT NULL,
  agency        compliance."Agency" NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  due_date      DATE NOT NULL,
  status        compliance."FilingStatus" NOT NULL DEFAULT 'upcoming'
);
CREATE INDEX idx_filing_deadlines_company_due_status ON compliance.filing_deadlines(company_id, due_date, status);

CREATE TABLE compliance.compliance_status (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  category               TEXT NOT NULL,
  completed_count        INTEGER NOT NULL DEFAULT 0,
  pending_count          INTEGER NOT NULL DEFAULT 0,
  missing_count          INTEGER NOT NULL DEFAULT 0,
  overdue_count          INTEGER NOT NULL DEFAULT 0,
  compliance_percentage  NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_computed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_compliance_status_company_id ON compliance.compliance_status(company_id);

CREATE TABLE compliance.flagged_issues (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  issue_type           compliance."IssueType" NOT NULL,
  severity             compliance."IssueSeverity" NOT NULL,
  description          TEXT NOT NULL,
  recommended_action   TEXT,
  related_entity_type  TEXT,
  related_entity_id    TEXT,
  status               compliance."IssueStatus" NOT NULL DEFAULT 'open',
  detected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at          TIMESTAMPTZ
);
CREATE INDEX idx_flagged_issues_company_status ON compliance.flagged_issues(company_id, status);

-- ============================================================
-- FORMS SCHEMA
-- ============================================================

CREATE TABLE forms.form_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_code             TEXT UNIQUE NOT NULL,
  agency                compliance."Agency" NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  purpose               TEXT,
  filing_frequency      TEXT,
  default_due_rule      TEXT,
  required_attachments  TEXT[] NOT NULL DEFAULT '{}',
  file_url              TEXT,
  version               TEXT
);

-- ============================================================
-- AI SCHEMA
-- ============================================================

CREATE TABLE ai.ai_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES identity.users(id),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_conversations_company_id ON ai.ai_conversations(company_id);

CREATE TABLE ai.ai_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    UUID NOT NULL REFERENCES ai.ai_conversations(id) ON DELETE CASCADE,
  sender             ai."MessageSender" NOT NULL,
  content            TEXT NOT NULL,
  retrieved_sources  JSONB,
  confidence_flag    ai."ConfidenceFlag",
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_messages_conversation_id ON ai.ai_messages(conversation_id);

-- ============================================================
-- NOTIFICATIONS SCHEMA
-- ============================================================

CREATE TABLE notifications.notifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES org.companies(id),
  user_id              UUID NOT NULL REFERENCES identity.users(id),
  channel              notifications."NotificationChannel" NOT NULL,
  category             TEXT NOT NULL,
  title                TEXT NOT NULL,
  body                 TEXT NOT NULL,
  related_deadline_id  UUID,
  status               notifications."NotificationStatus" NOT NULL DEFAULT 'queued',
  scheduled_for        TIMESTAMPTZ,
  sent_at              TIMESTAMPTZ
);
CREATE INDEX idx_notifications_user_status ON notifications.notifications(user_id, status);

CREATE TABLE notifications.notification_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  channel     notifications."NotificationChannel" NOT NULL,
  category    TEXT NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id, channel, category)
);

-- ============================================================
-- AUDIT SCHEMA
-- ============================================================

CREATE TABLE audit.audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES org.companies(id),
  actor_user_id  UUID REFERENCES identity.users(id),
  action         TEXT NOT NULL,
  entity_type    TEXT,
  entity_id      TEXT,
  before_state   JSONB,
  after_state    JSONB,
  ip_address     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_company_created ON audit.audit_logs(company_id, created_at);

CREATE TABLE audit.security_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES identity.users(id),
  event_type  TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
