import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { commandPipeline } from './command-pipeline.js';
import { processedCommandsRepository } from '../../infrastructure/command/processed-commands.repository.js';
import { withTransaction } from '../../database/database.transaction.js';
import { eventBusV2 } from '../event-bus/event-bus.v2.js';
import { ValidationError, ForbiddenError } from '../errors/app-error.js';
import type { Command, CommandHandler, CommandResult } from './command-base.js';

vi.mock('../../infrastructure/command/processed-commands.repository.js', () => ({
  processedCommandsRepository: {
    hasBeenProcessed: vi.fn(),
    recordProcessed: vi.fn(),
  },
}));

vi.mock('../../database/database.transaction.js', () => ({
  withTransaction: vi.fn(),
}));

vi.mock('../event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    emit: vi.fn(),
  },
}));

interface TestPayload {
  entityId: number;
  name: string;
}

interface TestResult {
  id: number;
  name: string;
}

const testCommand: Command = {
  commandId: 'cmd-ulid-001',
  commandType: 'TestCommand',
  aggregateType: 'test',
  aggregateId: '42',
  payload: { entityId: 1, name: 'test' },
  actorId: 1,
  correlationId: 'corr-001',
  causationId: 'caus-001',
};

function mockTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  return fn({} as PoolConnection);
}

describe('CommandPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path', () => {
    it('executes a command through all stages and returns processed', async () => {
      vi.mocked(processedCommandsRepository.hasBeenProcessed).mockResolvedValue(false);
      vi.mocked(processedCommandsRepository.recordProcessed).mockResolvedValue();
      vi.mocked(withTransaction).mockImplementation(async (cb) => {
        return cb({} as PoolConnection);
      });
      vi.mocked(eventBusV2.emit).mockResolvedValue();

      const handler: CommandHandler<typeof testCommand, TestResult> = {
        validate: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ id: 1, name: 'test' }),
        events: vi.fn().mockReturnValue([
          {
            eventName: 'test.created',
            payload: { id: 1 },
            context: { aggregateType: 'test', aggregateId: '42', aggregateVersion: 1 },
          },
        ]),
      };

      const result = await commandPipeline.execute(testCommand, handler);

      expect(result.status).toBe('processed');
      expect((result as CommandResult<TestResult>).data).toEqual({ id: 1, name: 'test' });

      expect(handler.validate).toHaveBeenCalledWith(testCommand);
      expect(processedCommandsRepository.hasBeenProcessed).toHaveBeenCalledWith(
        'cmd-ulid-001', 'TestCommand',
      );
      expect(processedCommandsRepository.recordProcessed).toHaveBeenCalled();
      expect(handler.execute).toHaveBeenCalledWith(testCommand, expect.anything());
      expect(handler.events).toHaveBeenCalled();
      expect(eventBusV2.emit).toHaveBeenCalledWith('test.created', { id: 1 }, expect.anything(), expect.anything());
    });

    it('skips commands that were already processed (idempotency)', async () => {
      vi.mocked(processedCommandsRepository.hasBeenProcessed).mockResolvedValue(true);

      const handler: CommandHandler<typeof testCommand, TestResult> = {
        validate: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ id: 1, name: 'test' }),
      };

      const result = await commandPipeline.execute(testCommand, handler);

      expect(result.status).toBe('skipped');
      expect((result as CommandResult<TestResult>).reason).toBe('idempotency');
      expect(handler.execute).not.toHaveBeenCalled();
    });

    it('handles commands with no events', async () => {
      vi.mocked(processedCommandsRepository.hasBeenProcessed).mockResolvedValue(false);
      vi.mocked(withTransaction).mockImplementation(async (cb) => cb({} as PoolConnection));

      const handler: CommandHandler<typeof testCommand, TestResult> = {
        validate: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ id: 1, name: 'test' }),
      };

      const result = await commandPipeline.execute(testCommand, handler);

      expect(result.status).toBe('processed');
      expect((result as CommandResult<TestResult>).data).toEqual({ id: 1, name: 'test' });
    });
  });

  describe('validation errors', () => {
    it('returns error for ValidationError', async () => {
      vi.mocked(processedCommandsRepository.hasBeenProcessed).mockResolvedValue(false);

      const handler: CommandHandler<typeof testCommand, TestResult> = {
        validate: vi.fn().mockRejectedValue(new ValidationError('Invalid name')),
        execute: vi.fn(),
      };

      const result = await commandPipeline.execute(testCommand, handler);

      expect(result.status).toBe('error');
      expect((result as any).code).toBe('VALIDATION_ERROR');
      expect((result as any).message).toBe('Invalid name');
      expect(handler.execute).not.toHaveBeenCalled();
    });

    it('returns error for ForbiddenError from authorize', async () => {
      vi.mocked(processedCommandsRepository.hasBeenProcessed).mockResolvedValue(false);

      const handler: CommandHandler<typeof testCommand, TestResult> = {
        validate: vi.fn().mockResolvedValue(undefined),
        authorize: vi.fn().mockRejectedValue(new ForbiddenError('Not allowed')),
        execute: vi.fn(),
      };

      const result = await commandPipeline.execute(testCommand, handler);

      expect(result.status).toBe('error');
      expect((result as any).code).toBe('FORBIDDEN');
      expect(handler.execute).not.toHaveBeenCalled();
    });
  });

  describe('transaction errors', () => {
    it('re-throws unexpected errors', async () => {
      vi.mocked(processedCommandsRepository.hasBeenProcessed).mockResolvedValue(false);
      vi.mocked(withTransaction).mockRejectedValue(new Error('DB connection failed'));

      const handler: CommandHandler<typeof testCommand, TestResult> = {
        validate: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({}),
      };

      await expect(commandPipeline.execute(testCommand, handler)).rejects.toThrow('DB connection failed');
    });
  });

  describe('authorization', () => {
    it('calls authorize when provided', async () => {
      vi.mocked(processedCommandsRepository.hasBeenProcessed).mockResolvedValue(false);
      vi.mocked(withTransaction).mockImplementation(async (cb) => cb({} as PoolConnection));

      const authorize = vi.fn().mockResolvedValue(undefined);
      const handler: CommandHandler<typeof testCommand, TestResult> = {
        validate: vi.fn().mockResolvedValue(undefined),
        authorize,
        execute: vi.fn().mockResolvedValue({ id: 1 }),
      };

      await commandPipeline.execute(testCommand, handler);
      expect(authorize).toHaveBeenCalledWith(testCommand);
    });

    it('skips authorize when not provided', async () => {
      vi.mocked(processedCommandsRepository.hasBeenProcessed).mockResolvedValue(false);
      vi.mocked(withTransaction).mockImplementation(async (cb) => cb({} as PoolConnection));

      const handler: CommandHandler<typeof testCommand, TestResult> = {
        validate: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ id: 1 }),
      };

      await expect(commandPipeline.execute(testCommand, handler)).resolves.toHaveProperty('status', 'processed');
    });
  });
});
