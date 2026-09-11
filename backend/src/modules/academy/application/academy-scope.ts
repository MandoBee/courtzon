import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { canAccessOrganisation, canAccessBranch } from '../../../shared/middleware/org-access.js';
import type { AcademyLifecycleState } from '../domain/academy.types.js';

type RowData = import('mysql2').RowDataPacket[];

export interface AcademyScope {
  programId: number;
  organisationId: number | null;
  branchId: number | null;
  sportId: number | null;
  lifecycleState: AcademyLifecycleState;
}

/**
 * Resolve an Academy program's ownership scope server-side. Never trust the
 * organisation/branch supplied by the client as authorization — the stored
 * program record is authoritative.
 */
export async function resolveProgramScope(programId: number): Promise<AcademyScope | null> {
  const [rows] = await getPool().query<RowData>(
    `SELECT id AS program_id, organisation_id, branch_id, sport_id, lifecycle_state
     FROM academy_programs WHERE id = ? LIMIT 1`,
    [programId],
  );
  if (!rows.length) return null;
  const r = rows[0] as any;
  return {
    programId: Number(r.program_id),
    organisationId: r.organisation_id == null ? null : Number(r.organisation_id),
    branchId: r.branch_id == null ? null : Number(r.branch_id),
    sportId: r.sport_id == null ? null : Number(r.sport_id),
    lifecycleState: r.lifecycle_state,
  };
}

/**
 * Object-level authorization: the actor must be able to access the Academy's
 * organisation AND its branch. Denial is a non-revealing 404 (an organisation
 * must not learn another organisation's academy ids exist).
 */
export async function assertCanManageAcademy(actorId: number, scope: AcademyScope | null): Promise<void> {
  if (!actorId || !scope) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  if (!scope.organisationId) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  const orgOk = await canAccessOrganisation(actorId, scope.organisationId);
  if (!orgOk) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  if (scope.branchId) {
    const branchOk = await canAccessBranch(actorId, scope.branchId);
    if (!branchOk) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  }
}

/**
 * Validate a client-supplied ownership tuple on creation: branch must belong to
 * the organisation, and the sport must exist. Returns the resolved branch org id
 * (used to compare against the supplied organisation id).
 */
export async function validateAcademyScopeInput(organisationId: number, branchId: number | null, sportId: number | null): Promise<void> {
  const pool = getPool();
  const [orgRows] = await pool.query<RowData>('SELECT id FROM organisations WHERE id = ?', [organisationId]);
  if (!orgRows.length) throw new ConflictError('Invalid organisation', ErrorCodes.ACADEMY_INVALID_SCOPE);
  if (branchId != null) {
    const [branchRows] = await pool.query<RowData>(
      'SELECT id FROM branches WHERE id = ? AND organisation_id = ?', [branchId, organisationId],
    );
    if (!branchRows.length) throw new ConflictError('Branch does not belong to the organisation', ErrorCodes.ACADEMY_INVALID_SCOPE);
  }
  if (sportId != null) {
    const [sportRows] = await pool.query<RowData>('SELECT id FROM sports WHERE id = ?', [sportId]);
    if (!sportRows.length) throw new ConflictError('Invalid sport', ErrorCodes.ACADEMY_INVALID_SCOPE);
  }
}

/**
 * A valid Coach / Independent Coach per the existing identity model: an approved
 * coach profile that has not been deleted.
 */
export async function isApprovedCoach(userId: number): Promise<boolean> {
  const [rows] = await getPool().query<RowData>(
    `SELECT 1 FROM coach_profiles WHERE user_id = ? AND status = 'approved' AND deleted_at IS NULL LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

export type CoachRelation = 'contracted' | 'external';

/**
 * Whether the coach has an active organisation agreement with the Academy's
 * organisation. Used only to LABEL the Academy coach assignment
 * (contracted vs external) — it is NOT a gate; external independent coaches are
 * allowed by the Academy business rule.
 */
export async function getCoachOrgRelation(userId: number, organisationId: number): Promise<CoachRelation | null> {
  const [rows] = await getPool().query<RowData>(
    `SELECT 1 FROM coach_org_agreements coa
     JOIN coach_profiles cp ON cp.id = coa.coach_id
     WHERE cp.user_id = ? AND coa.organisation_id = ? AND coa.status IN ('accepted','active')
     LIMIT 1`,
    [userId, organisationId],
  );
  return rows.length ? 'contracted' : 'external';
}

/**
 * Object-level authorization for CREATING an Academy in a chosen scope: the
 * actor must be able to access the organisation and (when provided) the branch.
 */
export async function assertCanManageScopeInput(actorId: number, organisationId: number, branchId: number | null): Promise<void> {
  if (!actorId || !organisationId) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  const orgOk = await canAccessOrganisation(actorId, organisationId);
  if (!orgOk) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  if (branchId) {
    const branchOk = await canAccessBranch(actorId, branchId);
    if (!branchOk) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  }
}

export { NotFoundError, ForbiddenError };