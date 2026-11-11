/**
 * D3 — unified settlements, finance role (local, integration, NO mocks).
 *
 * DESIGN NOTES (read before editing):
 *  - Targets the LOCAL development database ONLY: courtzon_v3 @ 127.0.0.1:3307
 *    (backend :3000, frontend :5173). Live/Hostinger is never contacted.
 *  - `describe.serial` is intentional: the suite shares state and exercises a
 *    state machine (requested -> completed / cancelled), so tests run in order.
 *  - T5 DEPENDS ON T4's result. T4 freezes the GL line count observed after the
 *    first real payment; T5 re-pays and proves no extra lines/transactions are
 *    created. If T4 fails, T5 is skipped (never silently "passes").
 *  - NO AUTOMATIC CLEANUP ON FAILURE. `beforeAll` creates real settlements; a
 *    failure after that point leaves `requested` settlements holding ON_HOLD
 *    entitlements behind. That is accepted (no destructive cleanup in tests) —
 *    cancel them through the official endpoint if a cleanup is ever approved.
 *  - Every write in this file is scoped to rows the test itself creates.
 *  - Fixtures are explicitly link-clean (see keepLinkClean): a pre-existing
 *    defect leaves `settlement_entitlements` rows behind after cancellation, so
 *    re-used entitlements would silently create a settlement with zero links.
 *  - TEST_DB_PASSWORD is mandatory. No fallback credential is embedded here.
 */
import { test, expect, request, type APIRequestContext, type BrowserContext } from '@playwright/test';

import { createRequire } from 'node:module';

// Local mysql2 is available through the backend workspace (root has no mysql2).
const nodeRequire = createRequire(import.meta.url);
const mysql = nodeRequire('../../../backend/node_modules/mysql2/promise');

const API = 'http://localhost:3000';
const FRONT = 'http://localhost:5173';
const ORG_A = 276002726; // SIM Padel Club A
const ORG_B = 276002727; // SIM Sports Club B
const PASSWORD = 'Test123456!';
const ACCOUNTS = {
  finance: '01099991001',
  auditor: '01099991002',
  other: '01099991003',
};

type Ctx = APIRequestContext;

interface Ent {
  id: number;
  entitlement_type: 'ORGANIZATION_EARNING' | 'COURTZON_COMMISSION' | 'ORGANIZATION_ADJUSTMENT' | 'COURTZON_ADJUSTMENT';
  collector: 'courtzon' | 'org' | null;
  amount: string | number;
  status?: string;
}

interface GlRow {
  transaction_id: string;
  event_type: string;
  side: 'debit' | 'credit';
  amount: string | number;
  chart_account_id: number;
}

interface GlShape {
  events: string[];
  linesPerEvent: Record<string, number>;
  totalLines: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The local test database password is NEVER embedded in this file. Without the
 * environment variable the suite stops immediately with an actionable message
 * and without echoing any credential material.
 */
function requireTestDbPassword(): string {
  const password = process.env.TEST_DB_PASSWORD;
  if (!password) {
    throw new Error(
      'TEST_DB_PASSWORD is not set. D3 runs against the LOCAL database only ' +
        '(courtzon_v3 @ 127.0.0.1:3307). Export TEST_DB_PASSWORD for the local MySQL ' +
        'root account before running this spec. No credential is printed here.',
    );
  }
  return password;
}

function computeExpected(ents: Ent[]) {
  let courtzonOwedToOrg = 0;
  let orgOwedToCourtZon = 0;
  for (const e of ents) {
    const amount = Number(e.amount);
    if (e.entitlement_type === 'ORGANIZATION_EARNING') {
      if (e.collector === 'courtzon') courtzonOwedToOrg += amount;
    } else if (e.entitlement_type === 'COURTZON_COMMISSION') {
      if (e.collector === 'org') orgOwedToCourtZon += amount;
    } else if (e.entitlement_type === 'ORGANIZATION_ADJUSTMENT') {
      if (e.collector === 'courtzon') courtzonOwedToOrg += amount;
    } else if (e.entitlement_type === 'COURTZON_ADJUSTMENT') {
      if (e.collector === 'org') orgOwedToCourtZon += amount;
    }
  }
  const net = Math.round((courtzonOwedToOrg - orgOwedToCourtZon) * 100) / 100;
  return {
    courtzonOwedToOrg,
    orgOwedToCourtZon,
    net,
    finalAmount: Math.abs(net),
    direction: net > 0 ? 'COURTZON_TO_ORGANIZATION' : net < 0 ? 'ORGANIZATION_TO_COURTZON' : 'ZERO_BALANCE',
  };
}

/**
 * Expected GL shape for a CourtZon -> organisation payout. Both settlement
 * components are present for our fixtures (courtzon-collected earning + a
 * COD/org-collected commission), so the paid handler posts the explicit offset
 * entry (3 lines) plus the organisation receipt (2 lines) = 5 balanced lines.
 */
function expectedGlShape(exp: ReturnType<typeof computeExpected>): GlShape {
  const hasOffset = exp.courtzonOwedToOrg > 0 && exp.orgOwedToCourtZon > 0;
  if (hasOffset) {
    return {
      events: ['settlement_paid_offset', 'settlement_org_receipt'],
      linesPerEvent: { settlement_paid_offset: 3, settlement_org_receipt: 2 },
      totalLines: 5,
    };
  }
  return {
    events: ['settlement_paid', 'settlement_org_receipt'],
    linesPerEvent: { settlement_paid: 2, settlement_org_receipt: 2 },
    totalLines: 4,
  };
}

async function login(phone: string): Promise<Ctx> {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.post('/auth/login', {
    data: { phoneNumber: phone, password: PASSWORD, countryCode: '+20' },
  });
  expect(res.status(), `login ${phone}`).toBe(200);
  return ctx;
}

async function currentUserId(ctx: Ctx): Promise<number> {
  const res = await ctx.get('/auth/me');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.user?.id, 'authenticated actor id').toBeTruthy();
  return Number(body.user.id);
}

async function browserContextWith(
  browser: import('@playwright/test').Browser,
  ctx: Ctx,
): Promise<BrowserContext> {
  const state = await ctx.storageState();
  const bctx = await browser.newContext({ baseURL: FRONT });
  await bctx.addCookies(state.cookies);
  return bctx;
}

/**
 * Fixture hygiene: an entitlement that was ever linked to a settlement keeps a
 * row in `settlement_entitlements` even after the settlement is cancelled (the
 * cancel path clears `financial_entitlements.settlement_id` but not the link
 * table). Because the create path uses `INSERT IGNORE` against the unique
 * `uk_se_entitlement` key, re-using such an entitlement silently produces a
 * settlement with ZERO links (detail shows no entitlements, and pay/cancel would
 * act on an empty set).
 *
 * This suite therefore only picks link-clean entitlements so it exercises the
 * intended workflow. The underlying link-cleanup defect is a product issue and
 * is reported separately — it is deliberately NOT worked around in the backend.
 */
async function keepLinkClean(pool: any, candidates: Ent[]): Promise<Ent[]> {
  if (!candidates.length) return [];
  const ids = candidates.map((c) => c.id);
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT entitlement_id FROM settlement_entitlements WHERE entitlement_id IN (${placeholders})`,
    ids,
  );
  const alreadyLinked = new Set((rows as any[]).map((r) => Number(r.entitlement_id)));
  return candidates.filter((c) => !alreadyLinked.has(c.id));
}

async function fetchGl(pool: any, settlementId: number): Promise<GlRow[]> {
  const [rows] = await pool.query(
    'SELECT transaction_id, event_type, side, amount, chart_account_id FROM ledger_entries WHERE source_type = ? AND source_id = ?',
    ['settlement', settlementId],
  );
  return rows as GlRow[];
}

/**
 * Polls the database until the settlement's GL postings match the expected
 * event set and per-event line counts. No fixed "sleep then assert" here: the
 * `settlement:paid` handler posts asynchronously through the event bus.
 */
async function waitForExpectedGl(pool: any, settlementId: number, shape: GlShape): Promise<GlRow[]> {
  let rows: GlRow[] = [];
  const expectedEvents = [...shape.events].sort();
  await expect
    .poll(
      async () => {
        rows = await fetchGl(pool, settlementId);
        const actualEvents = [...new Set(rows.map((r) => r.event_type))].sort();
        if (actualEvents.join(',') !== expectedEvents.join(',')) {
          return `events=${actualEvents.join(',') || 'none'}`;
        }
        for (const event of shape.events) {
          const count = rows.filter((r) => r.event_type === event).length;
          if (count !== shape.linesPerEvent[event]) return `${event}:lines=${count}`;
        }
        const total = rows.length;
        if (total !== shape.totalLines) return `totalLines=${total}`;
        return 'expected-shape';
      },
      { timeout: 20_000, intervals: [250, 500, 1000, 2000] },
    )
    .toBe('expected-shape');
  return rows;
}

/**
 * Each accounting event posts exactly one balanced transaction: at least one
 * debit and one credit line per transaction_id, with Dr == Cr.
 */
function assertBalancedPerTransaction(rows: GlRow[]): void {
  const byTransaction = new Map<string, GlRow[]>();
  for (const row of rows) {
    const lines = byTransaction.get(row.transaction_id) ?? [];
    lines.push(row);
    byTransaction.set(row.transaction_id, lines);
  }

  // One transaction per accounting event, and no transaction mixes events.
  expect(byTransaction.size).toBe(new Set(rows.map((r) => r.event_type)).size);

  for (const [transactionId, lines] of byTransaction) {
    expect(new Set(lines.map((l) => l.event_type)).size, `transaction ${transactionId} mixes event types`).toBe(1);
    const debit = lines.filter((l) => l.side === 'debit');
    const credit = lines.filter((l) => l.side === 'credit');
    expect(debit.length, `transaction ${transactionId} has no debit line`).toBeGreaterThan(0);
    expect(credit.length, `transaction ${transactionId} has no credit line`).toBeGreaterThan(0);

    const debitTotal = debit.reduce((sum, l) => sum + Number(l.amount), 0);
    const creditTotal = credit.reduce((sum, l) => sum + Number(l.amount), 0);
    expect(Math.abs(debitTotal - creditTotal), `transaction ${transactionId} is not balanced`).toBeLessThan(0.01);
  }
}

/**
 * Bounded absence check: proves a repeated payment adds neither GL lines nor
 * GL transactions during an observation window. (Absence cannot be polled for,
 * so this deliberately re-reads the same rows for a short bounded window.)
 */
async function expectNoAdditionalGl(pool: any, settlementId: number, expectedLines: number, windowMs = 1_500): Promise<void> {
  const deadline = Date.now() + windowMs;
  do {
    const rows = await fetchGl(pool, settlementId);
    expect(rows.length, 'duplicate payment must not add GL lines').toBe(expectedLines);
    expect(new Set(rows.map((r) => r.transaction_id)).size, 'duplicate payment must not add GL transactions').toBe(2);
    await sleep(250);
  } while (Date.now() < deadline);
}

async function fetchAudit(pool: any, settlementId: number): Promise<Array<{ action: string; actor_id: number | null }>> {
  const [rows] = await pool.query(
    'SELECT action, actor_id FROM audit_logs WHERE entity_type = ? AND entity_id = ?',
    ['settlement', settlementId],
  );
  return rows as Array<{ action: string; actor_id: number | null }>;
}

async function waitForAuditAction(pool: any, settlementId: number, action: string, min: number): Promise<void> {
  await expect
    .poll(
      async () => (await fetchAudit(pool, settlementId)).filter((r) => r.action === action).length,
      { timeout: 10_000, intervals: [250, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(min);
}

test.describe.serial('D3 - unified settlements (finance role)', () => {
  test.setTimeout(120_000);

  let pool: any;
  let finance: Ctx;
  let auditor: Ctx;
  let other: Ctx;
  let financeUserId: number;
  let otherUserId: number;

  let settlementForPay: number;
  let settlementForCancel: number;
  let controlSettlement: number;
  let expectedPay: ReturnType<typeof computeExpected>;
  let expectedCancel: ReturnType<typeof computeExpected>;
  let payEntitlementIds: number[];
  let cancelEntitlementIds: number[];
  let controlEntitlementIds: number[];

  let glLinesAfterPay = 0;
  let payAuditAfterFirstPay = 0;
  let payAuditAfterDuplicate = 0;

  test.beforeAll(async () => {
    const password = requireTestDbPassword();
    pool = mysql.createPool({
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password,
      database: 'courtzon_v3',
      timezone: '+00:00',
    });

    finance = await login(ACCOUNTS.finance);
    auditor = await login(ACCOUNTS.auditor);
    other = await login(ACCOUNTS.other);
    financeUserId = await currentUserId(finance);
    otherUserId = await currentUserId(other);

    // Choose deterministic pairs from currently AVAILABLE entitlements.
    const pv = await finance.get(`/unified-settlements/preview?orgId=${ORG_A}`);
    expect(pv.status()).toBe(200);
    const preview = await pv.json();
    const all: Ent[] = preview.entitlements || [];
    const earning = await keepLinkClean(
      pool,
      all.filter((e) => e.entitlement_type === 'ORGANIZATION_EARNING' && e.collector === 'courtzon'),
    );
    const commission = await keepLinkClean(
      pool,
      all.filter((e) => e.entitlement_type === 'COURTZON_COMMISSION' && e.collector === 'org'),
    );
    expect(earning.length, 'need at least two link-clean AVAILABLE courtzon-collected earnings').toBeGreaterThanOrEqual(2);
    expect(commission.length, 'need at least two link-clean AVAILABLE org-collected commissions').toBeGreaterThanOrEqual(2);

    const pair1: Ent[] = [earning[0], commission[0]];
    const pair2: Ent[] = [earning[1], commission[1]];
    payEntitlementIds = pair1.map((e) => e.id);
    cancelEntitlementIds = pair2.map((e) => e.id);
    expectedPay = computeExpected(pair1);
    expectedCancel = computeExpected(pair2);
    // The paid path must produce the offset shape asserted in T4.
    expect(expectedPay.direction, 'payment fixture must be CourtZon -> organisation').toBe('COURTZON_TO_ORGANIZATION');

    const create = async (ids: number[]) => {
      const r = await finance.post('/unified-settlements', {
        data: { orgId: ORG_A, selectedEntitlementIds: ids, notes: 'D3 automated acceptance test' },
      });
      expect(r.status(), 'create settlement').toBe(201);
      return (await r.json()).settlement.id as number;
    };

    settlementForPay = await create(payEntitlementIds);
    settlementForCancel = await create(cancelEntitlementIds);

    // ORG B positive-control pair (used by T7 to prove authorised access works
    // before any denial is claimed as isolation evidence).
    const pvB = await other.get(`/unified-settlements/preview?orgId=${ORG_B}`);
    expect(pvB.status()).toBe(200);
    const previewB = await pvB.json();
    const allB: Ent[] = previewB.entitlements || [];
    const earningB = await keepLinkClean(
      pool,
      allB.filter((e) => e.entitlement_type === 'ORGANIZATION_EARNING' && e.collector === 'courtzon'),
    );
    const commissionB = await keepLinkClean(
      pool,
      allB.filter((e) => e.entitlement_type === 'COURTZON_COMMISSION' && e.collector === 'org'),
    );
    expect(earningB.length, 'ORG B needs a link-clean AVAILABLE courtzon-collected earning').toBeGreaterThanOrEqual(1);
    expect(commissionB.length, 'ORG B needs a link-clean AVAILABLE org-collected commission').toBeGreaterThanOrEqual(1);
    controlEntitlementIds = [earningB[0].id, commissionB[0].id];
  });

  test.afterAll(async () => {
    await finance?.dispose();
    await auditor?.dispose();
    await other?.dispose();
    await pool?.end();
  });

  test('T1 - finance manager lists settlements for the scoped organisation', async () => {
    const res = await finance.get('/unified-settlements?limit=100');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids = (body.data || []).map((s: any) => Number(s.id));
    expect(ids).toContain(settlementForPay);
    expect(ids).toContain(settlementForCancel);

    const otherRes = await other.get('/unified-settlements?limit=100');
    expect(otherRes.status()).toBe(200);
    const otherIds = ((await otherRes.json()).data || []).map((s: any) => Number(s.id));
    expect(otherIds).not.toContain(settlementForPay);
  });

  test('T2 - detail figures and entitlement count match the canonical calculation', async () => {
    const res = await finance.get(`/unified-settlements/${settlementForPay}`);
    expect(res.status()).toBe(200);
    const detail = await res.json();
    const f = detail.financials;
    expect(detail.settlement.id).toBe(settlementForPay);
    expect(detail.settlement.settlement_status).toBe('requested');
    expect(detail.entitlements).toHaveLength(2);
    expect(detail.entitlements.map((e: any) => Number(e.id)).sort()).toEqual([...payEntitlementIds].sort());
    expect(Number(f.courtzonOwedToOrg)).toBeCloseTo(expectedPay.courtzonOwedToOrg, 2);
    expect(Number(f.orgOwedToCourtZon)).toBeCloseTo(expectedPay.orgOwedToCourtZon, 2);
    expect(Number(f.finalAmount)).toBeCloseTo(expectedPay.finalAmount, 2);
    expect(f.direction).toBe(expectedPay.direction);
  });

  test('T3 - view-only auditor cannot pay or cancel (UI hidden + API 403)', async ({ browser }) => {
    // Use two independent auditor sessions: one for the browser (the SPA
    // refreshes/rotates its session on load) and one strictly for API calls.
    const uiApi = await login(ACCOUNTS.auditor);
    const bctx = await browserContextWith(browser, uiApi);
    const audApi = await login(ACCOUNTS.auditor);
    const page = await bctx.newPage();
    await page.goto(`/admin/unified-settlements/${settlementForPay}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toContainText(String(settlementForPay));
    await expect(page.getByText('Record Payment & Finalize', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Cancel Settlement', { exact: false })).toHaveCount(0);

    const pay = await audApi.post(`/unified-settlements/${settlementForPay}/pay`, { data: { paymentMethod: 'bank_transfer' } });
    const cancel = await audApi.post(`/unified-settlements/${settlementForCancel}/cancel`, { data: { reason: 'should be denied' } });
    expect(pay.status()).toBe(403);
    expect(cancel.status()).toBe(403);
    await bctx.close();
    await audApi.dispose();
  });

  test('T4 - finance manager pays, entitlements settle and balanced GL entries exist', async () => {
    const res = await finance.post(`/unified-settlements/${settlementForPay}/pay`, {
      data: { paymentMethod: 'bank_transfer', paymentReference: 'D3-QA' },
    });
    expect(res.status()).toBe(200);
    const detail = await res.json();
    expect(detail.settlement.settlement_status).toBe('completed');
    expect(Number(detail.settlement.paid_amount)).toBeCloseTo(expectedPay.finalAmount, 2);
    expect(detail.settlement.settlement_direction).toBe('courtzon_to_org');
    for (const e of detail.entitlements) {
      expect(e.status).toBe('SETTLED');
      expect(Number(e.settlement_id)).toBe(settlementForPay);
    }

    // GL posting is emitted asynchronously via the event bus: poll for the
    // exact expected composition (5 lines across the two expected event types)
    // instead of waiting a fixed amount of time.
    const shape = expectedGlShape(expectedPay);
    const glRows = await waitForExpectedGl(pool, settlementForPay, shape);
    assertBalancedPerTransaction(glRows);
    glLinesAfterPay = glRows.length;
    expect(glLinesAfterPay).toBe(shape.totalLines);

    // Exactly one state-changing payment was recorded above.
    await waitForAuditAction(pool, settlementForPay, 'SETTLEMENT.PAY', 1);
    payAuditAfterFirstPay = (await fetchAudit(pool, settlementForPay)).filter((r) => r.action === 'SETTLEMENT.PAY').length;
    expect(payAuditAfterFirstPay, 'one audit record for the state-changing payment').toBe(1);
  });

  test('T5 - repeated payment is idempotent and does not duplicate GL entries', async () => {
    const res = await finance.post(`/unified-settlements/${settlementForPay}/pay`, {
      data: { paymentMethod: 'bank_transfer' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).settlement.settlement_status).toBe('completed');

    // No new GL lines or transactions, observed over a bounded window.
    await expectNoAdditionalGl(pool, settlementForPay, glLinesAfterPay);

    // DOCUMENTED CURRENT BEHAVIOUR (not changed by this test): the service is
    // idempotent (returns early, emits nothing), but the controller records
    // SETTLEMENT.PAY unconditionally, so a no-op repeat MAY add one audit row.
    // We assert the limits (0 or 1 extra) instead of hiding the observation.
    let observed = payAuditAfterFirstPay;
    const deadline = Date.now() + 2_000;
    do {
      observed = (await fetchAudit(pool, settlementForPay)).filter((r) => r.action === 'SETTLEMENT.PAY').length;
      if (observed > payAuditAfterFirstPay) break;
      await sleep(250);
    } while (Date.now() < deadline);
    expect(observed).toBeGreaterThanOrEqual(payAuditAfterFirstPay);
    expect(observed, 'a no-op repeat must add at most one PAY audit row').toBeLessThanOrEqual(payAuditAfterFirstPay + 1);
    payAuditAfterDuplicate = observed;
  });

  test('T6 - cancelled settlement releases entitlements and posts no GL', async () => {
    const res = await finance.post(`/unified-settlements/${settlementForCancel}/cancel`, {
      data: { reason: 'D3 automated cancel' },
    });
    expect(res.status()).toBe(200);
    const detail = await res.json();
    expect(detail.settlement.settlement_status).toBe('cancelled');
    expect(Number(detail.financials.finalAmount)).toBeCloseTo(expectedCancel.finalAmount, 2);
    // Under option B the cancelled settlement KEEPS its composition history, so
    // the release assertions below must never run against an empty list.
    expect(detail.entitlements).toHaveLength(2);
    for (const e of detail.entitlements) {
      expect(e.status).toBe('AVAILABLE');
      expect(e.settlement_id).toBeNull();
    }
    const [glRows] = await pool.query(
      'SELECT id FROM ledger_entries WHERE source_type = ? AND source_id = ?',
      ['settlement', settlementForCancel],
    );
    expect(glRows.length).toBe(0);
  });

  test('T7 - ORG B positive control, then cross-organisation denial', async () => {
    // --- POSITIVE CONTROL: ORG B's finance manager manages ORG B's own
    // settlement first. Without this, a 403 on ORG A could be caused by
    // anything (missing permission, broken route) and would not prove isolation.
    const created = await other.post('/unified-settlements', {
      data: { orgId: ORG_B, selectedEntitlementIds: controlEntitlementIds, notes: 'D3 isolation positive control' },
    });
    expect(created.status(), 'ORG B creates its own settlement').toBe(201);
    controlSettlement = (await created.json()).settlement.id as number;

    const listOwn = await other.get('/unified-settlements?limit=100');
    expect(listOwn.status()).toBe(200);
    const ownIds = ((await listOwn.json()).data || []).map((s: any) => Number(s.id));
    expect(ownIds, "ORG B sees its own settlement in the list").toContain(controlSettlement);

    const detailOwn = await other.get(`/unified-settlements/${controlSettlement}`);
    expect(detailOwn.status(), 'ORG B reads its own settlement detail').toBe(200);
    expect(Number((await detailOwn.json()).settlement.organisation_id)).toBe(ORG_B);

    const cancelOwn = await other.post(`/unified-settlements/${controlSettlement}/cancel`, {
      data: { reason: 'D3 isolation positive control' },
    });
    expect(cancelOwn.status(), 'ORG B cancels its own settlement (has settlements.cancel)').toBe(200);
    expect((await cancelOwn.json()).settlement.settlement_status).toBe('cancelled');

    // Authorised-but-invalid-state must be 409 (NOT 403): proof that ORG B does
    // hold settlements.pay and only the state machine blocks the call.
    const payOwn = await other.post(`/unified-settlements/${controlSettlement}/pay`, {
      data: { paymentMethod: 'bank_transfer' },
    });
    expect(payOwn.status(), 'pay on a cancelled settlement is a state conflict, not a permission denial').toBe(409);

    // --- NEGATIVE: ORG A rows stay invisible and untouchable for ORG B.
    const getA = await other.get(`/unified-settlements/${settlementForPay}`);
    const payA = await other.post(`/unified-settlements/${settlementForPay}/pay`, { data: {} });
    const cancelA = await other.post(`/unified-settlements/${settlementForCancel}/cancel`, { data: {} });
    expect(getA.status()).toBe(403);
    expect(payA.status()).toBe(403);
    expect(cancelA.status()).toBe(403);

    const listA = await other.get('/unified-settlements?limit=100');
    expect(listA.status()).toBe(200);
    const visibleIds = ((await listA.json()).data || []).map((s: any) => Number(s.id));
    expect(visibleIds).not.toContain(settlementForPay);
    expect(visibleIds).not.toContain(settlementForCancel);
  });

  test('T8 - audit trail for create, pay, duplicate pay and cancel', async () => {
    // One CREATE per settlement created by this suite (pay, cancel, ORG B control).
    for (const [label, id, actor] of [
      ['pay settlement', settlementForPay, financeUserId],
      ['cancel settlement', settlementForCancel, financeUserId],
      ['ORG B control settlement', controlSettlement, otherUserId],
    ] as Array<[string, number, number]>) {
      await waitForAuditAction(pool, id, 'SETTLEMENT.CREATE', 1);
      const creates = (await fetchAudit(pool, id)).filter((r) => r.action === 'SETTLEMENT.CREATE');
      expect(creates, `exactly one CREATE for the ${label}`).toHaveLength(1);
      expect(creates[0].actor_id, `CREATE actor for the ${label}`).toBe(actor);
    }

    // Exactly one PAY for the payment that actually changed the state (T4),
    // plus the documented at-most-one extra row from the idempotent repeat (T5).
    const payRows = (await fetchAudit(pool, settlementForPay)).filter((r) => r.action === 'SETTLEMENT.PAY');
    expect(payAuditAfterFirstPay, 'one PAY audit row for the state-changing payment').toBe(1);
    expect(payAuditAfterDuplicate, 'total PAY audit rows after the repeated payment').toBeGreaterThanOrEqual(1);
    expect(payAuditAfterDuplicate).toBeLessThanOrEqual(2);
    expect(payRows.length, 'no further PAY rows appeared after T5').toBe(payAuditAfterDuplicate);
    expect(payRows.every((r) => r.actor_id === financeUserId), 'PAY actor is the finance manager').toBe(true);

    // Cancel settlement: exactly one CANCEL, no PAY. Paid settlement: no CANCEL.
    const cancelRows = (await fetchAudit(pool, settlementForCancel)).filter((r) => r.action === 'SETTLEMENT.CANCEL');
    expect(cancelRows, 'exactly one CANCEL for the cancelled settlement').toHaveLength(1);
    expect(cancelRows[0].actor_id, 'CANCEL actor is the finance manager').toBe(financeUserId);
    expect((await fetchAudit(pool, settlementForCancel)).filter((r) => r.action === 'SETTLEMENT.PAY')).toHaveLength(0);
    expect((await fetchAudit(pool, settlementForPay)).filter((r) => r.action === 'SETTLEMENT.CANCEL')).toHaveLength(0);

    // ORG B control: it was cancelled (authorised) and the rejected pay (409)
    // must not be audited as a payment.
    const controlRows = await fetchAudit(pool, controlSettlement);
    expect(controlRows.filter((r) => r.action === 'SETTLEMENT.CANCEL'), 'one CANCEL for the ORG B control').toHaveLength(1);
    expect(controlRows.filter((r) => r.action === 'SETTLEMENT.PAY'), 'the 409 pay attempt is not audited as a payment').toHaveLength(0);
    const controlCancel = controlRows.find((r) => r.action === 'SETTLEMENT.CANCEL');
    expect(controlCancel?.actor_id, 'CANCEL actor is the ORG B finance manager').toBe(otherUserId);
  });
});
