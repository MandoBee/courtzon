import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../../database/mysql.js';
import { processPaymentHandler } from './process-payment.command.js';
import { generateUlid } from '../../../shared/event-bus/event-envelope.js';
import type { Command } from '../../../shared/command/command-base.js';

const DDL = `
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  booking_id INT UNSIGNED DEFAULT NULL,
  order_id INT UNSIGNED DEFAULT NULL,
  idempotency_key VARCHAR(64) DEFAULT NULL,
  reference_type VARCHAR(50) DEFAULT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'card',
  gateway_provider VARCHAR(50) DEFAULT NULL,
  gateway_reference VARCHAR(100) DEFAULT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
  payment_status VARCHAR(50) NOT NULL DEFAULT 'created',
  aggregate_version INT UNSIGNED NOT NULL DEFAULT 1,
  paid_at DATETIME DEFAULT NULL,
  cancelled_at DATETIME DEFAULT NULL,
  gateway_response JSON DEFAULT NULL,
  trace_id VARCHAR(36) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

let mysql: StartedTestContainer;

async function createTestPayment(status = 'pending'): Promise<number> {
  const pool = getPool();
  const ver = status === 'paid' ? 2 : 1;
  await pool.execute(
    `INSERT INTO payment_transactions (user_id, payment_method, gateway_provider, gateway_reference, amount, payment_status, aggregate_version)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [1, 'wallet', 'test', `ref_${Date.now()}`, 100.00, status, ver],
  );
  const [rows] = await pool.execute('SELECT LAST_INSERT_ID() as id');
  return (rows as any[])[0].id;
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mysql = await new GenericContainer('mysql:8.0')
    .withEnvironment({ MYSQL_ROOT_PASSWORD: 'test', MYSQL_DATABASE: 'courtzon_test' })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('port: 3306  MySQL Community Server'))
    .start();
  const port = mysql.getMappedPort(3306);
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = String(port);
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'test'; process.env.DB_NAME = 'courtzon_test';
  createPool({ host: '127.0.0.1', port, user: 'root', password: 'test', database: 'courtzon_test' });
  const pool = getPool();
  for (const stmt of DDL.split(';').filter(s => s.trim())) await pool.execute(stmt.trim());
}, 120000);

afterAll(async () => { await closePool(); try { await mysql.stop(); } catch {} }, 30000);

describe('ProcessPayment — Integration', () => {
  beforeEach(async () => { const pool = getPool(); await pool.execute('DELETE FROM payment_transactions'); });

  it('processes a pending payment to paid', async () => {
    const id = await createTestPayment('pending');
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const cmd: Command = { commandId: generateUlid(), commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: String(id), payload: { paymentId: id } };
      const r = await processPaymentHandler.execute(cmd, conn);
      expect(r.paymentId).toBe(id);
      const [rows] = await conn.execute('SELECT payment_status FROM payment_transactions WHERE id = ?', [id]);
      expect((rows as any[])[0].payment_status).toBe('paid');
      await conn.rollback();
    } finally { conn.release(); }
  });

  it('skips if already paid', async () => {
    const id = await createTestPayment('paid');
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      const cmd: Command = { commandId: generateUlid(), commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: String(id), payload: { paymentId: id } };
      const r = await processPaymentHandler.execute(cmd, conn);
      expect(r.paymentId).toBe(id);
    } finally { conn.release(); }
  });

  it('rejects process for non-existent payment', async () => {
    const pool = getPool(); const conn = await pool.getConnection();
    try {
      const cmd: Command = { commandId: generateUlid(), commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '999', payload: { paymentId: 999 } };
      await expect(processPaymentHandler.execute(cmd, conn)).rejects.toThrow('Payment not found');
    } finally { conn.release(); }
  });
});
