import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { useAuthStore } from '../../store/auth.store';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';

export default function AcademyDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const [curriculumId, setCurriculumId] = useState<number | ''>('');

  const { data: a } = useQuery({
    queryKey: ['academy', id],
    queryFn: () => api.get(`/academies/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const enrollMutation = useMutation({
    mutationFn: () => api.post(`/academies/${id}/enroll`, {
      playerId: user!.id,
      curriculumId: curriculumId ? Number(curriculumId) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academy', id] });
      showToast('Enrolled successfully!');
    },
    onError: (err) => showToast('Enrollment failed: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error'),
  });

  if (!a) return <p className="text-[var(--color-text-muted)]">Loading...</p>;

  const alreadyEnrolled = (a.enrollments || []).some((e: any) => e.player_id === user?.id);

  return (
    <div>
      <Link to="/academies" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-4 inline-block">← Academies</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">{a.name}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{a.organisation_name}{a.sport_name ? ` • ${a.sport_name}` : ''}</p>
        </div>
        <Can permission="academies.enroll">
          <div className="flex items-end gap-2">
            {a.curriculums?.length > 0 && (
              <select value={curriculumId} onChange={(e) => setCurriculumId(e.target.value ? Number(e.target.value) : '')}
                className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]">
                <option value="">Any curriculum</option>
                {a.curriculums.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button
              disabled={alreadyEnrolled || enrollMutation.isPending}
              onClick={() => enrollMutation.mutate()}
              className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {alreadyEnrolled ? 'Enrolled' : enrollMutation.isPending ? 'Enrolling…' : 'Enroll'}
            </button>
          </div>
        </Can>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Curriculums */}
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5">
          <h2 className="font-medium mb-3">Curriculums ({a.curriculums?.length || 0})</h2>
          <div className="space-y-2">
            {a.curriculums?.map((c: any) => (
              <div key={c.id} className="p-3 border border-[var(--color-border)] rounded-[var(--radius-md)]">
                <p className="font-medium text-sm">{c.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{c.duration_weeks ? `${c.duration_weeks} weeks` : ''} • {formatPrice(Number(c.price), c.currency_code)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Enrollments */}
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5">
          <h2 className="font-medium mb-3">Enrollments ({a.enrollments?.length || 0})</h2>
          <div className="space-y-2">
            {a.enrollments?.map((e: any) => (
              <div key={e.id} className="flex justify-between items-center p-3 border border-[var(--color-border)] rounded-[var(--radius-md)]">
                <span className="text-sm">{e.player_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  e.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : e.status === 'completed' ? 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                }`}>{e.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sessions */}
        <div className="lg:col-span-2 bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5">
          <h2 className="font-medium mb-3">Sessions ({a.sessions?.length || 0})</h2>
          <div className="space-y-2">
            {a.sessions?.map((s: any) => (
              <div key={s.id} className="flex justify-between items-center p-3 border border-[var(--color-border)] rounded-[var(--radius-md)]">
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{s.coach_name ? `Coach: ${s.coach_name}` : ''}{s.resource_name ? ` • ${s.resource_name}` : ''}</p>
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">{new Date(s.start_time).toLocaleString('en-GB')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
