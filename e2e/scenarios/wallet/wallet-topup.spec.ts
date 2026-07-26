import { test, expect } from '../../fixtures/auth';
import { WalletPage } from '../../pages/WalletPage';
import { PaymentPage } from '../../pages/PaymentPage';

test.describe('Wallet Top-Up', () => {

  test('navigate to wallet, check balance, and initiate top-up', async ({ authenticatedPlayer }) => {
    const { page } = authenticatedPlayer;
    const walletPage = new WalletPage(page);
    const paymentPage = new PaymentPage(page);

    await walletPage.goto();
    await page.waitForLoadState('networkidle');

    const initialBalance = await walletPage.getBalance();
    expect(typeof initialBalance).toBe('number');

    await walletPage.clickTopUp();

    const topUpAmount = '100';
    await walletPage.enterTopUpAmount(topUpAmount);
    await walletPage.submitTopUp();

    const result = await paymentPage.waitForPaymentResult();

    if (result === 'success') {
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');
      const newBalance = await walletPage.getBalance();
      expect(newBalance).toBeGreaterThan(initialBalance);
    }
  });

});
