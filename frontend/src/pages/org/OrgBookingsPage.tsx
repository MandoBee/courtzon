import BookingsTable from '../../components/booking/BookingsTable';

export default function OrgBookingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Bookings</h1>
      <BookingsTable context="org" />
    </div>
  );
}
