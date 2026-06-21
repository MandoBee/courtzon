export interface AdminBookingRow {
  id: number;
  booking_type: string;
  booking_status: string;
  payment_status: string;
  payment_method?: string | null;
  booking_date: string;
  start_time?: string;
  end_time?: string;
  total_amount: number | string;
  organisation_name?: string | null;
  branch_name?: string | null;
  resource_name?: string | null;
  user_name?: string | null;
  user_phone?: string | null;
  full_name?: string | null;
}
