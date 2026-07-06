import type { FastifyRequest, FastifyReply } from 'fastify';

export async function getFeatureFlagsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { getAllFeatureFlags, setFeatureFlag } = await import('../application/feature-flags.service.js');
  const flags = await getAllFeatureFlags();
  return reply.send({ data: flags });
}

export async function setFeatureFlagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { setFeatureFlag } = await import('../application/feature-flags.service.js');
  const body = request.body as any;
  await setFeatureFlag(body.flagKey, body.enabled);
  return reply.send({ success: true });
}

export async function getAbTestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const activeOnly = query.active_only === 'true';
  const { getAbTests } = await import('../application/ab-testing.service.js');
  const tests = await getAbTests(activeOnly);
  return reply.send({ data: tests });
}

export async function createAbTestHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { createAbTest } = await import('../application/ab-testing.service.js');
  const body = request.body as any;
  const id = await createAbTest(
    body.testKey,
    body.eventName,
    body.categorySlug,
    body.templateIdA,
    body.templateIdB,
    body.trafficSplit || 50,
    body.startsAt ? new Date(body.startsAt) : undefined,
    body.endsAt ? new Date(body.endsAt) : undefined,
    userId,
  );
  return reply.send({ success: true, id });
}

export async function toggleAbTestHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const { toggleAbTest } = await import('../application/ab-testing.service.js');
  await toggleAbTest(Number(id), body.active);
  return reply.send({ success: true });
}

export async function getAbTestResultsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { getAbTestResults } = await import('../application/ab-testing.service.js');
  const results = await getAbTestResults(Number(id));
  return reply.send({ data: results });
}

export async function getCleanupPoliciesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { getCleanupPolicies, updateCleanupPolicy } = await import('../application/cleanup.service.js');
  const policies = await getCleanupPolicies();
  return reply.send({ data: policies });
}

export async function updateCleanupPolicyHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const { updateCleanupPolicy } = await import('../application/cleanup.service.js');
  await updateCleanupPolicy(body.policyKey, {
    retention_days: body.retentionDays,
    is_enabled: body.isEnabled,
  });
  return reply.send({ success: true });
}

export async function runCleanupHandler(request: FastifyRequest, reply: FastifyReply) {
  const { runCleanupPolicies } = await import('../application/cleanup.service.js');
  const result = await runCleanupPolicies();
  return reply.send(result);
}

export async function getReplayLogsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const { getReplayLogs } = await import('../application/event-replay.service.js');
  const logs = await getReplayLogs(Number(query.limit) || 50, Number(query.offset) || 0);
  return reply.send({ data: logs });
}

export async function replayEventHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as any;
  const { replayEvent } = await import('../application/event-replay.service.js');
  const result = await replayEvent({
    eventName: body.eventName,
    from: new Date(body.from),
    to: new Date(body.to),
    limit: body.limit,
    replayedBy: userId,
    reason: body.reason,
  });
  return reply.send(result);
}

export async function getTemplatesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM notification_templates
     WHERE is_active = TRUE ORDER BY event_name, locale`,
  );
  return reply.send({ data: rows });
}

export async function updateTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  const body = request.body as any;
  const { updateTemplate } = await import('../application/template-versioning.service.js');
  await updateTemplate(Number(id), {
    titleTemplate: body.titleTemplate,
    bodyTemplate: body.bodyTemplate,
    actionKey: body.actionKey,
    routePattern: body.routePattern,
    imageUrl: body.imageUrl,
    actions: body.actions,
  }, userId);
  return reply.send({ success: true });
}

export async function getTemplateVersionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { getTemplateVersions } = await import('../application/template-versioning.service.js');
  const versions = await getTemplateVersions(Number(id));
  return reply.send({ data: versions });
}

export async function rollbackTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  const body = request.body as any;
  const { rollbackTemplate } = await import('../application/template-versioning.service.js');
  await rollbackTemplate(Number(id), body.targetVersion, userId);
  return reply.send({ success: true });
}

export async function getWebhooksHandler(request: FastifyRequest, reply: FastifyReply) {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const query = request.query as any;
  let sql = 'SELECT * FROM notification_webhooks';
  const params: any[] = [];
  if (query.organisation_id) {
    sql += ' WHERE organisation_id = ?';
    params.push(Number(query.organisation_id));
  }
  sql += ' ORDER BY created_at DESC';
  const [rows] = await pool.execute(sql, params);
  return reply.send({ data: rows });
}

export async function createWebhookHandler(request: FastifyRequest, reply: FastifyReply) {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const body = request.body as any;
  const crypto = await import('node:crypto');
  const secret = crypto.randomBytes(32).toString('hex');
  const [result] = await pool.execute(
    `INSERT INTO notification_webhooks
     (organisation_id, url, secret, events, headers, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      body.organisationId,
      body.url,
      secret,
      JSON.stringify({ events: body.events || [] }),
      body.headers ? JSON.stringify(body.headers) : null,
      1,
    ],
  );
  return reply.send({ success: true, id: (result as any).insertId, secret });
}

export async function updateWebhookHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const setParts: string[] = [];
  const params: any[] = [];

  if (body.url !== undefined) { setParts.push('url = ?'); params.push(body.url); }
  if (body.events !== undefined) { setParts.push('events = ?'); params.push(JSON.stringify({ events: body.events })); }
  if (body.isActive !== undefined) { setParts.push('is_active = ?'); params.push(body.isActive ? 1 : 0); }

  if (setParts.length) {
    params.push(Number(id));
    await pool.execute(
      `UPDATE notification_webhooks SET ${setParts.join(', ')} WHERE id = ?`,
      params,
    );
  }

  return reply.send({ success: true });
}

export async function deleteWebhookHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  await pool.execute('DELETE FROM notification_webhooks WHERE id = ?', [Number(id)]);
  return reply.send({ success: true });
}

export async function getChannelPreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM user_channel_preferences WHERE user_id = ? ORDER BY category_slug`,
    [userId],
  );
  return reply.send({ data: rows });
}

export async function updateChannelPreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as any;
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  await pool.execute(
    `INSERT INTO user_channel_preferences (user_id, category_slug, channels, failover_enabled, failover_chain)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE channels = VALUES(channels), failover_enabled = VALUES(failover_enabled), failover_chain = VALUES(failover_chain)`,
    [
      userId,
      body.categorySlug,
      JSON.stringify(body.channels || ['in_app']),
      body.failoverEnabled ? 1 : 0,
      body.failoverChain ? JSON.stringify(body.failoverChain) : null,
    ],
  );
  return reply.send({ success: true });
}

export async function getQuietHoursHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { getQuietHours } = await import('../application/quiet-hours.service.js');
  const quietHours = await getQuietHours(userId);
  return reply.send({ data: quietHours });
}

export async function upsertQuietHoursHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as any;
  const { upsertQuietHours } = await import('../application/quiet-hours.service.js');
  await upsertQuietHours(userId, body.weekday, body.startTime, body.endTime, body.timezone || 'UTC');
  return reply.send({ success: true });
}

export async function deleteQuietHoursHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  const { deleteQuietHours } = await import('../application/quiet-hours.service.js');
  await deleteQuietHours(Number(id), userId);
  return reply.send({ success: true });
}

export async function getDevicesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { getUserDevices } = await import('../application/device.service.js');
  const devices = await getUserDevices(userId);
  return reply.send({ data: devices });
}

export async function registerDeviceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as any;
  const { registerDevice } = await import('../application/device.service.js');
  const id = await registerDevice(userId, body.deviceId, {
    platform: body.platform,
    browser: body.browser,
    os: body.os,
    userAgent: body.userAgent,
    pushToken: body.pushToken,
    pushProvider: body.pushProvider,
    ipAddress: request.ip,
  });
  return reply.send({ success: true, id });
}

export async function getAuditTrailHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const { getUserAuditTrail } = await import('../application/audit.service.js');
  if (query.user_id) {
    const trail = await getUserAuditTrail(Number(query.user_id));
    return reply.send({ data: trail });
  }
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM notification_audit_trail
     ORDER BY created_at DESC LIMIT 100`,
  );
  return reply.send({ data: rows });
}
