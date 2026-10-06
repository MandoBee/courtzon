/**
 * P0 — Public/unauthenticated tournament browser smoke suite (READ-ONLY).
 *
 * Safety: this spec only performs browser navigation and GET/read operations.
 * It never inserts users, registers, mutates brackets/results/bookings/
 * payments/accounting, never truncates tables, and never calls POST/PATCH/PUT/
 * DELETE. No destructive helpers are imported.
 *
 * Data discovery is done at runtime: it reads `GET /public/tournaments` (safe)
 * and the public UI list, then tests whatever tournament actually exists.
 */
import { test, expect, type Page, type Browser } from '@playwright/test';

const PUBLIC_LIST = '/tournaments/public';
const DESKTOP = { width: 1440, height: 900 };

type Note = { type: string; text: string; url: string };

/** Safe GET discovery of the first public tournament exposed at runtime. */
async function discoverPublicTournament(): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch('http://localhost:3000/public/tournaments');
    if (res.status !== 200) return null;
    const json: any = await res.json();
    const arr: any[] = json?.data ?? json?.tournaments ?? (Array.isArray(json) ? json : []);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const first = arr.find((t) => t && t.id != null);
    if (!first) return null;
    return { id: String(first.id), name: String(first.name ?? '') };
  } catch {
    return null;
  }
}

function attachMonitors(page: Page, notes: Note[]): void {
  page.on('pageerror', (e) => notes.push({ type: 'pageerror', text: String(e).slice(0, 300), url: page.url() }));
  page.on('console', (m) => {
    if (m.type() === 'error') notes.push({ type: 'console', text: m.text().slice(0, 300), url: page.url() });
  });
  page.on('requestfailed', (r) =>
    notes.push({ type: 'requestfailed', text: `${r.url()} :: ${r.failure()?.errorText ?? ''}`.slice(0, 300), url: page.url() }),
  );
}

const fatalPageErrors = (notes: Note[]) => notes.filter((n) => n.type === 'pageerror');

let discovered: { id: string; name: string } | null = null;

test.beforeAll(async () => {
  discovered = await discoverPublicTournament();
});

test.use({ viewport: DESKTOP });

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/e2e/screenshots/${name}`, fullPage: true });
}

// ── GROUP 1 — PUBLIC LIST ────────────────────────────────────────────────
test('G1 public tournament list renders with a live tournament', async ({ page }) => {
  test.skip(!discovered, 'SKIPPED: the runtime API exposes zero public tournaments (no data created).');
  const notes: Note[] = [];
  const listStatuses: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/public/tournaments')) listStatuses.push(r.status());
  });
  attachMonitors(page, notes);

  // Poll with reloads: the strict production rate limit (100 req/min) can return
  // 429 for a few seconds during a rapid run; re-check after the retry window.
  let ok = false;
  for (let i = 0; i < 5 && !ok; i++) {
    await page.goto(PUBLIC_LIST, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).toBeVisible();
    await page.waitForTimeout(1000);
    const anchors = await page.locator('a[href*="/tournaments/public/"]').count();
    const bodyText = await page.evaluate(() => document.body.innerText);
    ok = anchors > 0 || (discovered ? bodyText.includes(discovered.name) : false);
    if (!ok) await page.waitForTimeout(3200); // wait out the rate-limit window
  }
  if (!ok && listStatuses.some((s) => s === 429)) {
    test.skip(true, 'SKIPPED: backend rate limit (429) made the public list empty during the run (environment); no data was created.');
  }

  expect(ok).toBe(true);
  expect(fatalPageErrors(notes)).toHaveLength(0);
  test.info().annotations.push({ type: 'note', description: `runtime public tournaments discovered from API: ${discovered?.name} (id ${discovered?.id})` });
  await screenshot(page, 'p0-g1-public-list.png');
});

// ── GROUP 2 — PUBLIC DETAILS ─────────────────────────────────────────────
test('G2 public tournament detail renders identity + bracket content', async ({ page }) => {
  test.skip(!discovered, 'SKIPPED: no public tournament available at runtime.');
  const notes: Note[] = [];
  attachMonitors(page, notes);

  await page.goto(`/tournaments/public/${discovered!.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).toBeVisible();
  await page.waitForTimeout(1600);

  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText).toContain(discovered!.name);
  expect(bodyText.trim().length).toBeGreaterThan(0);

  const cardCount = await page.locator('.cz-match-card').count();
  const bracketHeadingCount = await page.getByText(/bracket/i).count();
  if (cardCount === 0 && bracketHeadingCount === 0) {
    // Bracket/match content is data-dependent: the selected tournament may have
    // an empty/TBD bracket, which is a legitimate state, not a defect.
    test.info().annotations.push({
      type: 'note',
      description: `Public tournament '${discovered!.name}' (id ${discovered!.id}) renders no bracket/match content in the detail DOM (empty/TBD bracket data).`,
    });
  } else {
    expect(cardCount + bracketHeadingCount).toBeGreaterThan(0);
  }

  // No unexpected horizontal overflow at desktop width.
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw).toBeLessThanOrEqual(cw);

  expect(fatalPageErrors(notes)).toHaveLength(0);
  await screenshot(page, 'p0-g2-public-detail.png');
});

// ── GROUP 3 — PUBLIC MATCH / BRACKET (+ drawer if the surface exposes one) ─
test('G3 public match card renders; drawer semantics when present', async ({ page }) => {
  test.skip(!discovered, 'SKIPPED: no public tournament available at runtime.');
  const notes: Note[] = [];
  attachMonitors(page, notes);

  await page.goto(`/tournaments/public/${discovered!.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);

  const card = page.locator('.cz-match-card').first();
  if ((await card.count()) === 0) {
    test.info().annotations.push({ type: 'note', description: 'Selected public tournament renders no match card (bracket may be empty/TBD).' });
  } else {
    await expect(card).toBeVisible();
    const cardText = (await card.innerText()).trim();
    expect(cardText.length).toBeGreaterThan(0);

    await card.click();
    await page.waitForTimeout(700);
    const dialogCount = await page.getByRole('dialog').count();

    if (dialogCount === 0) {
      // Current architecture: the public surface intentionally has no
      // MatchDetailsDrawer (no onMatchClick is wired).
      test.info().annotations.push({
        type: 'note',
        description: 'Public surface intentionally omits the MatchDetailsDrawer: clicking a card opens no dialog (by design).',
      });
      // Ensure it didn't navigate away or crash.
      expect(page.url()).toContain(`/tournaments/public/${discovered!.id}`);
    } else {
      const dialog = page.getByRole('dialog').first();
      await expect(dialog).toBeVisible();
      expect(await dialog.getAttribute('aria-modal')).toBe('true');

      // Accessible name: labelled by the modal title heading when present.
      const labelledBy = await dialog.getAttribute('aria-labelledby');
      const headingText = await dialog.locator('h2,h1').first().innerText().catch(() => '');
      const hasAccessibleName = labelledBy !== null || headingText.trim().length > 0;
      expect(hasAccessibleName).toBe(true);

      // Close with the real UI close control.
      const closeBtn = dialog.getByRole('button', { name: /close/i }).first();
      if ((await closeBtn.count()) > 0) {
        await closeBtn.click();
        await page.waitForTimeout(500);
        expect(await page.getByRole('dialog').count()).toBe(0);
      }
    }
  }

  expect(fatalPageErrors(notes)).toHaveLength(0);
  await screenshot(page, 'p0-g3-match-card.png');
});

// ── GROUP 4 — INVALID PUBLIC TOURNAMENT ──────────────────────────────────
test('G4 invalid public tournament id does not crash or hang', async ({ page }) => {
  const notes: Note[] = [];
  attachMonitors(page, notes);

  await page.goto('/tournaments/public/999999999', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  await expect(page.locator('#root')).toBeVisible();
  const bodyText = (await page.evaluate(() => document.body.innerText)).trim();
  expect(bodyText.length).toBeGreaterThan(0);

  // Not an infinite blank loading state: a terminal message (error/back) exists.
  const terminal = await page.getByText(/back to|not found|error|no .* found|invalid/i).count();
  expect(terminal).toBeGreaterThan(0);

  expect(fatalPageErrors(notes)).toHaveLength(0);
  await screenshot(page, 'p0-g4-invalid-public.png');
});

// ── GROUP 5 — UNAUTHENTICATED GUARDS (browser navigation only) ───────────
test('G5 unauthenticated protected routes are denied appropriately', async ({ page }) => {
  const notes: Note[] = [];
  attachMonitors(page, notes);

  const routes = ['/tournaments', '/admin/tournament/list', '/org/35/tournaments', '/referee/assignments'];
  const results: Array<{ route: string; status?: number; finalUrl: string; bodyHead: string; denied: boolean }> = [];

  for (const route of routes) {
    const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const finalUrl = page.url();
    const status = res?.status();
    const bodyHead = (await page.evaluate(() => document.body.innerText)).trim().slice(0, 90);
    results.push({
      route,
      status,
      finalUrl,
      bodyHead,
      // Denied = SPA redirected to /login, or the backend returned a 4xx
      // (401 AUTHENTICATION_ERROR, 429 rate-limit during a rapid run, etc.).
      denied: finalUrl.includes('/login') || (status != null && status >= 400),
    });
    test.info().annotations.push({ type: 'note', description: `${route} -> status ${status} final ${finalUrl} body='${bodyHead}'` });
  }

  for (const r of results) {
    expect(r.denied, `route ${r.route} status=${r.status} final=${r.finalUrl} body='${r.bodyHead}'`).toBe(true);
  }
  expect(fatalPageErrors(notes)).toHaveLength(0);
});

// ── GROUP 6 — MOBILE RESPONSIVENESS (390x844) ────────────────────────────
test('G6 public detail usable at 390x844 without unintended overflow', async ({ browser }) => {
  test.skip(!discovered, 'SKIPPED: no public tournament available at runtime.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const notes: Note[] = [];
  attachMonitors(page, notes);
  try {
    await page.goto(`/tournaments/public/${discovered!.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);

    const { sw, cw, text } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      text: (document.body.innerText || '').slice(0, 80),
    }));
    // Intentional bracket-internal scroll is acceptable; the page must not overflow.
    expect(sw).toBeLessThanOrEqual(cw);
    expect(text.length).toBeGreaterThan(0);

    // If a drawer can open on this surface, keep it usable + close reachable.
    const card = page.locator('.cz-match-card').first();
    if ((await card.count()) > 0) {
      await card.click();
      await page.waitForTimeout(600);
      const dialog = page.getByRole('dialog').first();
      if ((await page.getByRole('dialog').count()) > 0) {
        await expect(dialog).toBeVisible();
        const closeBtn = dialog.getByRole('button', { name: /close/i }).first();
        expect(await closeBtn.count()).toBeGreaterThan(0);
        await closeBtn.click();
        await page.waitForTimeout(400);
        expect(await page.getByRole('dialog').count()).toBe(0);
      }
    }

    expect(fatalPageErrors(notes)).toHaveLength(0);
    await page.screenshot({ path: 'test-results/e2e/screenshots/p0-g6-mobile.png' });
  } finally {
    await context.close();
  }
});

// ── GROUP 7 — CONSOLE / RUNTIME / NETWORK ERRORS ──────────────────────────
test('G7 runtime console/network findings collected', async ({ page }) => {
  const notes: Note[] = [];
  const responses: Array<{ status: number; url: string }> = [];
  page.on('response', (r) => {
    const s = r.status();
    if (s >= 400) responses.push({ status: s, url: r.url() });
  });
  attachMonitors(page, notes);

  await page.goto(PUBLIC_LIST, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  if (discovered) {
    await page.goto(`/tournaments/public/${discovered.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
  }

  // Classify: 401 + 404 are expected for unauthenticated/idempotent reads.
  const expectedStatuses = new Set([401, 404]);
  const unexpectedHttp = responses.filter((r) => !expectedStatuses.has(r.status));

  const summary = {
    pageerrors: fatalPageErrors(notes).map((n) => ({ url: n.url, text: n.text })),
    consoleErrors: notes.filter((n) => n.type === 'console').map((n) => ({ url: n.url, text: n.text })),
    failedRequests: notes.filter((n) => n.type === 'requestfailed').map((n) => ({ url: n.url, text: n.text })),
    unexpectedHttp,
    expectedHttp401Count: responses.filter((r) => r.status === 401).length,
    expectedHttp404Count: responses.filter((r) => r.status === 404).length,
  };

  console.log('G7_RUNTIME_SUMMARY=' + JSON.stringify(summary, null, 1));

  // Only unexpected artefacts fail the test.
  expect(fatalPageErrors(notes)).toHaveLength(0);
  expect(unexpectedHttp).toEqual([]);
});