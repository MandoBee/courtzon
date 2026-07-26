import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class MatchPage {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/matches');
    await this.page.waitForLoadState('networkidle');
  }

  async createMatch(): Promise<void> {
    const createBtn = this.page.locator(
      '[data-testid="create-match"], a:has-text("Create Match"), button:has-text("Create Match")',
    ).first();
    await createBtn.click();
    await this.page.waitForURL(/\/browse|\/bookings/, { timeout: 10_000 });
  }

  async joinMatch(matchId: number | string): Promise<void> {
    const joinBtn = this.page.locator(
      `[data-testid="match-${matchId}-join"], [data-testid="join-match-${matchId}"], button:has-text("Join")`,
    ).first();
    await joinBtn.click();
  }

  async viewApplicants(): Promise<void> {
    const manageBtn = this.page.locator(
      '[data-testid="manage-applicants"], button:has-text("Manage Applicants")',
    ).first();
    await manageBtn.click();
  }

  async acceptPlayer(userId: number | string): Promise<void> {
    const acceptBtn = this.page.locator(
      `[data-testid="accept-player-${userId}"], [data-testid="applicant-${userId}"] button:has-text("Accept")`,
    ).first();
    await acceptBtn.click();
  }
}
