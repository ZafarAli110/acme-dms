import type {Bin} from '#persistence/schema/index';

/** Every business table has the same audit columns (persistence/schema/columns/audit-columns.ts). */
type AuditFields = Pick<
  Bin,
  'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'isDeleted' | 'deletedAt' | 'deletedBy'
>;

/** The audit columns of a new row: created and last updated by `userId` at `at`, not deleted. */
export function createdAudit(userId: string, at: Temporal.Instant): AuditFields {
  return {
    createdAt: at,
    createdBy: userId,
    updatedAt: at,
    updatedBy: userId,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
  };
}

/** The audit columns of a change to an existing row. */
export function updatedAudit(userId: string, at: Temporal.Instant): Pick<AuditFields, 'updatedAt' | 'updatedBy'> {
  return {updatedAt: at, updatedBy: userId};
}
