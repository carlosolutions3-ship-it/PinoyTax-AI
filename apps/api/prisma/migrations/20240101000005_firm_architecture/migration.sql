-- Firm architecture: a top-level Firm entity that can own/manage multiple
-- client companies, with its own staff invited once to the firm (not
-- per-client), and per-client access granted via an explicit, configurable
-- subset of the *existing* identity.permissions vocabulary. Company-level
-- RBAC (identity.roles / identity.permissions / org.user_company_roles) is
-- untouched by this migration — firm RBAC is an additive, parallel layer.
--
-- Hand-written (not `prisma migrate dev` output) because this database's
-- `id` columns are native Postgres UUID with a gen_random_uuid() default
-- (see the init migration), which differs from what Prisma's own diff
-- engine would generate for `@default(uuid())` (a plain TEXT column with an
-- app-side default) — letting the auto-generated diff run would have
-- rewritten every table's primary key column type. This migration follows
-- the same native-UUID convention as every prior migration in this project
-- instead.

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE org."FirmMembershipStatus" AS ENUM ('pending', 'active', 'revoked');
CREATE TYPE org."FirmCompanyAssignmentStatus" AS ENUM ('active', 'revoked');
CREATE TYPE org."FirmClientInvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'revoked');

-- ============================================================
-- FIRM-LEVEL RBAC
-- ============================================================

ALTER TABLE org.firms ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE org.firm_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT
);

CREATE TABLE org.firm_permissions (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code   TEXT UNIQUE NOT NULL,
  label  TEXT NOT NULL
);

CREATE TABLE org.firm_role_permissions (
  firm_role_id        UUID NOT NULL REFERENCES org.firm_roles(id) ON DELETE CASCADE,
  firm_permission_id  UUID NOT NULL REFERENCES org.firm_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (firm_role_id, firm_permission_id)
);

-- A firm staff member, invited once to the FIRM (not per client company).
CREATE TABLE org.firm_memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       UUID NOT NULL REFERENCES org.firms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  firm_role_id  UUID NOT NULL REFERENCES org.firm_roles(id),
  invited_by    UUID REFERENCES identity.users(id),
  status        org."FirmMembershipStatus" NOT NULL DEFAULT 'pending',
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  UNIQUE (user_id, firm_id)
);
CREATE INDEX idx_firm_memberships_firm_id ON org.firm_memberships(firm_id);

-- Grants one firm staff member access to one client company, scoped to an
-- explicit, configurable subset of identity.permissions. PermissionsGuard
-- unions this with any direct org.user_company_roles grant for the same
-- company — see permissions.guard.ts.
CREATE TABLE org.firm_company_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_membership_id  UUID NOT NULL REFERENCES org.firm_memberships(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  assigned_by         UUID REFERENCES identity.users(id),
  status              org."FirmCompanyAssignmentStatus" NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_membership_id, company_id)
);
CREATE INDEX idx_firm_company_assignments_company_id ON org.firm_company_assignments(company_id);

CREATE TABLE org.firm_company_assignment_permissions (
  assignment_id  UUID NOT NULL REFERENCES org.firm_company_assignments(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES identity.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, permission_id)
);

-- A firm's request to manage an already-existing, independently-owned
-- client company. The company's business_owner must accept (see
-- FirmService.respondToClientInvitation) — a firm can never attach a
-- company to itself unilaterally. Not used when a firm creates a brand-new
-- client company directly (that sets companies.firm_id at creation time).
CREATE TABLE org.firm_client_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       UUID NOT NULL REFERENCES org.firms(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  invited_by    UUID REFERENCES identity.users(id),
  status        org."FirmClientInvitationStatus" NOT NULL DEFAULT 'pending',
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ
);
CREATE INDEX idx_firm_client_invitations_firm_id ON org.firm_client_invitations(firm_id);
CREATE INDEX idx_firm_client_invitations_company_id_status ON org.firm_client_invitations(company_id, status);

-- ============================================================
-- ROW-LEVEL SECURITY — extend the existing company_id-based convention
-- (see 20240101000001_row_level_security / _003_force) to the two new
-- tables that carry a company_id column. Same current status applies: this
-- is defense-in-depth infrastructure, not yet a live control, because no
-- request path sets app.current_company_id (see PrismaService.
-- withTenantContext). Firm-scoped tables without a company_id column
-- (firms, firm_memberships, firm_roles, etc.) are outside this convention,
-- same as identity.users and other non-tenant-scoped tables today.
-- ============================================================

ALTER TABLE org.firm_company_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.firm_company_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON org.firm_company_assignments USING (
  company_id::text = current_setting('app.current_company_id', true)
  OR current_setting('app.current_company_id', true) IS NULL
  OR current_setting('app.current_company_id', true) = ''
);

ALTER TABLE org.firm_client_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.firm_client_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON org.firm_client_invitations USING (
  company_id::text = current_setting('app.current_company_id', true)
  OR current_setting('app.current_company_id', true) IS NULL
  OR current_setting('app.current_company_id', true) = ''
);
