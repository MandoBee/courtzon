import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface CardDetails {
  number: string;
  expiry: string;
  cvc: string;
  name?: string;
}

export class PaymentPage {
  constructor(public readonly page: Page) {}

  async goto(url?: string): Promise<void> {
    if (url) {
      await this.page.goto(url);
    } else {
      await this.page.goto('/profile');
    }
    await this.page.waitForLoadState('networkidle');
  }

  async selectPaymentMethod(method: string): Promise<void> {
    const methodBtn = this.page.locator(
      `[data-testid="payment-method-${method}"], button[data-payment="${method}"], button:has-text("${method}")`,
    ).first();
    await methodBtn.click();
  }

  async enterCardDetails(details: CardDetails): Promise<void> {
    const iframe = this.page.frameLocator('iframe[title="Payment"], iframe[src*="paymob"], iframe[src*="payment"]');
    const frame = iframe.first();

    if (await frame.locator('body').isVisible().catch(() => false)) {
      if (details.name) {
        await frame.locator('input[name="name"], input[placeholder*="Name"], input[placeholder*="Cardholder"]').first().fill(details.name);
      }
      await frame.locator('input[name="number"], input[placeholder*="Card Number"], input[placeholder*="card number"]').first().fill(details.number);
      await frame.locator('input[name="expiry"], input[placeholder*="MM/YY"], input[placeholder*="mm/yy"]').first().fill(details.expiry);
      await frame.locator('input[name="cvc"], input[placeholder*="CVC"], input[placeholder*="cvc"]').first().fill(details.cvc);
    } else {
      await this.page.locator('[data-testid="card-number"]').fill(details.number);
      if (details.expiry) await this.page.locator('[data-testid="card-expiry"]').fill(details.expiry);
      if (details.cvc) await this.page.locator('[data-testid="card-cvc"]').fill(details.cvc);
      if (details.name) await this.page.locator('[data-testid="card-name"]').fill(details.name);
    }
  }

  async submitPayment(): Promise<void> {
    const btn = this.page.locator(
      '[data-testid="payment-submit"], button[type="submit"]:has-text("Pay"), button:has-text("Submit")',
    ).first();
    await btn.click();
  }

  async waitForPaymentResult(): Promise<'success' | 'failure'> {
    await this.page.waitForLoadState('networkidle');
    const success = this.page.locator(
      '[data-testid="payment-success"], text=Payment Successful, text=Deposit completed',
    ).first();
    const failure = this.page.locator(
      '[data-testid="payment-failure"], [data-testid="payment-error"], text=Payment Failed, text=Deposit failed',
    ).first();

    const result = await Promise.race([
      success.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'success' as const),
      failure.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'failure' as const),
    ]);
    return result;
  }
}
