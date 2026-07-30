import { SetMetadata } from '@nestjs/common';

export const FIRM_PERMISSIONS_KEY = 'requiredFirmPermissions';

/**
 * Requires the authenticated user to hold ALL listed firm-permission codes
 * via an ACTIVE org.firm_memberships row on the firm resolved from the
 * route's :firmId param (see FirmPermissionsGuard). Firm permission codes
 * map to org.firm_permissions.code, e.g. 'firm:clients:assign'. Distinct
 * from @RequirePermissions, which checks company-level access instead.
 *
 * Usage: @RequireFirmPermissions('firm:clients:manage')
 */
export const RequireFirmPermissions = (...permissions: string[]) =>
  SetMetadata(FIRM_PERMISSIONS_KEY, permissions);
