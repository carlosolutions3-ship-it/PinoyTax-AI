import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Requires the authenticated user to hold ALL listed permission codes on the
 * company resolved from the route's :companyId param (see PermissionsGuard)
 * in order to access this route. Permission codes map to
 * identity.permissions.code, e.g. 'payroll:write', 'filings:approve'.
 *
 * Usage: @RequirePermissions('payroll:write')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
