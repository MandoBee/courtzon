interface EntityPreviewProps {
  entity: any;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

export default function EntityPreview({ entity, onClose, onNavigate }: EntityPreviewProps) {

  const type = entity?.type || entity?._type || 'entity';
  const label = entity?.full_name || entity?.name || `#${entity?.id}`;
  const id = entity?.id;

  const quickActions: { label: string; icon: string; action: () => void }[] = [];

  if (type === 'user' || type === 'player') {
    quickActions.push(
      { label: 'View Profile', icon: '👤', action: () => { onNavigate?.(`/admin/users`); } },
      { label: 'View Bookings', icon: '📅', action: () => { onNavigate?.(`/admin/bookings?userId=${id}`); } },
    );
  }
  if (type === 'booking') {
    quickActions.push(
      { label: 'View Details', icon: '📋', action: () => onNavigate?.(`/bookings`) },
    );
  }
  if (type === 'organisation') {
    quickActions.push(
      { label: 'View Dashboard', icon: '📊', action: () => onNavigate?.(`/admin/organisations`) },
      { label: 'View Branches', icon: '🏛️', action: () => onNavigate?.(`/admin/organisations/${id}/branches`) },
    );
  }

  return (
    <div className="fixed inset-0 z-[102] bg-black/20" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="fixed right-0 top-0 h-full w-full max-w-md bg-[var(--color-surface)] shadow-2xl border-l border-[var(--color-border)] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h2 className="text-base font-bold text-[var(--color-text)]">{label}</h2>
          <button onClick={onClose} className="text-2xl text-[var(--color-text-muted)] hover:text-[var(--color-text)]">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Entity info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">Type</span><span className="text-sm capitalize">{type}</span></div>
            <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">ID</span><span className="text-sm font-mono">{id}</span></div>
            {entity?.email && <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">Email</span><span className="text-sm">{entity.email}</span></div>}
            {entity?.booking_status && <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">Status</span><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${entity.booking_status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{entity.booking_status}</span></div>}
            {entity?.booking_date && <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">Date</span><span className="text-sm">{entity.booking_date}</span></div>}
            {entity?.start_time && <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">Time</span><span className="text-sm">{entity.start_time}–{entity.end_time}</span></div>}
            {entity?.resource_name && <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">Court</span><span className="text-sm">{entity.resource_name}</span></div>}
            {entity?.branch_name && <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">Branch</span><span className="text-sm">{entity.branch_name}</span></div>}
            {entity?.slug && <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">Slug</span><span className="text-sm">{entity.slug}</span></div>}
            {entity?.is_active !== undefined && <div className="flex items-center gap-2"><span className="text-xs text-[var(--color-text-muted)] w-20">Active</span><span className={`text-sm ${entity.is_active ? 'text-green-600' : 'text-red-600'}`}>{entity.is_active ? 'Yes' : 'No'}</span></div>}
          </div>

          {/* Quick Actions */}
          {quickActions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2">Quick Actions</h3>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((a, i) => (
                  <button key={i} onClick={a.action} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--color-bg)] rounded-lg hover:bg-[var(--color-primary)]/10 transition-colors">
                    <span>{a.icon}</span><span>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
