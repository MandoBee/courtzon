import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../utils/logger.js';
import { withTransaction } from '../../database/database.transaction.js';
import { processedCommandsRepository } from '../../infrastructure/command/processed-commands.repository.js';
import { eventBusV2 } from '../event-bus/event-bus.v2.js';
import { ValidationError, ForbiddenError, ConflictError } from '../errors/app-error.js';
import { registry } from '../../infrastructure/metrics/metrics.js';
import client from 'prom-client';
import type { Command, CommandHandler, CommandResult, CommandError } from './command-base.js';

const log = createModuleLogger('command-pipeline');

const commandDuration = new client.Histogram({
  name: 'courtzon_command_duration_seconds',
  help: 'Command execution duration',
  labelNames: ['command_type', 'result'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

const commandTotal = new client.Counter({
  name: 'courtzon_command_total',
  help: 'Total commands processed by the pipeline',
  labelNames: ['command_type', 'result'] as const,
  registers: [registry],
});

const idempotencySkippedTotal = new client.Counter({
  name: 'courtzon_command_idempotency_skipped_total',
  help: 'Total commands skipped due to idempotency',
  labelNames: ['command_type'] as const,
  registers: [registry],
});

class CommandPipeline {

  async execute<TCommand extends Command, TResult>(
    command: TCommand,
    handler: CommandHandler<TCommand, TResult>,
  ): Promise<CommandResult<TResult> | CommandError> {
    const start = Date.now();

    try {
      log.debug({ commandId: command.commandId, commandType: command.commandType }, 'command.started');

      await handler.validate(command);

      if (handler.authorize) {
        await handler.authorize(command);
      }

      const alreadyProcessed = await processedCommandsRepository.hasBeenProcessed(
        command.commandId,
        command.commandType,
      );

      if (alreadyProcessed) {
        idempotencySkippedTotal.inc({ command_type: command.commandType });
        commandTotal.inc({ command_type: command.commandType, result: 'skipped' });
        log.info({ commandId: command.commandId, commandType: command.commandType }, 'command.skipped');
        return { status: 'skipped', reason: 'idempotency' };
      }

      const result = await withTransaction(async (conn: PoolConnection) => {
        await processedCommandsRepository.recordProcessed({
          commandId: command.commandId,
          commandType: command.commandType,
          subscriberId: command.commandType,
          correlationId: command.correlationId,
          causationId: command.causationId,
          metadata: command.metadata,
        }, conn);

        const data = await handler.execute(command, conn);

        const domainEvents = handler.events ? handler.events(command, data) : [];

        for (const event of domainEvents) {
          await eventBusV2.emit(event.eventName, event.payload, event.context, conn);
        }

        return data;
      });

      const duration = (Date.now() - start) / 1000;
      commandDuration.observe({ command_type: command.commandType, result: 'processed' }, duration);
      commandTotal.inc({ command_type: command.commandType, result: 'processed' });

      log.info({ commandId: command.commandId, commandType: command.commandType, duration },
        'command.completed');

      return { status: 'processed', data: result };

    } catch (err: any) {
      const duration = (Date.now() - start) / 1000;
      commandTotal.inc({ command_type: command.commandType, result: 'error' });

      if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof ConflictError) {
        log.warn({ err, commandId: command.commandId, commandType: command.commandType, duration },
          'command.rejected');
        return {
          status: 'error',
          code: err.errorCode,
          message: err.message,
          details: err.details,
        };
      }

      log.error({ err, commandId: command.commandId, commandType: command.commandType, duration },
        'command.failed');
      throw err;
    }
  }
}

export const commandPipeline = new CommandPipeline();
