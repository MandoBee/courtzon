import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';

function ResourceSlots({ resourceId, date }: { resourceId: number; date: string }) {
  const { data: slotsData, isLoading } = useQuery({
    queryKey: ['resource-slots', resourceId, date],
    queryFn: () => api.get(`/resources/${resourceId}/slots?date=${date}`).then((r) => r.data.data),
    enabled: !!resourceId && !!date,
  });

  if (isLoading) return <p className="text-xs text-[var(--color-text-muted)] animate-pulse">Loading slots...</p>;

  const slots: { slot_start: string; slot_end: string; status: string }[] = slotsData || [];
  const available = slots.filter((s) => s.status === 'available');

  if (!available.length) {
    return <p className="text-xs text-[var(--color-text-muted)]">No slots available for this date</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {available.slice(0, 8).map((slot) => (
        <Link
          key={slot.slot_start}
          to={`/book/${resourceId}?date=${date}&startTime=${slot.slot_start}&endTime=${slot.slot_end}`}
          className="px-2.5 py-1 text-xs rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-bg)] transition-colors"
        >
          {slot.slot_start}
        </Link>
      ))}
      {available.length > 8 && (
        <Link
          to={`/book/${resourceId}?date=${date}`}
          className="px-2.5 py-1 text-xs rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] transition-colors"
        >
          +{available.length - 8} more
        </Link>
      )}
    </div>
  );
}

export default function ResourceListPage() {
  const { branchId } = useParams();
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);

  const { data: branch } = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => api.get(`/branches/${branchId}`).then((r) => r.data),
    enabled: !!branchId,
  });

  const { data: resources } = useQuery({
    queryKey: ['resources', branchId],
    queryFn: () => api.get(`/branches/${branchId}/resources`).then((r) => r.data.data),
    enabled: !!branchId,
  });

  return (
    <div>
      <Link to="/browse" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-4 inline-block">
        ← Back to Branches
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">{branch?.name || 'Branch'}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{branch?.address_line1}{branch?.city ? `, ${branch.city}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-text-muted)]">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {resources?.map((resource: any) => (
          <div key={resource.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-medium text-[var(--color-text)]">{resource.name}</h3>
                <p className="text-xs text-[var(--color-text-muted)]">{resource.resource_type_name}{resource.sport_name ? ` • ${resource.sport_name}` : ''}</p>
              </div>
              <span className={`px-2 py-0.5 text-xs rounded-full ${resource.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'}`}>
                {resource.is_active ? 'Available' : 'Maintenance'}
              </span>
            </div>
            <div className="flex gap-3 text-xs text-[var(--color-text-muted)] mb-3">
              <span>Capacity: {resource.capacity}</span>
              <span>Slots: {resource.slot_duration || resource.default_slot_duration}min</span>
              {resource.opening_time && resource.closing_time && (
                <span>🕐 {resource.opening_time?.slice(0, 5)}–{resource.closing_time?.slice(0, 5)}</span>
              )}
            </div>
            {resource.is_active && (
              <div className="mt-auto pt-3 border-t border-[var(--color-border)]">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Available Slots</p>
                <ResourceSlots resourceId={resource.id} date={selectedDate} />
              </div>
            )}
          </div>
        ))}
        {(!resources || resources.length === 0) && (
          <div className="col-span-full text-center py-12 text-sm text-[var(--color-text-muted)]">
            No resources available at this branch
          </div>
        )}
      </div>
    </div>
  );
}
