/** Fixed test-fixture data shared by global-setup and every spec. Emails and
 * the TIN are deliberately distinctive so they're unambiguous test data if
 * ever seen in a shared/staging database. */
export const FIXTURES = {
  owner: {
    email: 'e2e-owner@pinoytax.test',
    password: 'E2eOwnerPass1',
    firstName: 'Erika',
    lastName: 'Owner',
  },
  accountant: {
    email: 'e2e-accountant@pinoytax.test',
    password: 'E2eAccountantPass1',
    firstName: 'Ana',
    lastName: 'Accountant',
  },
  company: {
    businessName: 'E2E Test Trading Co.',
    tin: '000-000-001',
    address: '123 Test Street, Makati City',
  },
  firm: {
    firmName: 'E2E Test Firm',
    contactEmail: 'e2e-firm-contact@pinoytax.test',
  },
  firmClientCompany: {
    businessName: 'E2E Firm Client Co.',
    tin: '000-000-002',
  },
};
