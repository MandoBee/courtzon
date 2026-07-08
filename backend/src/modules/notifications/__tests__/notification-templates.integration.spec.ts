import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { applyTestProcessEnv, runSchema, startContainers, stopContainers } from '../../../tests/helpers/integration-setup.js';

describe('Notification Template Integration', () => {
  beforeAll(async () => {
    const ctx = await startContainers();
    applyTestProcessEnv(ctx);
    await runSchema(ctx.mysqlPort);
  }, 180000);

  afterAll(async () => {
    await stopContainers();
  });

  it('should have all required notification templates seeded', async () => {
    const { getPool } = await import('../../database/mysql.js');
    const pool = getPool();

    const requiredTemplates = [
      'booking:created', 'booking:confirmed', 'booking:cancelled',
      'payment:completed', 'payment:failed', 'payment:refunded',
      'match:invitation',
      'system:announcement', 'system:digest', 'system:birthday',
      'marketplace:order-placed', 'marketplace:order-shipped',
      'security:suspicious-login', 'security:account-locked',
    ];

    for (const eventName of requiredTemplates) {
      const [rows] = await pool.execute(
        'SELECT COUNT(*) as cnt FROM notification_templates WHERE event_name = ? AND is_active = TRUE',
        [eventName],
      );
      const rowData = rows as any[];
      expect(rowData[0].cnt, `Template ${eventName} should exist`).toBeGreaterThan(0);
    }
  });

  it('should have templates in both English and Arabic for core events', async () => {
    const { getPool } = await import('../../database/mysql.js');
    const pool = getPool();

    const bilingualEvents = [
      'booking:created', 'booking:confirmed', 'payment:completed',
      'match:invitation', 'system:announcement', 'system:digest',
      'security:suspicious-login',
    ];

    for (const eventName of bilingualEvents) {
      const [enRows] = await pool.execute(
        'SELECT COUNT(*) as cnt FROM notification_templates WHERE event_name = ? AND locale = ? AND is_active = TRUE',
        [eventName, 'en'],
      );
      const [arRows] = await pool.execute(
        'SELECT COUNT(*) as cnt FROM notification_templates WHERE event_name = ? AND locale = ? AND is_active = TRUE',
        [eventName, 'ar'],
      );
      expect((enRows as any[])[0].cnt, `${eventName} EN template`).toBeGreaterThan(0);
      expect((arRows as any[])[0].cnt, `${eventName} AR template`).toBeGreaterThan(0);
    }
  });

  it('should have notification_providers registered', async () => {
    const { getPool } = await import('../../database/mysql.js');
    const pool = getPool();

    const [rows] = await pool.execute(
      'SELECT slug FROM notification_providers WHERE is_enabled = TRUE',
    );
    const slugs = (rows as any[]).map((r: any) => r.slug);
    expect(slugs).toContain('in_app');
    expect(slugs).toContain('email');
  });

  it('should have feature flags initialized', async () => {
    const { getPool } = await import('../../database/mysql.js');
    const pool = getPool();

    const requiredFlags = [
      'player_matching', 'broadcasts', 'digest', 'rate_limiting',
    ];

    for (const flag of requiredFlags) {
      const [rows] = await pool.execute(
        'SELECT is_enabled FROM notification_feature_flags WHERE flag_key = ?',
        [flag],
      );
      expect((rows as any[]).length, `Flag ${flag} should exist`).toBeGreaterThan(0);
    }
  });

  it('should have cleanup policies configured', async () => {
    const { getPool } = await import('../../database/mysql.js');
    const pool = getPool();

    const [rows] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM notification_cleanup_policies',
    );
    expect((rows as any[])[0].cnt).toBeGreaterThanOrEqual(5);
  });

  it('should create notification and queue rows immediately for a normal event', async () => {
    const { getPool } = await import('../../database/mysql.js');
    const { dispatchToUser } = await import('../application/dispatcher.service.js');
    const pool = getPool();
    const bookingId = Date.now();

    await dispatchToUser({
      userId: 1,
      eventName: 'booking:confirmed',
      categorySlug: 'bookings',
      data: { bookingId, userId: 1 },
      relatedEntityType: 'booking',
      relatedEntityId: String(bookingId),
      actionPayload: { bookingId },
    });

    const [notificationRows] = await pool.execute(
      `SELECT id, event_name, user_id, action_payload
       FROM notifications
       WHERE event_name = ? AND related_entity_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      ['booking:confirmed', String(bookingId)],
    );
    const notification = (notificationRows as any[])[0];

    expect(notification).toBeTruthy();
    expect(notification.user_id).toBe(1);
    expect(JSON.parse(notification.action_payload).bookingId).toBe(bookingId);

    const [queueRows] = await pool.execute(
      `SELECT id, user_id, notification_id, channel, status
       FROM notification_queue
       WHERE notification_id = ?`,
      [notification.id],
    );
    const queueRow = (queueRows as any[])[0];

    expect(queueRow).toBeTruthy();
    expect(queueRow.user_id).toBe(1);
    expect(queueRow.channel).toBe('in_app');

    await pool.execute('DELETE FROM notification_queue WHERE notification_id = ?', [notification.id]);
    await pool.execute('DELETE FROM notification_delivery WHERE notification_id = ?', [notification.id]);
    await pool.execute('DELETE FROM notifications WHERE id = ?', [notification.id]);
  });

  it('should allow creating a delivery record', async () => {
    const { createDelivery, updateDeliveryStatus, getDelivery } = await import('../infrastructure/repositories/delivery.repository.js');

    const deliveryId = await createDelivery(1, 1, 'in_app');
    expect(deliveryId).toBeGreaterThan(0);

    await updateDeliveryStatus(deliveryId, 'sent');

    const delivery = await getDelivery(deliveryId);
    expect(delivery).not.toBeNull();
    expect(delivery!.status).toBe('sent');
    expect(delivery!.channel).toBe('in_app');
  });

  it('should handle rate limiting', async () => {
    const { checkRateLimit, incrementRateLimit } = await import('../application/rate-limiter.service.js');

    const result = await checkRateLimit(999999, 'system');
    expect(result.allowed).toBe(true);

    await incrementRateLimit(999999, 'system', 'test');
  });

  it('should check user presence', async () => {
    const { isOnline, setOnline, setOffline } = await import('../application/presence.service.js');

    await setOnline(999999);
    const online = await isOnline(999999);
    expect(online).toBe(true);

    await setOffline(999999);
    const offline = await isOnline(999999);
    expect(offline).toBe(false);
  });
});
