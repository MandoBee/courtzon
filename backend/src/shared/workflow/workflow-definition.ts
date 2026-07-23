import type { EnvelopeContext } from '../event-bus/event-envelope.js';

export type StepType = 'START_COMMAND' | 'WAIT_EVENT' | 'DELAY' | 'CONDITION' | 'PARALLEL' | 'END';

export type BranchType = 'parallel' | 'condition';
export type BranchStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStepDefinition {
  name: string;
  type: StepType;
  next?: string;
  onCompensation?: string;
  timeoutMs?: number;
  commandType?: string;
  commandPayload?: string;
  eventName?: string;
  correlationKey?: string;
  condition?: string;
  trueBranch?: string;
  falseBranch?: string;
  branches?: WorkflowStepDefinition[][];
  joinStep?: string;
  maxRetries?: number;
}

export interface WorkflowDefinition {
  workflowType: string;
  version: number;
  startStep: string;
  steps: WorkflowStepDefinition[];
  compensationStep?: string;
}

export interface WorkflowContext {
  workflowInstanceId: number;
  workflowType: string;
  definitionVersion: number;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId: string;
  actorId: number | null;
  payload: Record<string, unknown>;
  currentStep: string;
  currentVersion: number;
}

export interface WorkflowEventToEmit {
  eventName: string;
  payload: Record<string, unknown>;
  context: EnvelopeContext;
}
