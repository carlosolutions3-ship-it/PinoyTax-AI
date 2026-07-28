# User Manual — PinoyTax AI v1.0

A guide to using PinoyTax AI as a business owner, accountant, or bookkeeper. For platform-operator and staff-role-management topics, see `ADMIN_MANUAL.md`.

## Getting started

### Creating an account

1. Go to **Create an account** from the login page.
2. Enter your first name, last name, email, phone number (optional), and a password (at least 8 characters, with an uppercase letter, a lowercase letter, and a number).
3. Check your email for a verification link — you must verify before you can log in.
4. Log in with your email and password. Check **Remember me** to stay signed in longer on that device.

Forgot your password? Use **Forgot password?** on the login page — if an account exists for that email, a reset link is sent.

### Adding your business

After logging in, you land on **Your companies**. If you have none yet, click **Add your first company** (or **Add company** from the top of the list) and fill in:

- **Business name** and optional **trade name**
- **Business type** — sole proprietorship, one-person corporation, partnership, or corporation
- **VAT classification** — VAT-registered or Non-VAT
- **TIN** in `000-000-000` or `000-000-000-00000` format
- **RDO code**, **business address**, **contact number** (all optional at creation, editable later)

You become that company's **business owner** automatically. See `ADMIN_MANUAL.md` for what that role can and can't do, and how to invite an accountant or bookkeeper.

## The company dashboard

Click into any company to reach its dashboard — the home base for that business, with a left sidebar (Companies, Notifications, Forms library, and Admin if you're a platform admin) and a top tab bar (Dashboard, Payroll, Tax, Documents, AI Assistant, Reports, Roles, Settings) scoped to the company you're viewing.

The dashboard shows:

- **Compliance score, open issues, upcoming deadlines, and overdue filings** as four summary tiles
- **Quick actions** — one click into Payroll, Tax, Documents, or the AI Assistant
- **Upcoming filing deadlines** and **flagged issues**, pulled from your last compliance scan

Click **Run compliance scan** any time to regenerate your filing calendar and re-check for issues (VAT-threshold misclassification, duplicate transactions, and similar checks) based on your current company profile and records.

## Payroll

**Payroll** tab → **Employees** to add staff (name, SSS/PhilHealth/Pag-IBIG numbers, TIN, date hired, basic salary, pay frequency), and **Payroll runs** to process pay for a period:

1. Click **New payroll run** and set the period start/end dates.
2. Open the run and click **Compute payslips** — this generates a payslip per active employee with SSS, PhilHealth, Pag-IBIG, and withholding tax computed automatically from the seeded contribution tables.
3. Review payslips. If any show an error (e.g. a missing employee number), fix the employee record and click **Recompute payslips**.
4. Once every payslip is clean, click **Finalize run** to lock it in. Finalized runs feed into **Reports**.

Search employees by name, and filter payroll runs by status (draft, processing, finalized, paid) once you have more than a few.

## Tax computations

**Tax** tab → **New computation**: pick a computation type (income tax, VAT, percentage tax, expanded withholding tax, or withholding tax on compensation), a period, and the relevant amounts (gross sales, gross receipts, business expenses, etc. — the form only asks for what that computation type actually needs). Click **Compute**.

If the computation can't produce a result (missing inputs), it tells you exactly what's missing. Once a result exists, click **Confirm** to lock it in — confirmed computations feed into **Reports**. Filter your computation history by type or status once it grows.

## Documents

The **Documents** vault stores anything related to your business — BIR forms, permits, receipts, payment confirmations — in folders, with versioning.

- **Upload document**: choose a file (25 MB max), a category, and optionally a folder.
- **New folder**: organize documents into a hierarchy.
- Click **Versions** on any document to see its version history or upload a new version of the same file.
- **Download** generates a time-limited signed link to the file.
- Use the search box and folder/category filters to find a document quickly once you have many.

## AI Tax Assistant

Ask questions about BIR, SSS, PhilHealth, or Pag-IBIG filing requirements, deadlines, and forms in plain language. The assistant is grounded in PinoyTax AI's regulatory database — it cites sources and flags when it isn't confident, rather than guessing. It will not compute peso amounts for you; use the **Tax** and **Payroll** tools for that.

Click one of the suggested prompts to get started, or type your own question. **New conversation** clears the current thread and starts fresh — your conversation is remembered for the session but not searchable as history yet.

## Reports

**Reports** summarizes what you've finalized: total gross/net pay and withholding tax across finalized payroll runs, confirmed tax by type, and your current compliance breakdown by category — each with a chart. Draft/unconfirmed records are intentionally excluded so the numbers only reflect settled, real figures.

## Government forms library

**Forms library** (left sidebar, not company-scoped) is a reference catalog of BIR/SSS/PhilHealth/Pag-IBIG forms — what each is for, its filing frequency, required attachments, and a download link where available. Search by form code, title, or description, or filter by agency.

## Notifications

**Notifications** (left sidebar) shows filing-deadline reminders sent to you (30/14/7/3/1 days before a deadline), and lets you turn each delivery channel (email, SMS, push, in-app) on or off per category. Filter your notification history by status and page through older ones once you have more than a page's worth.

## Your profile

Click your name/avatar at the bottom of the sidebar → **Profile** to see your account details, trigger a password-reset email, and review/revoke your active login sessions on other devices — useful if you think an old session (a shared computer, a lost device) is still logged in.

## Roles & settings

See `ADMIN_MANUAL.md`'s [Company staff roles & permissions](ADMIN_MANUAL.md#company-staff-roles--permissions) section for inviting staff and understanding what each role can do, and its [Branch management](ADMIN_MANUAL.md#branch-management) section for registering additional business locations. **Settings** also holds your editable business profile (trade name, VAT classification, RDO code, contact info, address).
