# Admin Manual — PinoyTax AI v1.0

This manual covers the two distinct kinds of "admin" in PinoyTax AI: **platform administrators** (operate the whole platform, across every company) and **company staff roles** (manage one business's own PinoyTax AI account). Most people reading this manual want the second one — skip to [Company staff roles](#company-staff-roles--permissions) if you're setting up a business, not operating the platform itself.

## Platform administration

A platform administrator is any user account with `isPlatformAdmin = true`. This is a platform-operator role, not a customer-facing one — it grants visibility across every company on the platform and is intended for the team running PinoyTax AI itself.

### Granting platform admin access

There is no UI to promote a user to platform admin (by design — it's too sensitive an action to expose in-app). Two ways to grant it:

1. **At initial seed time**, set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before running `npm run prisma:seed` (see `DEPLOYMENT.md` §3). This creates one platform admin account.
2. **Later, directly in the database**: update `identity.users.is_platform_admin` to `true` for the target user's row. Do this only for people who genuinely need cross-company visibility — every platform admin can see every company's audit logs and every user's security events.

### What a platform admin can do (`/admin`)

Navigate to **Admin** in the left sidebar (only visible to platform admins; everyone else is shown a "restricted" message if they somehow reach the URL directly).

- **Platform-wide security events** — a live table of the last 100 security-relevant events across every user: failed logins, account lockouts, password resets, permission-denied events. Use this to spot credential-stuffing patterns or investigate a specific user's account activity.
- **Audit logs by company** — paste any company's UUID to pull its append-only audit trail (every create/update/delete action, who did it, when). Useful for support investigations or compliance requests from a customer. The company UUID is visible in that company's URL (`/companies/<uuid>`) once you're viewing it, or in the security events table's context.

Platform admins do **not** automatically get access to a company's payroll, tax, or document data through the normal company-scoped pages — that access is governed entirely by company-level roles (below). The `/admin` surface is audit/security visibility only, not a backdoor into business data.

## Company staff roles & permissions

Every company has its own staff list, managed from **Settings → Manage staff roles & permissions**, or directly at **Roles** in the company's left tab bar.

### Roles and what they can do

| Role | company | staff | payroll | tax | compliance | documents | AI assistant |
|---|---|---|---|---|---|---|---|
| **Business owner** | read, write | invite | read only | — | read | read, write | use |
| **Accountant** | read | — | read, write, finalize | compute, confirm | read, write | read, write | use |
| **Bookkeeper** | read | — | read, write | compute | read | read, write | use |
| **Firm admin** | read, write | invite | read, write, finalize | compute, confirm | read, write | read, write | use |
| *Administrator* | *all* | *all* | *all* | *all* | *all* | *all* | *use* |

*Administrator has every permission but is not currently assignable through the invite flow — it exists in the schema for a future firm-super-user use case. Assign it by editing the user's `user_company_role` row directly if you need it today.*

**The business owner cannot run tax computations or write payroll directly, by design.** The whole company access model assumes the owner manages the business relationship (company profile, staff, documents, compliance oversight) while an accountant or bookkeeper does the actual payroll runs and tax filings — mirroring how most Philippine small businesses actually work (they hire an accountant rather than self-file). If that doesn't match your customer's expectations, this is a product decision to revisit (see `KNOWN_LIMITATIONS.md`), not a bug to route around.

The company creator is automatically assigned **business owner** and cannot have that role revoked (the UI blocks it, and the API returns `CANNOT_REVOKE_OWNER` if attempted directly) — every company must always have exactly one owner.

### Inviting staff

1. Go to the company's **Roles** page.
2. Under **Invite staff**, enter the person's email and pick **Accountant** or **Bookkeeper**.
3. Click **Send invitation**. The invited person must already have a PinoyTax AI account (ask them to register first if they don't) — the invitation attaches to their existing account rather than creating one.
4. The new staff member appears in the **Staff on this company** table with status `pending` until they accept, then `active`.

Only **Business owner** and **Firm admin** roles can invite staff (`staff:invite` permission).

### Revoking access

From the staff table, click **Revoke** next to any non-owner staff member. Revoked staff immediately lose all access to that company; their row stays visible with status `revoked` for audit purposes rather than being deleted.

## Branch management

Under **Settings → Branches**, a company can register additional business locations (name, address, RDO code) beyond its main registered address. Branches can be deactivated and reactivated but not deleted, again for audit continuity. Branch management requires `company:write` — Business owner and Firm admin only.
