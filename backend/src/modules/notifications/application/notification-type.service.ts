import { notificationTypeRepository } from '../infrastructure/repositories/notification-type.repository.js';
import { AppError, NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes, SuccessCodes } from '../../../shared/errors/error-codes.js';
import type { NotificationType, NotificationTypeFilters } from '../domain/notification-type.entity.js';

export const notificationTypeService = {
  async list(
    filters: NotificationTypeFilters,
  ): Promise<{ data: NotificationType[]; total: number; page: number; limit: number }> {
    const result = await notificationTypeRepository.findAll(filters);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    return { ...result, page, limit };
  },

  async getById(id: number): Promise<NotificationType> {
    const entity = await notificationTypeRepository.findById(id);
    if (!entity) {
      throw new NotFoundError('NotificationType', ErrorCodes.NOTIFICATION_NOT_FOUND);
    }
    return entity;
  },

  async getByCode(code: string): Promise<NotificationType | null> {
    return notificationTypeRepository.findByCode(code);
  },

  async create(
    data: {
      code: string;
      event_key: string;
      name: string;
      description?: string | null;
      category?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      default_channels?: string[];
      icon?: string | null;
      enabled?: boolean;
      requires_action?: boolean;
      system_managed?: boolean;
      sort_order?: number;
    },
    userId: number | null,
  ): Promise<NotificationType> {
    const existingCode = await notificationTypeRepository.findByCode(data.code);
    if (existingCode) {
      throw new ConflictError('A notification type with this code already exists', ErrorCodes.NOTIFICATION_FAILED, { code: data.code });
    }

    const existingEventKey = await notificationTypeRepository.findByEventKey(data.event_key);
    if (existingEventKey) {
      throw new ConflictError('A notification type with this event key already exists', ErrorCodes.NOTIFICATION_FAILED, { event_key: data.event_key });
    }

    const id = await notificationTypeRepository.create({
      ...data,
      created_by: userId,
    });

    const entity = await notificationTypeRepository.findById(id);
    if (!entity) {
      throw new AppError('Failed to create notification type', 500, 'CREATE_FAILED', { code: ErrorCodes.SYSTEM_INTERNAL_ERROR });
    }
    return entity;
  },

  async update(
    id: number,
    data: {
      code?: string;
      event_key?: string;
      name?: string;
      description?: string | null;
      category?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      default_channels?: string[];
      icon?: string | null;
      enabled?: boolean;
      requires_action?: boolean;
      sort_order?: number;
    },
    userId: number | null,
  ): Promise<NotificationType> {
    const existing = await this.getById(id);

    if (existing.system_managed) {
      if (data.code !== undefined && data.code !== existing.code) {
        throw new AppError('Cannot change code of a system-managed notification type', 400, 'VALIDATION_ERROR', { code: ErrorCodes.VALIDATION_INVALID_VALUE });
      }
      if (data.event_key !== undefined && data.event_key !== existing.event_key) {
        throw new AppError('Cannot change event key of a system-managed notification type', 400, 'VALIDATION_ERROR', { code: ErrorCodes.VALIDATION_INVALID_VALUE });
      }
    }

    if (data.code !== undefined && data.code !== existing.code) {
      const duplicateCode = await notificationTypeRepository.findByCode(data.code);
      if (duplicateCode) {
        throw new ConflictError('A notification type with this code already exists', ErrorCodes.NOTIFICATION_FAILED, { code: data.code });
      }
    }

    if (data.event_key !== undefined && data.event_key !== existing.event_key) {
      const duplicateEventKey = await notificationTypeRepository.findByEventKey(data.event_key);
      if (duplicateEventKey) {
        throw new ConflictError('A notification type with this event key already exists', ErrorCodes.NOTIFICATION_FAILED, { event_key: data.event_key });
      }
    }

    await notificationTypeRepository.update(id, {
      ...data,
      updated_by: userId,
    });

    const entity = await notificationTypeRepository.findById(id);
    if (!entity) {
      throw new NotFoundError('NotificationType', ErrorCodes.NOTIFICATION_NOT_FOUND);
    }
    return entity;
  },

  async delete(id: number, userId: number | null): Promise<void> {
    const existing = await this.getById(id);

    if (existing.system_managed) {
      throw new AppError('Cannot delete a system-managed notification type', 400, 'VALIDATION_ERROR', { code: ErrorCodes.VALIDATION_INVALID_VALUE });
    }

    const deleted = await notificationTypeRepository.softDelete(id);
    if (!deleted) {
      throw new NotFoundError('NotificationType', ErrorCodes.NOTIFICATION_NOT_FOUND);
    }
  },

  async getOptions(): Promise<{
    categories: string[];
    priorities: ('low' | 'normal' | 'high' | 'critical')[];
    channels: string[];
  }> {
    return notificationTypeRepository.getOptions();
  },

  SuccessCodes: {
    CREATED: 'NOTIFICATION_TYPE_CREATED' as const,
    UPDATED: 'NOTIFICATION_TYPE_UPDATED' as const,
    DELETED: 'NOTIFICATION_TYPE_DELETED' as const,
  },
};
