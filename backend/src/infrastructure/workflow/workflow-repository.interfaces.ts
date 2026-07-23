import type mysql from 'mysql2/promise';

// ── Workflow Status ──

export type WorkflowStatus = 'pending' | 'active' | 'completed' | 'failed' | 'compensating' | 'compensated' | 'cancelled';

export interface WorkflowInstanceRecord {
  id: number;
  public_id: string;
  workflow_type: string;
  status: WorkflowStatus;
  correlation_id: string | null;
  causation_id: string | null;
  actor_id: number | null;
  payload: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: number;
  workflow_definition_version: number;
}

export interface WorkflowInstanceCreate {
  publicId: string;
  workflowType: string;
  correlationId?: string;
  causationId?: string;
  actorId?: number;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

// ── Step Status ──

export type StepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped' | 'compensated';
export type StepType = 'activity' | 'compensation';
export type CompensationStatus = 'none' | 'pending' | 'completed' | 'failed';

export interface WorkflowStepRecord {
  id: number;
  workflow_instance_id: number;
  step_name: string;
  step_type: StepType;
  status: StepStatus;
  retry_count: number;
  max_retries: number;
  timeout_at: Date | null;
  compensation_status: CompensationStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export interface WorkflowStepCreate {
  workflowInstanceId: number;
  stepName: string;
  stepType?: StepType;
  maxRetries?: number;
  timeoutAt?: Date | string;
  input?: Record<string, unknown>;
}

// ── Event Types ──

export interface WorkflowEventRecord {
  id: number;
  workflow_instance_id: number;
  event_name: string;
  event_body: Record<string, unknown> | null;
  correlation_id: string | null;
  causation_id: string | null;
  created_at: Date;
}

export interface WorkflowEventCreate {
  workflowInstanceId: number;
  eventName: string;
  eventBody?: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
}

// ── Repository Interfaces ──

export interface IWorkflowInstanceRepository {
  create(data: WorkflowInstanceCreate, conn?: mysql.PoolConnection): Promise<number>;
  findById(id: number, conn?: mysql.PoolConnection): Promise<WorkflowInstanceRecord | null>;
  findByPublicId(publicId: string, conn?: mysql.PoolConnection): Promise<WorkflowInstanceRecord | null>;
  findActiveByType(workflowType: string, conn?: mysql.PoolConnection): Promise<WorkflowInstanceRecord[]>;
  findByCorrelationId(correlationId: string, conn?: mysql.PoolConnection): Promise<WorkflowInstanceRecord | null>;
  updateStatus(id: number, status: WorkflowStatus, expectedVersion: number, conn?: mysql.PoolConnection): Promise<boolean>;
  updateContext(id: number, context: Record<string, unknown>, expectedVersion: number, conn?: mysql.PoolConnection): Promise<boolean>;
  findTimeoutWorkflows(minutesThreshold?: number, conn?: mysql.PoolConnection): Promise<WorkflowInstanceRecord[]>;
}

export interface IWorkflowStepRepository {
  create(data: WorkflowStepCreate, conn?: mysql.PoolConnection): Promise<number>;
  findById(id: number, conn?: mysql.PoolConnection): Promise<WorkflowStepRecord | null>;
  findByWorkflowInstance(workflowInstanceId: number, page?: number, limit?: number, conn?: mysql.PoolConnection): Promise<{ rows: WorkflowStepRecord[]; total: number }>;
  updateStatus(id: number, status: StepStatus, conn?: mysql.PoolConnection): Promise<boolean>;
  updateRetry(id: number, output?: Record<string, unknown>, error?: string, conn?: mysql.PoolConnection): Promise<boolean>;
  updateCompensation(id: number, compensationStatus: CompensationStatus, conn?: mysql.PoolConnection): Promise<boolean>;
  findTimeoutSteps(conn?: mysql.PoolConnection): Promise<WorkflowStepRecord[]>;
}

export interface IWorkflowEventRepository {
  create(data: WorkflowEventCreate, conn?: mysql.PoolConnection): Promise<number>;
  findByWorkflowInstance(workflowInstanceId: number, page?: number, limit?: number, conn?: mysql.PoolConnection): Promise<{ rows: WorkflowEventRecord[]; total: number }>;
  findByCorrelationId(correlationId: string, page?: number, limit?: number, conn?: mysql.PoolConnection): Promise<{ rows: WorkflowEventRecord[]; total: number }>;
  getEventCount(workflowInstanceId: number, conn?: mysql.PoolConnection): Promise<number>;
}
