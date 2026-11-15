/**
 * Inventory authorisation policy (P1 — organisation-scoped Inventory).
 *
 * Two layers are deliberately kept separate:
 *
 *  1. CAPABILITY KEYS — the exact Inventory permissions an organisation role may
 *     hold. Inventory used to be a platform-only namespace (`ADMIN_ONLY_PREFIXES`
 *     in the role templates and `PLATFORM_ONLY_PREFIXES` in the org policy), which
 *     is why only Super Admin could ever use it. The allowlist below is the ONLY
 *     set of Inventory keys an organisation role may receive — never the whole
 *     `inventory.` namespace.
 *
 *  2. ORGANISATION SCOPE — a permission is valid only for the organisation the
 *     granting role belongs to. This module resolves the permission keys granted
 *     by roles bound to one organisation (org role clones via
 *     `roles.organisation_id`, or a global role with an active
 *     `user_role_scopes` row for that organisation). A permission granted for
 *     Organisation A therefore never authorises Organisation B.
 *
 * The `/admin/inventory/*` routes keep using the existing global
 * `requirePermission(...)` guard (platform administration, unchanged). Only the
 * new `/org/:orgId/inventory/*` routes use this organisation-aware guard.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { isPlatformAdmin } from '../../../shared/middleware/org-access.js';
import {
  canAccessInventoryOrganisation,
  findOrgBoundPermissionKeys,
  organisationExists,
} from '../infrastructure/repositories/inventory-access.repository.js';

/**
 * The complete, explicit Inventory capability allowlist.
 *
 * Existing keys (`inventory.warehouses.*`, `inventory.suppliers.*`,
 * `inventory.purchase-orders.*`, `inventory.stock.view`) are retained because
 * the established routes and UI already use them. `inventory.stock.adjust`,
 * `inventory.transfers.*`, `inventory.logs.view` and `inventory.reports.*` are
 * the granular capability keys introduced for organisation roles.
 */
export const INVENTORY_PERMISSION_KEYS = [
  'inventory.warehouses.view',
  'inventory.warehouses.manage',
  'inventory.suppliers.view',
  'inventory.suppliers.manage',
  'inventory.purchase-orders.view',
  'inventory.purchase-orders.manage',
  'inventory.stock.view',
  'inventory.stock.adjust',
  'inventory.transfers.view',
  'inventory.transfers.create',
  'inventory.transfers.complete',
  'inventory.transfers.cancel',
  'inventory.logs.view',
  'inventory.reports.view',
  'inventory.reports.export',
] as const;

/** The pre-P1 coarse keys. They stay valid as fallbacks until permission sync. */
export const LEGACY_INVENTORY_PERMISSION_KEYS = [
  'inventory.stock.manage',
] as const;

/**
 * Backward-compatible capability mapping. A caller that required the coarse
 * `inventory.stock.manage` key keeps working, and a role that still only holds
 * it can exercise the matching granular operation. The reverse is never true:
 * holding `inventory.stock.adjust` does not grant `inventory.stock.manage`
 * (which also covers transfers in the legacy admin routes).
 */
export const INVENTORY_PERMISSION_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  'inventory.stock.view': ['inventory.stock.manage'],
  'inventory.stock.adjust': ['inventory.stock.manage'],
  'inventory.transfers.view': ['inventory.stock.view', 'inventory.stock.manage'],
  'inventory.transfers.create': ['inventory.stock.manage'],
  'inventory.transfers.complete': ['inventory.stock.manage'],
  'inventory.transfers.cancel': ['inventory.stock.manage'],
  // Logs are a distinct capability in the organisation matrix: a stock viewer
  // (e.g. receptionist) must not read the movement log. Only the legacy coarse
  // `inventory.stock.manage` still implies logs for backward compatibility.
  'inventory.logs.view': ['inventory.stock.manage'],
  // Reports are finance/analyst data: never implied by stock viewing.
  'inventory.reports.export': ['inventory.reports.view'],
};

const INVENTORY_KEY_SET = new Set<string>(INVENTORY_PERMISSION_KEYS);

/** Strict positive-integer organisation id parser (route params). */
export function parseInventoryOrgId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  if (typeof raw === 'string' && !/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

/** True when `required` is granted directly or through its legacy fallback. */
export function isInventoryPermissionGranted(
  grantedKeys: Iterable<string>,
  requiredKey: string,
): boolean {
  const granted = grantedKeys instanceof Set ? grantedKeys : new Set(grantedKeys);
  if (granted.has(requiredKey)) return true;
  const fallbacks = INVENTORY_PERMISSION_FALLBACKS[requiredKey] ?? [];
  return fallbacks.some((key) => granted.has(key));
}

/** True when ANY of the required capabilities is granted. */
export function hasAnyInventoryPermission(
  grantedKeys: Iterable<string>,
  requiredKeys: readonly string[],
): boolean {
  const granted = grantedKeys instanceof Set ? grantedKeys : new Set(grantedKeys);
  return requiredKeys.some((key) => isInventoryPermissionGranted(granted, key));
}

/**
 * Normalise a raw permission list into the effective Inventory capability set:
 * every allowlisted key that is directly granted OR satisfied through a legacy
 * fallback. The frontend uses this list for page/tab/button gating, so the UI
 * reflects the same decision the route guard makes.
 */
export function expandInventoryPermissionKeys(grantedKeys: Iterable<string>): string[] {
  const granted = new Set(grantedKeys);
  const effective: string[] = [];
  for (const key of INVENTORY_PERMISSION_KEYS) {
    if (isInventoryPermissionGranted(granted, key)) effective.push(key);
  }
  return effective;
}

/** Keep only Inventory keys (used when returning effective permissions). */
export function filterInventoryPermissionKeys(keys: Iterable<string>): string[] {
  return [...new Set(keys)].filter((key) => INVENTORY_KEY_SET.has(key));
}

/**
 * Organisation-bound permission resolution is implemented in the repository
 * layer (SQL) and re-exported here so callers/tests keep a single policy entry
 * point.
 */
export const getOrgBoundPermissionKeys = findOrgBoundPermissionKeys;
export const userCanAccessInventoryOrganisation = canAccessInventoryOrganisation;

/** Scope resolved by the organisation-aware middleware for the current request. */
export interface OrgInventoryScope {
  orgId: number;
  isPlatformAdmin: boolean;
  permissions: string[];
}

/**
 * Resolve and authorise the Inventory organisation scope from `params.orgId`.
 * The client-supplied id is only a request: access and permissions are read
 * from the database.
 */
export async function resolveOrgInventoryScope(
  userId: number,
  rawOrgId: unknown,
): Promise<
  | { ok: true; scope: OrgInventoryScope }
  | { ok: false; status: 400 | 403; message: string }
> {
  const orgId = parseInventoryOrgId(rawOrgId);
  if (orgId === null) {
    return { ok: false, status: 400, message: 'Invalid organisation id' };
  }

  const platformAdmin = await isPlatformAdmin(userId);
  if (platformAdmin) {
    // Platform administrators retain platform-wide Inventory access, including
    // inactive organisations (existing platform policy). Deleted organisations
    // are rejected. Normal organisation users use the active-organisation
    // predicate below.
    if (!(await organisationExists(orgId))) {
      return { ok: false, status: 403, message: 'Organisation not found' };
    }
    return {
      ok: true,
      scope: {
        orgId,
        isPlatformAdmin: true,
        permissions: [...INVENTORY_PERMISSION_KEYS],
      },
    };
  }

  if (!(await userCanAccessInventoryOrganisation(userId, orgId))) {
    return { ok: false, status: 403, message: 'You do not have access to this organisation' };
  }

  const keys = await getOrgBoundPermissionKeys(userId, orgId);
  return {
    ok: true,
    scope: {
      orgId,
      isPlatformAdmin: false,
      permissions: expandInventoryPermissionKeys(keys),
    },
  };
}

/**
 * Organisation-aware Inventory permission guard.
 *
 * `requiredKeys` are alternatives: ANY satisfied capability (directly or via a
 * legacy fallback) allows the request. The resolved scope is attached to the
 * request so the existing controllers reuse it in `resolveOrgId()` instead of
 * resolving (and trusting) `?orgId=` a second time.
 */
export function requireOrgInventoryPermission(requiredKeys: readonly string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId as number | undefined;
    if (!userId) {
      return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    }
    try {
      const result = await resolveOrgInventoryScope(userId, (request.params as any)?.orgId);
      if (!result.ok) {
        return reply.status(result.status).send({
          error: result.status === 400 ? 'VALIDATION_ERROR' : 'FORBIDDEN',
          message: result.message,
        });
      }
      if (!hasAnyInventoryPermission(result.scope.permissions, requiredKeys)) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Insufficient Inventory permissions for this organisation',
        });
      }
      (request as any).orgInventoryScope = result.scope;
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Permission check failed' });
    }
  };
}

/**
 * Access-only guard for `GET /org/:orgId/inventory/access`: validates the
 * organisation (and returns an empty capability list for a role without
 * Inventory permissions) so the frontend can render an explicit "no access"
 * surface instead of guessing.
 */
export function requireOrgInventoryAccess() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId as number | undefined;
    if (!userId) {
      return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    }
    try {
      const result = await resolveOrgInventoryScope(userId, (request.params as any)?.orgId);
      if (!result.ok) {
        return reply.status(result.status).send({
          error: result.status === 400 ? 'VALIDATION_ERROR' : 'FORBIDDEN',
          message: result.message,
        });
      }
      (request as any).orgInventoryScope = result.scope;
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Permission check failed' });
    }
  };
}
