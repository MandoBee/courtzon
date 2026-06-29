const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Normalise and validate pagination parameters.
 * - page and limit are coerced to integers
 * - page defaults to 1, must be >= 1
 * - limit defaults to 20, capped at MAX_LIMIT, must be >= 1
 * - offset is calculated as (page - 1) * limit
 */
export function buildPagination(rawPage?: unknown, rawLimit?: unknown): Pagination {
  let page = Number(rawPage);
  let limit = Number(rawLimit);

  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return {
    page: Math.floor(page),
    limit: Math.floor(limit),
    offset: Math.floor((page - 1) * limit),
  };
}

/**
 * Append a safely-interpolated LIMIT/OFFSET clause to a SQL string.
 * LIMIT and OFFSET cannot be parameterised in MySQL prepared statements
 * (pool.execute), so we interpolate them as validated integers.
 *
 * Example: `paginationClause(pag)` → `" LIMIT 20 OFFSET 0"`
 */
export function paginationClause(pag: Pagination): string {
  return ` LIMIT ${pag.limit} OFFSET ${pag.offset}`;
}

/**
 * Append LIMIT only (no OFFSET). Used for queries that only need a cap.
 */
export function limitClause(limit: number, max: number = MAX_LIMIT): string {
  const n = Math.floor(limit);
  if (!Number.isFinite(n) || n < 1) return ` LIMIT ${DEFAULT_LIMIT}`;
  if (n > max) return ` LIMIT ${max}`;
  return ` LIMIT ${n}`;
}
