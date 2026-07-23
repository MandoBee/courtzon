import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';

const log = createModuleLogger('upload');

export interface ProcessUploadPayload {
  uploadId: number;
  entityType: string;
  entityId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface ProcessUploadResult {
  uploadId: number;
  processed: boolean;
}

export const processUploadHandler: CommandHandler<Command, ProcessUploadResult> = {
  validate: async (command) => {
    const p = command.payload as unknown as ProcessUploadPayload;
    if (!p.uploadId || p.uploadId <= 0) throw new Error('uploadId is required');
  },
  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as ProcessUploadPayload;
    log.info({ uploadId: p.uploadId, fileName: p.fileName }, 'upload.processed');
    return { uploadId: p.uploadId, processed: true };
  },
  events: (command, result) => [{
    eventName: 'upload.processed',
    payload: { uploadId: result.uploadId, processed: result.processed },
    context: {
      aggregateType: 'upload',
      aggregateId: String(result.uploadId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
