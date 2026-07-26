import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class WalletPage {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/profile');
    await this.page.waitForLoadState('networkidle');
  }

  async getBalance(): Promise<number> {
    const balanceText = await this.page.locator(
      '[data-testid="wallet-balance"], [data-testid="wallet-balance"] p, h1:has-text("Wallet") + p',
    ).first().textContent();
    if (!balanceText) return 0;
    const cleaned = balanceText.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }

  async clickTopUp(): Promise<void> {
    const topUpBtn = this.page.locator(
      '[data-testid="wallet-topup"], button:has-text("Deposit"), button:has-text("Top Up")',
    ).first();
    await topUpBtn.click();
  }

  async enterTopUpAmount(amount: string): Promise<void> {
    const amountInput = this.page.locator(
      '[data-testid="topup-amount"] input, input[name="amount"], input[type="number"]',
    ).first();
    await amountInput.fill(amount);
  }

  async submitTopUp(): Promise<void> {
    const submitBtn = this.page.locator(
      '[data-testid="topup-submit"], button[type="submit"]:has-text("Deposit"), button:has-text("Deposit")',
    ).first();
    await submitBtn.click();
  }
}
