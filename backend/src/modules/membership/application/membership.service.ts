import { membershipRepository } from '../infrastructure/repositories/membership.repository.js';
import { calculateTier, calculatePoints, isMembershipActive, getTierConfig } from '../domain/membership-aggregate.js';
import type { Membership, LoyaltyPoints, MembershipPlan, Campaign, RewardCatalog } from '../domain/membership-aggregate.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

export class MembershipService {
  // ── Plans ──
  async getPlans(organisationId?: number) {
    return membershipRepository.findPlans({ isActive: true, organisationId });
  }

  async createPlan(data: MembershipPlan) {
    const id = await membershipRepository.createPlan(data);
    return id;
  }

  // ── Memberships ──
  async subscribe(userId: number, planId: number): Promise<number> {
    const plan = await membershipRepository.findPlanById(planId);
    if (!plan) throw new Error('Plan not found');

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationDays * 86400000);

    const membership: Membership = {
      userId, planId, status: 'active',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      creditsUsed: 0, sessionsUsed: 0, autoRenew: false,
      aggregateVersion: 1,
    };

    const id = await membershipRepository.createMembership(membership);

    eventBusV2.emit('membership.created', { membershipId: id, userId, planId, endDate: endDate.toISOString() } as Record<string, unknown>, {
      aggregateType: 'membership', aggregateId: String(id), aggregateVersion: 1,
    });

    return id;
  }

  async getUserMemberships(userId: number) {
    return membershipRepository.findMembershipsByUser(userId);
  }

  async getActiveMembership(userId: number) {
    return membershipRepository.findActiveMembership(userId);
  }

  // ── Loyalty ──
  async getLoyalty(userId: number): Promise<LoyaltyPoints> {
    const existing = await membershipRepository.getLoyaltyPoints(userId);
    if (existing) return existing;
    return { userId, totalEarned: 0, totalSpent: 0, currentBalance: 0, currentTier: 'bronze' };
  }

  async earnPoints(userId: number, amount: number, activityType?: string): Promise<LoyaltyPoints> {
    const loyalty = await this.getLoyalty(userId);
    const campaigns = await membershipRepository.findCampaigns(true);
    const activeCampaign = campaigns.find(c => new Date(c.startDate) <= new Date() && new Date(c.endDate) >= new Date());
    const campaignMultiplier = activeCampaign?.pointsMultiplier || 1;

    const points = calculatePoints(amount, loyalty.currentTier, campaignMultiplier);
    loyalty.totalEarned += points;
    loyalty.currentBalance += points;
    loyalty.currentTier = calculateTier(loyalty.totalEarned);

    await membershipRepository.upsertLoyaltyPoints(loyalty);

    eventBusV2.emit('points.earned', { userId, points, balance: loyalty.currentBalance, tier: loyalty.currentTier } as Record<string, unknown>, {
      aggregateType: 'loyalty', aggregateId: String(userId), aggregateVersion: 1,
    });

    return loyalty;
  }

  async spendPoints(userId: number, points: number): Promise<LoyaltyPoints> {
    const loyalty = await this.getLoyalty(userId);
    if (loyalty.currentBalance < points) throw new Error('Insufficient points');

    loyalty.currentBalance -= points;
    loyalty.totalSpent += points;

    await membershipRepository.upsertLoyaltyPoints(loyalty);

    eventBusV2.emit('points.spent', { userId, points, balance: loyalty.currentBalance } as Record<string, unknown>, {
      aggregateType: 'loyalty', aggregateId: String(userId), aggregateVersion: 1,
    });

    return loyalty;
  }

  // ── Campaigns ──
  async getCampaigns() {
    return membershipRepository.findCampaigns();
  }

  async createCampaign(data: Campaign) {
    return membershipRepository.createCampaign(data);
  }

  // ── Rewards ──
  async getRewards() {
    return membershipRepository.findRewards(true);
  }

  async createReward(data: RewardCatalog) {
    return membershipRepository.createReward(data);
  }

  async claimReward(userId: number, rewardId: number): Promise<number> {
    const rewards = await membershipRepository.findRewards(true);
    const reward = rewards.find(r => r.id === rewardId);
    if (!reward) throw new Error('Reward not found');
    if (reward.quantity <= 0) throw new Error('Reward out of stock');

    await this.spendPoints(userId, reward.pointsCost);
    const claimId = await membershipRepository.claimReward(userId, rewardId, reward.pointsCost);

    eventBusV2.emit('reward.claimed', { claimId, userId, rewardId, pointsUsed: reward.pointsCost } as Record<string, unknown>, {
      aggregateType: 'reward', aggregateId: String(claimId), aggregateVersion: 1,
    });

    return claimId;
  }
}

export const membershipService = new MembershipService();
