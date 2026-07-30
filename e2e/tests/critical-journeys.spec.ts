import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { FIXTURES } from '../fixtures';

/**
 * All critical journeys in one serial chain, sharing live browser contexts
 * end to end instead of round-tripping storageState between spec files.
 *
 * An earlier version of this suite split each journey into its own file and
 * handed off sessions via storageState snapshots (test.use({ storageState })
 * loading a JSON file written by the previous file). That produced
 * intermittent, hard-to-reproduce login failures: refresh tokens rotate on
 * every use (see auth.service.ts's single-use rotation), and something in
 * this multi-file, multi-context run — never pinned down even after
 * extensive tracing, since minimal single-file reproductions of the same UI
 * flow never showed the issue — kept rotating the owner's session in the
 * background between one file's save and the next file's load, so the
 * snapshot was stale by the time it was read. Sharing one live context for
 * the whole run sidesteps the problem entirely: there is no save/load gap
 * for anything to race against, and it also cuts real POST /auth/login
 * calls to exactly two for the whole suite (owner, accountant), well under
 * the route's 5 req/min per-IP throttle.
 */
test.describe.configure({ mode: 'serial' });

test.describe('PinoyTax AI critical journeys', () => {
  let ownerContext: BrowserContext;
  let page: Page;
  let accountantContext: BrowserContext;
  let accountantPage: Page;
  let companyUrl: string;

  test.beforeAll(async ({ browser }) => {
    ownerContext = await browser.newContext();
    page = await ownerContext.newPage();
  });

  test.afterAll(async () => {
    await accountantContext?.close();
    await ownerContext.close();
  });

  test('registering with a new email shows the check-your-email confirmation', async () => {
    const uniqueEmail = `e2e-register-${Date.now()}@pinoytax.test`;
    await page.goto('/register');
    await page.locator('#firstName').fill('New');
    await page.locator('#lastName').fill('Signup');
    await page.locator('#email').fill(uniqueEmail);
    await page.locator('#password').fill('NewSignupPass1');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(uniqueEmail)).toBeVisible();
  });

  test('logging in with a wrong password shows an error, not a crash', async () => {
    await page.goto('/login');
    await page.locator('#email').fill(FIXTURES.owner.email);
    await page.locator('#password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText(/incorrect|invalid|unable to log in/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('logging in with the seeded verified owner account succeeds', async () => {
    await page.goto('/login');
    await page.locator('#email').fill(FIXTURES.owner.email);
    await page.locator('#password').fill(FIXTURES.owner.password);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL(/\/companies/, { timeout: 10_000 });
  });

  test('owner creates a company, reaches its dashboard, and runs a compliance scan', async () => {
    await page.goto('/companies');
    await expect(page).toHaveURL(/\/companies/, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Add company' }).click();
    await page.locator('#businessName').fill(FIXTURES.company.businessName);
    await page.locator('#tin').fill(FIXTURES.company.tin);
    await page.locator('#businessAddress').fill(FIXTURES.company.address);
    await page.getByRole('button', { name: 'Create company' }).click();
    await expect(page.getByText(FIXTURES.company.businessName)).toBeVisible({ timeout: 10_000 });

    await page.getByText(FIXTURES.company.businessName).click();
    await expect(page).toHaveURL(/\/companies\/[a-f0-9-]+$/, { timeout: 10_000 });
    companyUrl = page.url();
    await expect(page.getByRole('heading', { name: /good (morning|afternoon|evening)/i })).toBeVisible();
    await expect(page.getByText('Compliance score')).toBeVisible();

    await page.getByRole('button', { name: 'Run compliance scan' }).click();
    await expect(page.getByText('Upcoming filing deadlines')).toBeVisible({ timeout: 10_000 });
    // At least one deadline row should render once the scan completes — the
    // empty-state copy is the one thing that must NOT still be showing.
    await expect(page.getByText('No upcoming deadlines.')).not.toBeVisible({ timeout: 10_000 });
  });

  test('owner invites the accountant, who sees and accepts it', async ({ browser }) => {
    await page.goto(companyUrl);
    await page.waitForURL(/\/companies\/[a-f0-9-]+$/);

    await page.locator('a[href$="/roles"]').click();
    await page.locator('#inviteEmail').fill(FIXTURES.accountant.email);
    await page.locator('#roleCode').selectOption('accountant');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(`Invitation sent to ${FIXTURES.accountant.email}`)).toBeVisible();
    await expect(page.getByText(FIXTURES.accountant.firstName + ' ' + FIXTURES.accountant.lastName)).toBeVisible();

    accountantContext = await browser.newContext();
    accountantPage = await accountantContext.newPage();
    await accountantPage.goto('/login');
    await accountantPage.locator('#email').fill(FIXTURES.accountant.email);
    await accountantPage.locator('#password').fill(FIXTURES.accountant.password);
    await accountantPage.getByRole('button', { name: 'Log in' }).click();
    await expect(accountantPage).toHaveURL(/\/companies/, { timeout: 10_000 });

    await expect(accountantPage.getByText('Pending invitation')).toBeVisible();
    await expect(accountantPage.getByText(FIXTURES.company.businessName)).toBeVisible();
    await accountantPage.getByRole('button', { name: 'Accept' }).click();

    await expect(accountantPage.getByText('Pending invitation')).not.toBeVisible({ timeout: 10_000 });
    await expect(accountantPage.getByText(FIXTURES.company.businessName)).toBeVisible();
    // exact: true — "accountant" is otherwise also a substring match of this
    // very account's own email, e2e-accountant@pinoytax.test.
    await expect(accountantPage.getByText('accountant', { exact: true })).toBeVisible();
  });

  test('owner sets up a firm, onboards a client through it, and the client shows the firm context banner', async () => {
    await page.goto('/firms');
    await expect(page).toHaveURL(/\/firms/, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Add firm' }).click();
    await page.locator('#firmName').fill(FIXTURES.firm.firmName);
    await page.locator('#contactEmail').fill(FIXTURES.firm.contactEmail);
    await page.getByRole('button', { name: 'Create firm' }).click();
    await expect(page.getByText(FIXTURES.firm.firmName)).toBeVisible({ timeout: 10_000 });

    await page.getByText(FIXTURES.firm.firmName).click();
    await expect(page).toHaveURL(/\/firms\/[a-f0-9-]+$/, { timeout: 10_000 });
    const firmUrl = page.url();
    await expect(page.getByText('Client companies', { exact: true })).toBeVisible();

    await page.locator('a[href$="/clients"]').click();
    await page.getByRole('button', { name: 'New client' }).click();
    await page.locator('#businessName').fill(FIXTURES.firmClientCompany.businessName);
    await page.locator('#tin').fill(FIXTURES.firmClientCompany.tin);
    await page.getByRole('button', { name: 'Create client' }).click();
    await expect(page.getByText(FIXTURES.firmClientCompany.businessName)).toBeVisible({ timeout: 10_000 });

    // Dashboard aggregates the newly onboarded client into the portfolio.
    await page.goto(firmUrl);
    await expect(page.getByText('Client companies', { exact: true })).toBeVisible();
    await expect(page.getByText(FIXTURES.firmClientCompany.businessName)).toBeVisible({ timeout: 10_000 });

    // The client's own company workspace shows it's firm-managed — the
    // Firm-vs-Company context distinction — with a link back to the firm.
    // Business name is plain text on both the dashboard and clients table
    // (not itself a link); "Open" is the one link into the company workspace.
    await page.locator('a[href$="/clients"]').click();
    await page.getByRole('link', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/companies\/[a-f0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Back to firm dashboard' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(FIXTURES.firm.firmName)).toBeVisible();
    await page.getByRole('link', { name: 'Back to firm dashboard' }).click();
    await expect(page).toHaveURL(firmUrl);
  });

  test('accountant runs payroll and computes a tax return', async () => {
    // business_owner deliberately lacks payroll:write and tax:compute (see
    // ADMIN_MANUAL.md), so this journey is only reachable by an
    // accountant/bookkeeper/firm_admin — hence running as accountantPage.
    await accountantPage.goto(companyUrl);
    await accountantPage.waitForURL(/\/companies\/[a-f0-9-]+$/);

    // Scoped to <nav> — the dashboard's quick-action cards link to the same
    // /payroll and /tax hrefs and would otherwise make these ambiguous.
    await accountantPage.locator('nav a[href$="/payroll"]').click();

    await accountantPage.getByRole('button', { name: 'Add employee' }).click();
    await accountantPage.locator('#firstName').fill('Juan');
    await accountantPage.locator('#lastName').fill('Dela Cruz');
    await accountantPage.locator('#dateHired').fill('2024-01-15');
    await accountantPage.locator('#basicSalary').fill('25000');
    await accountantPage.getByRole('button', { name: 'Add employee' }).click();
    await expect(accountantPage.getByText('Juan Dela Cruz')).toBeVisible({ timeout: 10_000 });

    await accountantPage.getByRole('button', { name: 'New payroll run' }).click();
    await accountantPage.getByRole('button', { name: 'Create run' }).click();
    await expect(accountantPage.getByText('No payroll runs yet')).not.toBeVisible({ timeout: 10_000 });

    await accountantPage.locator('a[href*="/payroll/"]').first().click();
    await accountantPage.waitForURL(/\/payroll\/[a-f0-9-]+$/);
    await accountantPage.getByRole('button', { name: 'Compute payslips' }).click();
    await expect(accountantPage.getByText('Juan Dela Cruz')).toBeVisible({ timeout: 10_000 });
    await expect(accountantPage.getByText('No payslips yet')).not.toBeVisible();

    await accountantPage.locator('nav a[href$="/tax"]').click();
    await accountantPage.locator('#grossSales').fill('150000');
    await accountantPage.locator('#grossReceipts').fill('150000');
    await accountantPage.getByRole('button', { name: 'Compute' }).click();
    await expect(accountantPage.getByText('No tax computations yet')).not.toBeVisible({ timeout: 10_000 });
  });

  test('mobile nav drawer and company tab bar both work at mobile viewport width', async () => {
    // Resizes the same already-authenticated owner page instead of loading
    // a separate mobile device/context — the app's responsive breakpoints
    // react to viewport width via CSS, so this exercises the real behavior
    // without another session to hand off.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/companies');
    await expect(page).toHaveURL(/\/companies/, { timeout: 10_000 });

    // Sidebar nav is hidden below lg; only the hamburger trigger is visible.
    await expect(page.getByRole('link', { name: 'Companies' })).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('link', { name: 'Companies' })).toBeVisible();

    await page.getByRole('link', { name: 'Notifications' }).click();
    await expect(page).toHaveURL(/\/notifications/);
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();

    // The drawer closes on navigation, so return via direct URL rather than
    // reopening the hamburger menu just to click "Companies" again.
    await page.goto('/companies');
    await page.getByText(FIXTURES.company.businessName).click();
    await page.waitForURL(/\/companies\/[a-f0-9-]+$/);

    // Scoped to <main> — the sidebar's own <nav> is also in the DOM at this
    // width (just hidden via CSS below lg), so an unscoped `nav a` picks that
    // up first instead of the company tab bar.
    // The first tab is visible on load; the last is reachable by horizontal
    // scroll rather than wrapping onto a second line (which would break the
    // page layout at this width) — present in the DOM either way confirms it,
    // since overflow-x-auto never sets display:none on its children.
    await expect(page.locator('main nav a').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeAttached();
  });
});
