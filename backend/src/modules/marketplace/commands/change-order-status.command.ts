import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { assertValidTransition, isTerminal } from '../domain/order-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { OrderStatus, OrderRole } from '../domain/order-aggregate.js';
import type { ResultSetHeader } from 'mysql2';

const log = createModuleLogger('marketplace-order');

export interface ChangeOrderStatusPayload {
  orderId: number;
  toStatus: OrderStatus;
  role: OrderRole;
  actorId?: number;
}

export interface ChangeOrderStatusResult {
  orderId: number;
  status: OrderStatus;
}

export const changeOrderStatusHandler: CommandHandler<Command, ChangeOrderStatusResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as ChangeOrderStatusPayload;
    if (!p.orderId || p.orderId <= 0) throw new Error('orderId is required and must be positive');
    if (!p.toStatus) throw new Error('toStatus is required');
    if (!p.role) throw new Error('role is required');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as ChangeOrderStatusPayload;
    const [rows] = await conn.execute<any[]>(
      'SELECT id, status FROM orders WHERE id = ?',
      [p.orderId],
    );
    if (!rows.length) throw new NotFoundError('Order');

    const currentStatus = rows[0].status as OrderStatus;

    if (isTerminal(currentStatus)) {
      log.warn({ orderId: p.orderId, status: currentStatus }, 'order.already_terminal');
      return { orderId: p.orderId, status: currentStatus };
    }

    if (currentStatus === p.toStatus) {
      log.warn({ orderId: p.orderId, status: p.toStatus }, 'order.already_in_status');
      return { orderId: p.orderId, status: p.toStatus };
    }

    assertValidTransition(currentStatus, p.toStatus, p.role);

    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ? AND status = ?`,
      [p.toStatus, p.orderId, currentStatus],
    );

    if (result.affectedRows === 0) {
      log.warn({ orderId: p.orderId, expectedStatus: currentStatus }, 'order.concurrent_modification');
      throw new Error('Order was modified concurrently');
    }

    log.info({ orderId: p.orderId, status: p.toStatus, role: p.role }, 'order.status_changed');
    return { orderId: p.orderId, status: p.toStatus };
  },

  events: (command, result) => {
    const p = command.payload as unknown as ChangeOrderStatusPayload;
    return [{
      eventName: `order.${p.toStatus}`,
      payload: {
        orderId: result.orderId,
        status: result.status,
        role: p.role,
      },
      context: {
        aggregateType: 'order',
        aggregateId: String(result.orderId),
        aggregateVersion: 1,
        correlationId: command.correlationId,
        causationId: command.commandId,
      },
    }];
  },
};
