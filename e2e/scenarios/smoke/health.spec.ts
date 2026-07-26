import { test, expect } from '@playwright/test';
import { api } from '../../helpers/api';

test('backend health returns ok', async () => {
  const health = await api.health();
  expect(health.status).toBe(200);
});

test('frontend loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).toBeVisible();
});
