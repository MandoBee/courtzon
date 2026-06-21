export interface DashboardStats {
  totalUsers?: number;
  activeUsersToday?: number;
  totalOrganisations?: number;
  pendingOrganisations?: number;
  totalBookings?: number;
  todayBookings?: number;
  totalRevenue?: number | string;
  totalProducts?: number;
  totalCoaches?: number;
}

export interface TimelinePoint {
  date: string;
  amount?: number | string;
  count?: number | string;
}

export interface RecentBookingActivity {
  id: number;
  full_name: string;
  booking_type: string;
  total_amount: number | string;
  booking_status: string;
}

export interface RecentUserActivity {
  id: number;
  full_name: string;
  email: string;
  created_at: string;
}

export interface RecentOrderActivity {
  id: number;
  full_name: string;
  total: number | string;
  status: string;
}

export interface SystemHealth {
  uptime?: number;
  dbStatus?: boolean;
  errors24h?: number;
}

export interface DashboardTrends {
  revenueTimeline?: TimelinePoint[];
  bookingTimeline?: TimelinePoint[];
  systemHealth?: SystemHealth;
  recentActivity?: {
    bookings?: RecentBookingActivity[];
    users?: RecentUserActivity[];
    orders?: RecentOrderActivity[];
  };
}
