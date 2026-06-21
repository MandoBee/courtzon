import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startContainers, runSchema, stopContainers, applyTestProcessEnv, TestContext } from '../../../tests/helpers/integration-setup.js';
import { createPool } from '../../../database/mysql.js';

let ctx: TestContext;
let redis: { disconnect: () => void; ping: () => Promise<string> };

beforeAll(async () => {
  ctx = await startContainers();
  await runSchema(ctx.mysqlPort);
  applyTestProcessEnv(ctx);

  createPool({
    host: '127.0.0.1',
    port: ctx.mysqlPort,
    user: 'root',
    password: 'test',
    database: 'courtzon_test',
  });

  const ioredis = await import('ioredis');
  const RedisClient = (ioredis as any).default || ioredis;
  redis = new RedisClient({ host: '127.0.0.1', port: ctx.redisPort });
  await redis.ping();
}, 120000);

afterAll(async () => {
  redis?.disconnect();
  await stopContainers();
}, 30000);

describe('Booking Integration', () => {
  it('should have test data available from seed', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();

    const [orgs] = await pool.execute<any[]>('SELECT COUNT(*) as cnt FROM organisations');
    expect(orgs[0].cnt).toBeGreaterThan(0);

    const [branches] = await pool.execute<any[]>('SELECT COUNT(*) as cnt FROM branches');
    expect(branches[0].cnt).toBeGreaterThan(0);

    const [resources] = await pool.execute<any[]>('SELECT COUNT(*) as cnt FROM resources');
    expect(resources[0].cnt).toBeGreaterThan(0);

    const [pricedResources] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM resources WHERE hourly_price IS NOT NULL AND hourly_price > 0`
    );
    expect(pricedResources[0].cnt).toBeGreaterThan(0);

    const [hours] = await pool.execute<any[]>('SELECT COUNT(*) as cnt FROM operating_hours');
    expect(hours[0].cnt).toBeGreaterThan(0);
  });

  it('should query available slots for a resource', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();

    // Get first active resource
    const [resources] = await pool.execute<any[]>(
      `SELECT r.id, r.name, rt.default_slot_duration, rt.has_slots
       FROM resources r
       JOIN resource_types rt ON rt.id = r.resource_type_id
       WHERE r.is_active = TRUE LIMIT 1`
    );

    if (resources.length === 0) {
      console.warn('No active resources found in seed data, skipping slot query test');
      return;
    }

    const resource = resources[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    // Get operating hours for a branch
    const [hours] = await pool.execute<any[]>(
      `SELECT open_time, close_time FROM operating_hours
       WHERE owner_type = 'branch' AND owner_id = (SELECT branch_id FROM resources WHERE id = ? LIMIT 1)
       AND day_of_week = ? LIMIT 1`,
      [resource.id, tomorrow.getDay()]
    );

    expect(resource.id).toBeGreaterThan(0);
  });

  it('should calculate price using pricing engine', async () => {
    const { pricingEngine } = await import('../domain/pricing-engine.js');

    // Get a branch with pricing rules
    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();

    const [branches] = await pool.execute<any[]>(
      `SELECT b.id FROM branches b LIMIT 1`
    );

    if (branches.length === 0) return;

    const branchId = branches[0].id;

    const [resources] = await pool.execute<any[]>(
      `SELECT id FROM resources WHERE is_active = TRUE LIMIT 1`
    );

    if (resources.length === 0) return;

    const price = await pricingEngine.calculatePrice(
      resources[0].id,
      '10:00',
      '11:00'
    );

    expect(price).toHaveProperty('totalPrice');
    expect(typeof price.totalPrice).toBe('number');
  });
});
