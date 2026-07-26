export interface MembershipPlanAttributes {
  id?: number;
  code: string;
  name: string;
  description?: string | null;
  category: string;
  duration_type: string;
  duration_value: number;
  price: number;
  currency: string;
  status: 'active' | 'inactive' | 'archived';
  is_default: boolean;
  is_public: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  updated_by?: number | null;
}

export interface MembershipBenefitAttributes {
  id?: number;
  membership_plan_id: number;
  benefit_key: string;
  benefit_value: string;
  display_order: number;
  created_at?: string;
}

export interface UserMembershipAttributes {
  id?: number;
  user_id: number;
  membership_plan_id: number;
  status: 'active' | 'cancelled' | 'expired' | 'frozen';
  start_date: string;
  end_date?: string | null;
  renewal_type: 'auto' | 'manual' | 'none';
  cancelled_at?: string | null;
  expired_at?: string | null;
  frozen_at?: string | null;
}

export interface MembershipHistoryAttributes {
  id?: number;
  user_membership_id: number;
  action: string;
  old_status?: string | null;
  new_status?: string | null;
  notes?: string | null;
  created_by?: number | null;
  created_at?: string;
}

export interface MembershipPlanWithBenefits extends MembershipPlanAttributes {
  benefits: MembershipBenefitAttributes[];
}

export interface UserMembershipWithPlan extends UserMembershipAttributes {
  plan_code?: string;
  plan_name?: string;
  plan_category?: string;
}
