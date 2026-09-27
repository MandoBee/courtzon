import { Link } from 'react-router-dom';
import BookingsTable from '../../../components/booking/BookingsTable';
import { useCan } from '../../../hooks/useCan';

export default function BookingsPage() {
  const { can } = useCan();
  const canRecurring = can('org.bookings.manage') || can('admin.bookings.update-status');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">All Bookings</h1>
        {canRecurring && (
          <Link to="/admin/recurring" className="cz-btn inline-flex items-center justify-center px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white text-sm hover:opacity-90">
            + Recurring Reservation
          </Link>
        )}
      </div>
      <BookingsTable context="admin" />
    </div>
  );
}