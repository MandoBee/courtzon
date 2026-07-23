import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../utils/logger.js';
import type { WorkflowDefinition } from './workflow-definition.js';

const log = createModuleLogger('workflow');

class WorkflowRegistry {

  async register(definition: WorkflowDefinition): Promise<void> {
    const pool = getPool();
    const [existing] = await pool.execute(
      'SELECT version FROM workflow_definitions WHERE workflow_type = ? ORDER BY version DESC LIMIT 1',
      [definition.workflowType],
    );
    const nextVersion = ((existing as any[])[0]?.version || 0) + 1;

    await pool.execute(
      'INSERT INTO workflow_definitions (workflow_type, version, definition) VALUES (?, ?, ?)',
      [definition.workflowType, nextVersion, JSON.stringify(definition)],
    );
    log.info({ workflowType: definition.workflowType, version: nextVersion }, 'definition.registered');
  }

  async getDefinition(workflowType: string, version: number): Promise<WorkflowDefinition | null> {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT definition FROM workflow_definitions WHERE workflow_type = ? AND version = ?',
      [workflowType, version],
    );
    if (!(rows as any[]).length) return null;
    const raw = (rows as any[])[0].definition;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as WorkflowDefinition;
  }

  async getLatestVersion(workflowType: string): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT MAX(version) as v FROM workflow_definitions WHERE workflow_type = ?',
      [workflowType],
    );
    return (rows as any[])[0]?.v || 0;
  }

  async getLatestDefinition(workflowType: string): Promise<WorkflowDefinition | null> {
    const version = await this.getLatestVersion(workflowType);
    if (version === 0) return null;
    return this.getDefinition(workflowType, version);
  }
}

export const workflowRegistry = new WorkflowRegistry();
