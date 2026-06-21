import BookingsTable from '../../../components/booking/BookingsTable';

export default function BookingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">All Bookings</h1>
      <BookingsTable context="admin" />
    </div>
  );
}
