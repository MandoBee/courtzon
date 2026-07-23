import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../utils/logger.js';
import { withTransaction } from '../../database/database.transaction.js';
import { workflowInstanceRepository } from '../../infrastructure/workflow/workflow-instance.repository.js';
import { workflowStepRepository } from '../../infrastructure/workflow/workflow-step.repository.js';
import { workflowEventRepository } from '../../infrastructure/workflow/workflow-event.repository.js';
import { workflowRegistry } from './workflow-registry.js';
import { commandPipeline } from '../command/command-pipeline.js';
import { eventBusV2 } from '../event-bus/event-bus.v2.js';
import { registry } from '../../infrastructure/metrics/metrics.js';
import client from 'prom-client';
import type { WorkflowDefinition, WorkflowStepDefinition, WorkflowContext, WorkflowEventToEmit } from './workflow-definition.js';
import type { Command } from '../command/command-base.js';

const log = createModuleLogger('workflow');

const workflowsStartedTotal = new client.Counter({
  name: 'courtzon_workflow_engine_started_total',
  help: 'Total workflow instances started by the engine',
  labelNames: ['workflow_type'] as const,
  registers: [registry],
});

const workflowStepsExecutedTotal = new client.Counter({
  name: 'courtzon_workflow_engine_steps_total',
  help: 'Total workflow steps executed',
  labelNames: ['step_type', 'result'] as const,
  registers: [registry],
});

type Executor = mysql.Pool | mysql.PoolConnection;
function resolveExecutor(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

class WorkflowDispatcher {

  async startWorkflow(
    workflowType: string,
    payload: Record<string, unknown>,
    context: {
      correlationId: string;
      causationId?: string;
      actorId?: number;
      aggregateType: string;
      aggregateId: string;
    },
  ): Promise<number> {
    const definition = await workflowRegistry.getLatestDefinition(workflowType);
    if (!definition) {
      throw new Error(`No workflow definition found for type: ${workflowType}`);
    }

    const publicId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    const workflowId = await workflowInstanceRepository.create({
      publicId: publicId.substring(0, 26),
      workflowType: definition.workflowType,
      correlationId: context.correlationId,
      causationId: context.causationId,
      actorId: context.actorId,
      payload,
      context: { currentStep: definition.startStep },
    });

    const pool = getPool();
    await pool.execute(
      'UPDATE workflow_instances SET workflow_definition_version = ? WHERE id = ?',
      [definition.version, workflowId],
    );

    workflowsStartedTotal.inc({ workflow_type: workflowType });

    await this.advanceStep(workflowId, definition, definition.startStep, 1);

    return workflowId;
  }

  async dispatchEvent(
    eventName: string,
    correlationValue: string,
    eventPayload: Record<string, unknown>,
    envelopeContext: { correlationId: string; causationId: string },
  ): Promise<number> {
    const pool = getPool();
    const [subs] = await pool.execute(
      `SELECT id, workflow_instance_id, step_name FROM workflow_event_subscriptions
       WHERE event_name = ? AND correlation_value = ?`,
      [eventName, correlationValue],
    );

    const rows = subs as any[];
    if (!rows.length) {
      log.debug({ eventName, correlationValue }, 'event.no_subscribers');
      return 0;
    }

    for (const sub of rows) {
      await this.resumeFromEvent(sub.workflow_instance_id, sub.id, sub.step_name, eventPayload, envelopeContext);
    }

    return rows.length;
  }

  private async resumeFromEvent(
    workflowId: number,
    subscriptionId: number,
    stepName: string,
    eventPayload: Record<string, unknown>,
    envelopeContext: { correlationId: string; causationId: string },
  ): Promise<void> {
    await withTransaction(async (conn) => {
      const instance = await workflowInstanceRepository.findById(workflowId, conn);
      if (!instance) {
        log.warn({ workflowId }, 'workflow.not_found');
        return;
      }

      const definition = await workflowRegistry.getDefinition(
        instance.workflow_type,
        instance.workflow_definition_version || 1,
      );
      if (!definition) {
        log.error({ workflowId, type: instance.workflow_type }, 'workflow.definition_not_found');
        return;
      }

      await conn.execute(
        'DELETE FROM workflow_event_subscriptions WHERE id = ?',
        [subscriptionId],
      );

      const step = definition.steps.find(s => s.name === stepName);
      if (!step) {
        log.error({ workflowId, stepName }, 'workflow.step_not_found_in_definition');
        return;
      }

      await workflowEventRepository.create({
        workflowInstanceId: workflowId,
        eventName: step.eventName || stepName,
        eventBody: eventPayload,
        correlationId: envelopeContext.correlationId,
        causationId: envelopeContext.causationId,
      }, conn);

      const ctx: WorkflowContext = {
        workflowInstanceId: workflowId,
        workflowType: instance.workflow_type,
        definitionVersion: instance.workflow_definition_version || 1,
        aggregateType: 'workflow',
        aggregateId: String(workflowId),
        correlationId: envelopeContext.correlationId,
        causationId: envelopeContext.causationId,
        actorId: null,
        payload: eventPayload,
        currentStep: stepName,
        currentVersion: instance.version,
      };

      await this.executeStep(ctx, definition, step, conn);
    });
  }

  async advanceStep(
    workflowId: number,
    definition: WorkflowDefinition,
    stepName: string,
    expectedVersion: number,
  ): Promise<void> {
    await withTransaction(async (conn) => {
      const instance = await workflowInstanceRepository.findById(workflowId, conn);
      if (!instance) throw new Error(`Workflow ${workflowId} not found`);

      const stepDef = definition.steps.find(s => s.name === stepName);
      if (!stepDef) throw new Error(`Step ${stepName} not found in definition ${definition.workflowType}`);

      const ctx: WorkflowContext = {
        workflowInstanceId: workflowId,
        workflowType: instance.workflow_type,
        definitionVersion: instance.workflow_definition_version || 1,
        aggregateType: 'workflow',
        aggregateId: String(workflowId),
        correlationId: instance.correlation_id || '',
        causationId: '',
        actorId: instance.actor_id,
        payload: instance.payload || {},
        currentStep: stepName,
        currentVersion: instance.version,
      };

      await this.executeStep(ctx, definition, stepDef, conn);
    });
  }

  private async executeStep(
    ctx: WorkflowContext,
    definition: WorkflowDefinition,
    step: WorkflowStepDefinition,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    switch (step.type) {
      case 'START_COMMAND':
        await this.executeStartCommand(ctx, step, conn);
        break;
      case 'WAIT_EVENT':
        await this.executeWaitEvent(ctx, step, conn);
        break;
      case 'DELAY':
        await this.executeDelay(ctx, step, conn);
        break;
      case 'CONDITION':
        await this.executeCondition(ctx, step, definition, conn);
        return;
      case 'PARALLEL':
        await this.executeParallel(ctx, step, definition, conn);
        return;
      case 'END':
        await this.executeEnd(ctx, conn);
        return;
    }

    if (step.next) {
      await this.transitionTo(ctx, definition, step.next, conn);
    }
  }

  private async executeStartCommand(
    ctx: WorkflowContext,
    step: WorkflowStepDefinition,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    const stepId = await workflowStepRepository.create({
      workflowInstanceId: ctx.workflowInstanceId,
      stepName: step.name,
      input: ctx.payload,
      maxRetries: step.maxRetries ?? 3,
    }, conn);

    await workflowStepRepository.updateStatus(stepId, 'active', conn);

    const command: Command = {
      commandId: `${ctx.correlationId}:${step.name}`,
      commandType: step.commandType || step.name,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      payload: step.commandPayload ? JSON.parse(step.commandPayload) : ctx.payload,
      actorId: ctx.actorId ?? undefined,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
    };

    const handler = {
      validate: async () => {},
      execute: async (cmd: Command, txConn: mysql.PoolConnection) => {
        await workflowStepRepository.updateStatus(stepId, 'completed', txConn);
        workflowStepsExecutedTotal.inc({ step_type: step.type, result: 'processed' });
        return { processed: true };
      },
    };

    const result = await commandPipeline.execute(command, handler);

    if (result.status === 'error') {
      await workflowStepRepository.updateStatus(stepId, 'failed', conn);
      workflowStepsExecutedTotal.inc({ step_type: step.type, result: 'error' });
      await workflowInstanceRepository.updateStatus(ctx.workflowInstanceId, 'failed', ctx.currentVersion, conn);
      throw new Error(`Command ${command.commandType} failed: ${result.message}`);
    }
  }

  private async executeWaitEvent(
    ctx: WorkflowContext,
    step: WorkflowStepDefinition,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    const stepId = await workflowStepRepository.create({
      workflowInstanceId: ctx.workflowInstanceId,
      stepName: step.name,
      input: ctx.payload,
      timeoutAt: step.timeoutMs ? new Date(Date.now() + step.timeoutMs) : undefined,
    }, conn);

    await workflowStepRepository.updateStatus(stepId, 'active', conn);

    const correlationValue = step.correlationKey === 'aggregateId'
      ? ctx.aggregateId
      : String(ctx.payload[step.correlationKey || ''] || ctx.aggregateId);

    await conn.execute(
      `INSERT INTO workflow_event_subscriptions (workflow_instance_id, step_name, event_name, correlation_value)
       VALUES (?, ?, ?, ?)`,
      [ctx.workflowInstanceId, step.name, step.eventName || '', correlationValue],
    );

    await workflowInstanceRepository.updateStatus(ctx.workflowInstanceId, 'active', ctx.currentVersion, conn);

    workflowStepsExecutedTotal.inc({ step_type: step.type, result: 'waiting' });
  }

  private async executeDelay(
    ctx: WorkflowContext,
    step: WorkflowStepDefinition,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    const timeoutAt = step.timeoutMs ? new Date(Date.now() + step.timeoutMs) : new Date(Date.now() + 3600000);

    await workflowStepRepository.create({
      workflowInstanceId: ctx.workflowInstanceId,
      stepName: step.name,
      timeoutAt,
      input: ctx.payload,
    }, conn);

    workflowStepsExecutedTotal.inc({ step_type: step.type, result: 'waiting' });
  }

  private async executeCondition(
    ctx: WorkflowContext,
    step: WorkflowStepDefinition,
    definition: WorkflowDefinition,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    const stepId = await workflowStepRepository.create({
      workflowInstanceId: ctx.workflowInstanceId,
      stepName: step.name,
      input: ctx.payload,
    }, conn);

    await workflowStepRepository.updateStatus(stepId, 'active', conn);

    let conditionResult = false;
    if (step.condition) {
      try {
        conditionResult = this.evaluateCondition(step.condition, ctx);
      } catch {
        await workflowStepRepository.updateStatus(stepId, 'failed', conn);
        workflowStepsExecutedTotal.inc({ step_type: step.type, result: 'error' });
        throw new Error(`Condition evaluation failed for step: ${step.name}`);
      }
    }

    await workflowStepRepository.updateStatus(stepId, 'completed', conn);

    const nextStep = conditionResult ? step.trueBranch : step.falseBranch;
    workflowStepsExecutedTotal.inc({ step_type: step.type, result: conditionResult ? 'true' : 'false' });

    if (nextStep) {
      await this.transitionTo(ctx, definition, nextStep, conn);
    }
  }

  private evaluateCondition(condition: string, ctx: WorkflowContext): boolean {
    const safe = condition.trim();

    if (safe.startsWith('payload.')) {
      const path = safe.slice(8);
      const keys = path.split('.');
      let value: any = ctx.payload;
      for (const key of keys) {
        value = value?.[key];
      }
      if (safe.includes('>')) {
        const parts = safe.split('>');
        const field = parts[0].trim().slice(8);
        const compare = parseFloat(parts[1].trim());
        let fieldVal: any = ctx.payload;
        for (const k of field.split('.')) fieldVal = fieldVal?.[k];
        return Number(fieldVal) > compare;
      }
      if (safe.includes('<')) {
        const parts = safe.split('<');
        const compare = parseFloat(parts[1].trim());
        let fieldVal: any = ctx.payload;
        for (const k of parts[0].trim().slice(8).split('.')) fieldVal = fieldVal?.[k];
        return Number(fieldVal) < compare;
      }
      if (safe.includes('==')) {
        const parts = safe.split('==');
        const compare = parts[1].trim().replace(/^"/, '').replace(/"$/, '');
        let fieldVal: any = ctx.payload;
        for (const k of parts[0].trim().slice(8).split('.')) fieldVal = fieldVal?.[k];
        return String(fieldVal) === compare;
      }
      return !!value;
    }

    if (safe === 'true') return true;
    if (safe === 'false') return false;

    throw new Error(`Unsupported condition expression: ${condition}`);
  }

  private async executeParallel(
    ctx: WorkflowContext,
    step: WorkflowStepDefinition,
    definition: WorkflowDefinition,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    const stepId = await workflowStepRepository.create({
      workflowInstanceId: ctx.workflowInstanceId,
      stepName: step.name,
      input: ctx.payload,
    }, conn);

    await workflowStepRepository.updateStatus(stepId, 'active', conn);

    if (!step.branches) return;

    for (let i = 0; i < step.branches.length; i++) {
      const branchSteps = step.branches[i];
      if (!branchSteps.length) continue;

      const firstStep = branchSteps[0];
      await conn.execute(
        `INSERT INTO workflow_branch_instances (workflow_instance_id, branch_id, parent_step_id, branch_type, status, current_step_name)
         VALUES (?, ?, ?, 'parallel', 'active', ?)`,
        [ctx.workflowInstanceId, `${step.name}.branch_${i}`, stepId, firstStep.name],
      );
    }

    await workflowStepRepository.updateStatus(stepId, 'completed', conn);
    workflowStepsExecutedTotal.inc({ step_type: step.type, result: 'fanned_out' });
  }

  private async executeEnd(
    ctx: WorkflowContext,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    await workflowInstanceRepository.updateStatus(ctx.workflowInstanceId, 'completed', ctx.currentVersion, conn);

    await conn.execute(
      'DELETE FROM workflow_event_subscriptions WHERE workflow_instance_id = ?',
      [ctx.workflowInstanceId],
    );

    workflowStepsExecutedTotal.inc({ step_type: 'END', result: 'completed' });
  }

  private async transitionTo(
    ctx: WorkflowContext,
    definition: WorkflowDefinition,
    nextStep: string,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    const stepDef = definition.steps.find(s => s.name === nextStep);
    if (!stepDef) {
      log.error({ workflowId: ctx.workflowInstanceId, nextStep }, 'workflow.transition_step_not_found');
      await workflowInstanceRepository.updateStatus(ctx.workflowInstanceId, 'failed', ctx.currentVersion, conn);
      return;
    }

    ctx.currentStep = nextStep;
    await this.executeStep(ctx, definition, stepDef, conn);
  }
}

export const workflowDispatcher = new WorkflowDispatcher();
