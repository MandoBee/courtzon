import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';

export default function CommunityEventsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', eventType: 'social', startTime: '', endTime: '', maxParticipants: '' as any });

  const { data: events } = useQuery({
    queryKey: ['community-events'],
    queryFn: () => api.get('/community/events').then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/community/events', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['community-events'] }); setShowForm(false); setForm({ title: '', description: '', eventType: 'social', startTime: '', endTime: '', maxParticipants: '' }); },
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: number; status: string }) => api.post(`/community/events/${eventId}/rsvp`, { status }),
  });

  const typeColors: Record<string, string> = {
    match: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]', training: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
    social: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]', tournament: 'bg-purple-100 text-purple-700', other: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Community Events</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm">
          {showForm ? 'Cancel' : '+ Create Event'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm mb-1">Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" rows={2} />
            </div>
            <div>
              <label className="block text-sm mb-1">Type</label>
              <select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm">
                <option value="match">Match</option><option value="training">Training</option><option value="social">Social</option><option value="tournament">Tournament</option><option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Max Participants</label>
              <input type="number" value={form.maxParticipants} onChange={(e) => setForm({ ...form, maxParticipants: e.target.value ? Number(e.target.value) : '' })} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">Start</label>
              <input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">End</label>
              <input type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
            </div>
          </div>
          <button type="submit" disabled={createMutation.isPending} className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm">
            {createMutation.isPending ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {events?.map((e: any) => (
          <div key={e.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-[var(--color-text)]">{e.title}</h3>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${typeColors[e.event_type] || ''}`}>{e.event_type}</span>
                </div>
                <p className="text-sm text-[var(--color-text-muted)] mb-1">{e.description}</p>
                <div className="flex gap-3 text-xs text-[var(--color-text-muted)]">
                  <span>📅 {new Date(e.start_time).toLocaleString('en-GB')}</span>
                  <span>by {e.creator_name}</span>
                  {e.max_participants && <span>Max: {e.max_participants}</span>}
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                {['going', 'maybe'].map((s) => (
                  <button key={s} onClick={() => rsvpMutation.mutate({ eventId: e.id, status: s })} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs hover:bg-[var(--color-bg)]">{s}</button>
                ))}
              </div>
            </div>
          </div>
        ))}
        {(!events || !events.length) && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No upcoming events</p>}
      </div>
    </div>
  );
}
