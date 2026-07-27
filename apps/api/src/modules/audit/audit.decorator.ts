import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'auditMetadata';

export interface AuditMetadata {
  action: string;
  entityType: string;
}

/**
 * Marks a mutating endpoint for automatic audit logging. Usage:
 *   @Audit({ action: 'payroll.finalize', entityType: 'payroll_run' })
 * The AuditInterceptor reads this metadata, captures the response body as
 * afterState, and writes an audit.audit_logs row — see Phase 2 §11.
 */
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_METADATA_KEY, metadata);
