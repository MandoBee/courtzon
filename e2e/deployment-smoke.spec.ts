import { test, expect } from '@playwright/test';

const API = process.env.APP_URL || 'http://localhost:3000';
const APP = process.env.FRONTEND_URL || 'http://localhost:5173';

test.describe('Deployment Smoke Tests', () => {

  test('API health endpoint returns ok', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('API health/live returns uptime', async ({ request }) => {
    const res = await request.get(`${API}/health/live`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeDefined();
  });

  test('API health/ready returns ok', async ({ request }) => {
    const res = await request.get(`${API}/health/ready`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('Public countries endpoint returns data', async ({ request }) => {
    const res = await request.get(`${API}/public/countries`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data || body)).toBe(true);
  });

  test('Public languages endpoint returns data', async ({ request }) => {
    const res = await request.get(`${API}/public/languages`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data || body)).toBe(true);
  });

  test('Public feature-flags endpoint returns data', async ({ request }) => {
    const res = await request.get(`${API}/public/feature-flags`);
    expect(res.status()).toBe(200);
  });

  test('Public app-settings endpoint returns data', async ({ request }) => {
    const res = await request.get(`${API}/public/app-settings`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test('Frontend loads without crash', async ({ page }) => {
    const res = await page.goto(APP, { waitUntil: 'networkidle' });
    expect(res?.status()).toBeLessThan(400);
  });

  test('Frontend loads app settings', async ({ page }) => {
    await page.goto(APP, { waitUntil: 'networkidle' });
    const title = await page.title();
    expect(title).toBeDefined();
  });

});
