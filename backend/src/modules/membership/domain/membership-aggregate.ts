export type MembershipPlanType =
  | 'monthly' | 'quarterly' | 'semiannual' | 'annual'
  | 'unlimited' | 'credits' | 'session_bundle'
  | 'corporate' | 'family' | 'student';

export type MembershipStatus = 'active' | 'expired' | 'cancelled' | 'pending';

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface MembershipPlan {
  id?: number;
  name: string;
  planType: MembershipPlanType;
  durationDays: number;
  price: number;
  credits?: number;
  sessions?: number;
  benefits: MembershipBenefit[];
  isActive: boolean;
  organisationId?: number;
}

export interface MembershipBenefit {
  type: 'priority_booking' | 'exclusive_pricing' | 'guest_passes' | 'free_cancellation'
      | 'wallet_credit' | 'academy_discount' | 'marketplace_discount' | 'coach_discount'
      | 'tournament_discount';
  value: number;
  description?: string;
}

export interface Membership {
  id?: number;
  userId: number;
  planId: number;
  status: MembershipStatus;
  startDate: string;
  endDate: string;
  creditsUsed: number;
  sessionsUsed: number;
  autoRenew: boolean;
  aggregateVersion: number;
}

export interface LoyaltyPoints {
  userId: number;
  totalEarned: number;
  totalSpent: number;
  currentBalance: number;
  currentTier: LoyaltyTier;
}

export interface TierConfig {
  tier: LoyaltyTier;
  minPoints: number;
  benefits: MembershipBenefit[];
  multiplier: number; // points multiplier
}

export interface Campaign {
  id?: number;
  name: string;
  description?: string;
  pointsMultiplier: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  applicableActivities?: string[];
}

export interface RewardCatalog {
  id?: number;
  name: string;
  description?: string;
  pointsCost: number;
  rewardType: 'wallet_credit' | 'coupon' | 'free_booking' | 'free_session'
              | 'voucher' | 'merchandise' | 'tournament_ticket';
  rewardValue: number;
  quantity: number;
  isActive: boolean;
}

export interface RewardClaim {
  id?: number;
  userId: number;
  rewardId: number;
  pointsUsed: number;
  claimedAt: string;
}

const TIER_CONFIGS: TierConfig[] = [
  { tier: 'bronze', minPoints: 0, benefits: [], multiplier: 1 },
  { tier: 'silver', minPoints: 1000, benefits: [{ type: 'priority_booking', value: 0 }], multiplier: 1.2 },
  { tier: 'gold', minPoints: 5000, benefits: [{ type: 'priority_booking', value: 0 }, { type: 'free_cancellation', value: 100 }], multiplier: 1.5 },
  { tier: 'platinum', minPoints: 15000, benefits: [{ type: 'priority_booking', value: 0 }, { type: 'free_cancellation', value: 100 }, { type: 'wallet_credit', value: 200 }], multiplier: 2 },
  { tier: 'diamond', minPoints: 50000, benefits: [{ type: 'priority_booking', value: 0 }, { type: 'free_cancellation', value: 100 }, { type: 'wallet_credit', value: 500 }, { type: 'academy_discount', value: 20 }], multiplier: 3 },
];

export function getTierConfig(tier: LoyaltyTier): TierConfig {
  return TIER_CONFIGS.find(t => t.tier === tier) || TIER_CONFIGS[0];
}

export function calculateTier(totalPoints: number): LoyaltyTier {
  const sorted = [...TIER_CONFIGS].sort((a, b) => b.minPoints - a.minPoints);
  for (const cfg of sorted) {
    if (totalPoints >= cfg.minPoints) return cfg.tier;
  }
  return 'bronze';
}

export function calculatePoints(amount: number, tier: LoyaltyTier, campaignMultiplier: number = 1): number {
  const multiplier = getTierConfig(tier).multiplier;
  return Math.round(amount * multiplier * campaignMultiplier);
}

export function isMembershipActive(membership: Membership): boolean {
  return membership.status === 'active' && new Date(membership.endDate) > new Date();
}
