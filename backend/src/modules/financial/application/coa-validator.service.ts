import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('coa-validator');
type RowData = RowDataPacket[];

/** Fixed COA hierarchy: max 4 levels */
export const MAX_COA_DEPTH = 4;
/** Postable level: only Level 4 */
export const POSTABLE_LEVEL = 4;

export interface CoaAccountInfo {
  id: number;
  code: string;
  name: string;
  type: string;
  parent_id: number | null;
  organisation_id: number | null;
  is_system: number;
  is_active: number;
  level: number;
  has_children: boolean;
}

export class CoaLevelValidator {
  private pool = getPool();

  /** Cache of account_id → level for performance */
  private levelCache = new Map<number, number>();
  private childCache = new Map<number, boolean>();

  async getAccountLevel(accountId: number): Promise<number> {
    if (this.levelCache.has(accountId)) return this.levelCache.get(accountId)!;

    const level = await this.computeLevel(accountId);
    this.levelCache.set(accountId, level);
    return level;
  }

  private async computeLevel(accountId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT id, parent_id FROM chart_of_accounts WHERE id = ? AND is_active = 1 LIMIT 1`,
      [accountId],
    );
    if (!rows.length) return 0;

    const acct = (rows as any[])[0];
    if (acct.parent_id == null) return 1;

    // Recurse up the tree (max 4 levels, so at most 3 iterations)
    let level = 1;
    let currentId: number | null = acct.parent_id;
    const visited = new Set<number>([accountId]);

    while (currentId != null) {
      if (visited.has(currentId)) {
        log.warn({ accountId, currentId }, 'Circular reference in COA hierarchy');
        return 0;
      }
      visited.add(currentId);
      level++;

      const [parentRows] = await this.pool.execute<RowData>(
        `SELECT id, parent_id FROM chart_of_accounts WHERE id = ? AND is_active = 1 LIMIT 1`,
        [currentId],
      );
      if (!parentRows.length) break;
      currentId = (parentRows as any[])[0].parent_id ?? null;
    }

    return level;
  }

  async hasChildren(accountId: number): Promise<boolean> {
    if (this.childCache.has(accountId)) return this.childCache.get(accountId)!;

    const [rows] = await this.pool.execute<RowData>(
      `SELECT 1 FROM chart_of_accounts WHERE parent_id = ? AND is_active = 1 LIMIT 1`,
      [accountId],
    );
    const result = rows.length > 0;
    this.childCache.set(accountId, result);
    return result;
  }

  async isPostable(accountId: number): Promise<boolean> {
    const level = await this.getAccountLevel(accountId);
    if (level !== POSTABLE_LEVEL) return false;

    const [rows] = await this.pool.execute<RowData>(
      `SELECT is_active FROM chart_of_accounts WHERE id = ? LIMIT 1`,
      [accountId],
    );
    if (!rows.length) return false;
    if (!(rows as any[])[0].is_active) return false;

    const hasChildren = await this.hasChildren(accountId);
    if (hasChildren) return false;

    return true;
  }

  async validatePostable(accountId: number, context: string): Promise<void> {
    const level = await this.getAccountLevel(accountId);

    if (level === 0) {
      throw new Error(`${context}: Account ${accountId} does not exist or is inactive`);
    }
    if (level > MAX_COA_DEPTH) {
      throw new Error(`${context}: Account ${accountId} is at level ${level} (> maximum ${MAX_COA_DEPTH})`);
    }
    if (level < POSTABLE_LEVEL) {
      throw new Error(`${context}: Account ${accountId} is at level ${level} (structural, only L4 is postable)`);
    }

    const [rows] = await this.pool.execute<RowData>(
      `SELECT is_active FROM chart_of_accounts WHERE id = ? LIMIT 1`,
      [accountId],
    );
    if (!(rows as any[])[0].is_active) {
      throw new Error(`${context}: Account ${accountId} is inactive`);
    }

    const hasChildren = await this.hasChildren(accountId);
    if (hasChildren) {
      throw new Error(`${context}: Account ${accountId} has children — cannot be a posting target`);
    }
  }

  async validateAccountCreation(
    parentId: number,
    organisationId: number | null,
    context: string,
  ): Promise<number> {
    const parentLevel = await this.getAccountLevel(parentId);
    if (parentLevel === 0) {
      throw new Error(`${context}: Parent account ${parentId} does not exist or is inactive`);
    }

    // Organization accounts can only be created at level 4
    // Parent must be L3 for org accounts; system accounts have special rules
    if (organisationId != null) {
      if (parentLevel !== 3) {
        throw new Error(
          `${context}: Organization accounts must attach to L3 parent (parent ${parentId} is at level ${parentLevel})`,
        );
      }
    }

    const newLevel = parentLevel + 1;
    if (newLevel > MAX_COA_DEPTH) {
      throw new Error(
        `${context}: Cannot create child under parent ${parentId} — would create level ${newLevel} (> maximum ${MAX_COA_DEPTH})`,
      );
    }
    if (newLevel > POSTABLE_LEVEL) {
      throw new Error(
        `${context}: Cannot create child under parent ${parentId} — would create level ${newLevel} (only L4 is postable, L5 is invalid)`,
      );
    }

    return newLevel;
  }

  /**
   * Validate that a parent account can receive children (for template application).
   * The resulting child must be at most level 4.
   */
  async validateTemplateParent(l3ParentCode: string, context: string): Promise<number> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE code = ? AND organisation_id IS NULL AND is_active = 1 LIMIT 1`,
      [l3ParentCode],
    );
    if (!rows.length) {
      throw new Error(`${context}: L3 parent with code '${l3ParentCode}' not found`);
    }
    const parentId = (rows as any[])[0].id;
    const parentLevel = await this.getAccountLevel(parentId);

    if (parentLevel !== 3) {
      throw new Error(
        `${context}: Template parent '${l3ParentCode}' is at level ${parentLevel}, expected L3`,
      );
    }

    return parentId;
  }

  clearCache(): void {
    this.levelCache.clear();
    this.childCache.clear();
  }
}

export const coaValidator = new CoaLevelValidator();
