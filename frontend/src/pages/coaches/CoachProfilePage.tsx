import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useToast } from '../../components/ui/Toast';
import { useCan } from '../../hooks/useCan';
import { Can } from '../../permissions/Can';
import api from '../../services/api';
import { useTranslation } from '../../i18n';


const DURATIONS = [30, 60, 90, 120, 150, 180];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CoachProfilePage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { showToast } = useToast();
  const { can } = useCan();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'profile' | 'availability' | 'orgs'>('profile');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-coach-profile'],
    queryFn: () => api.get('/coaches/profile/me').then((r) => r.data).catch(() => null),
  });

  const { data: sportsList } = useQuery({
    queryKey: ['sports'],
    queryFn: () => api.get('/sports').then(r => r.data || []),
    staleTime: 300000,
  });

  const { data: orgList } = useQuery({
    queryKey: ['organisations'],
    queryFn: () => api.get('/organisations').then(r => r.data?.data || r.data || []),
  });

  const { data: agreements } = useQuery({
    queryKey: ['my-coach-agreements'],
    queryFn: () => api.get('/coaches/agreements').then(r => r.data?.data || []),
    enabled: !!profile,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('coach.profile.title')}</h1>
        <Link to="/coaches" className="px-4 py-2 border rounded-[var(--radius-md)] text-sm">{t('coach.profile.directory')}</Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">{t('common.loading')}</div>
      ) : !profile ? (
        <CreateCoachForm sportsList={sportsList} queryClient={queryClient} showToast={showToast} />
      ) : (
        <>
          <div className="flex gap-1 mb-6 border-b border-[var(--color-border)]">
            <button onClick={() => setActiveTab('profile')} className={`px-5 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'profile' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{t('coach.profile.tab_profile')}</button>
            <Can permission="coaches.availability.manage">
              <button onClick={() => setActiveTab('availability')} className={`px-5 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'availability' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{t('coach.profile.tab_availability')}</button>
            </Can>
            <button onClick={() => setActiveTab('orgs')} className={`px-5 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'orgs' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>Organizations</button>
          </div>

          {activeTab === 'profile' ? (
            <CoachProfileTab profile={profile} sportsList={sportsList} user={user} queryClient={queryClient} showToast={showToast} />
          ) : activeTab === 'availability' && can('coaches.availability.manage') ? (
            <CoachAvailabilityTab queryClient={queryClient} showToast={showToast} />
          ) : (
            <CoachOrgsTab orgList={orgList} agreements={agreements} queryClient={queryClient} showToast={showToast} />
          )}
        </>
      )}
    </div>
  );
}

function CreateCoachForm({ sportsList, queryClient, showToast }: any) {
  const [bio, setBio] = useState('');
  const [exp, setExp] = useState('');
  const [rate, setRate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [sportIds, setSportIds] = useState<number[]>([]);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/coaches/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-coach-profile'] });
      showToast('Coach profile created!');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to create', 'error'),
  });

  function handleSubmit(e: any) {
    e.preventDefault();
    mutation.mutate({
      bio: bio || undefined,
      experienceYears: exp ? Number(exp) : undefined,
      hourlyRate: rate ? Number(rate) : undefined,
      currencyCode: currency,
      sports: sportIds.length ? sportIds : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-6 space-y-4">
      <h2 className="font-medium">Create Coach Profile</h2>
      <div>
        <label className="block text-sm mb-1">Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" rows={3} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm mb-1">Experience (yrs)</label>
          <input type="number" value={exp} onChange={(e) => setExp(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
        </div>
        <div>
          <label className="block text-sm mb-1">Hourly Rate</label>
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
        </div>
        <div>
          <label className="block text-sm mb-1">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm">
            <option value="AED">AED</option><option value="SAR">SAR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="EGP">EGP</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm mb-1">Sports</label>
        <div className="flex flex-wrap gap-2">
          {(sportsList || []).map((s: any) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={sportIds.includes(s.id)} onChange={() => setSportIds((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])} />
              {s.name}
            </label>
          ))}
        </div>
      </div>
      <button type="submit" disabled={mutation.isPending} className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm">
        {mutation.isPending ? 'Saving...' : 'Create Profile'}
      </button>
    </form>
  );
}

function CoachProfileTab({ profile, sportsList, user, queryClient, showToast }: any) {
  const { t } = useTranslation();
  const [bio, setBio] = useState(profile.bio || '');
  const [exp, setExp] = useState(profile.experience_years?.toString() || '');
  const [rate, setRate] = useState(profile.hourly_rate?.toString() || '');
  const [currency, setCurrency] = useState(profile.currency_code || user?.defaultCurrency || 'USD');
  const [available, setAvailable] = useState(profile.is_available !== false);
  const parseJSON = (v: any): any[] => typeof v === 'string' ? JSON.parse(v) : (v || []);
  const [durations, setDurations] = useState<number[]>(parseJSON(profile.session_durations));
  const [sportIds, setSportIds] = useState<number[]>(parseJSON(profile.sports));
  const [certs, setCerts] = useState<{ name: string; url: string }[]>(parseJSON(profile.certifications));
  const [uploading, setUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: any) => api.put('/coaches/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-coach-profile'] });
      showToast('Profile updated!');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Update failed', 'error'),
  });

  function handleCertUpload(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    api.post('/upload/coach-cert', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => {
        const result = r.data;
        const name = file.name.replace(/\.[^/.]+$/, '');
        setCerts((prev) => [...prev, { name, url: result.url }]);
      })
      .catch(() => showToast('Upload failed', 'error'))
      .finally(() => setUploading(false));
  }

  function removeCert(idx: number) {
    setCerts((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    mutation.mutate({
      bio: bio || undefined,
      experienceYears: exp ? Number(exp) : undefined,
      hourlyRate: rate ? Number(rate) : undefined,
      currencyCode: currency,
      isAvailable: available,
      sessionDurations: durations.length ? durations : undefined,
      sports: sportIds.length ? sportIds : undefined,
      certifications: certs.length ? certs : undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Details</h2>
          <span className="text-xs text-[var(--color-text-muted)]">{profile.is_verified ? '✅ Verified' : 'Not verified'}</span>
        </div>

        <div>
          <label className="block text-sm mb-1">Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" rows={3} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">Experience (yrs)</label>
            <input type="number" value={exp} onChange={(e) => setExp(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
          </div>
          <div>
            <label className="block text-sm mb-1">Hourly Rate</label>
            <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
          </div>
          <div>
            <label className="block text-sm mb-1">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm">
              <option value="AED">AED</option><option value="SAR">SAR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="EGP">EGP</option><option value="GBP">GBP</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="w-4 h-4" />
            Available for bookings
          </label>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 space-y-3">
        <h2 className="font-medium">Session Durations</h2>
        <p className="text-xs text-[var(--color-text-muted)]">Select the session lengths you offer. These will appear on the booking page.</p>
        <div className="flex flex-wrap gap-3">
          {DURATIONS.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm cursor-pointer border rounded-[var(--radius-md)] px-3 py-2 hover:border-[var(--color-primary)]">
              <input type="checkbox" checked={durations.includes(d)} onChange={() => setDurations((prev) => prev.includes(d) ? prev.filter((v) => v !== d) : [...prev, d])} />
              {d} min
            </label>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 space-y-3">
        <h2 className="font-medium">Sports</h2>
        <div className="flex flex-wrap gap-3">
          {(sportsList || []).map((s: any) => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer border rounded-[var(--radius-md)] px-3 py-2 hover:border-[var(--color-primary)]">
              <input type="checkbox" checked={sportIds.includes(s.id)} onChange={() => setSportIds((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])} />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 space-y-3">
        <h2 className="font-medium">Certifications</h2>
        <div className="space-y-2">
          {certs.map((c, i) => (
            <div key={i} className="flex items-center justify-between text-sm p-2 border rounded-[var(--radius-md)]">
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">{c.name}</a>
              <button onClick={() => removeCert(i)} className="text-[var(--color-error)] hover:opacity-90 text-xs">{t('common.remove')}</button>
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer text-[var(--color-primary)] hover:underline">
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCertUpload(f); }} />
          + Add Certification
        </label>
        {uploading && <p className="text-xs text-[var(--color-text-muted)]">{t('common.uploading')}</p>}
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={mutation.isPending} className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm">
          {mutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

type Slot = { dayOfWeek: number; startTime: string; endTime: string };

function CoachAvailabilityTab({ queryClient, showToast }: any) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['my-coach-availability'],
    queryFn: () => api.get('/coaches/availability/me').then((r) => r.data as { weekly: any[]; blackouts: any[] }),
  });

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [blackoutDate, setBlackoutDate] = useState('');
  const [blackoutReason, setBlackoutReason] = useState('');

  // Seed local editable state from the server once loaded.
  const weekly: Slot[] = slots ?? (data?.weekly || []).map((w: any) => ({
    dayOfWeek: Number(w.day_of_week),
    startTime: w.start_time,
    endTime: w.end_time,
  }));

  const saveMutation = useMutation({
    mutationFn: (payload: Slot[]) => api.put('/coaches/availability/me', { slots: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-coach-availability'] });
      setSlots(null);
      showToast('Availability saved!');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to save availability', 'error'),
  });

  const addBlackoutMutation = useMutation({
    mutationFn: (payload: { date: string; reason?: string }) => api.post('/coaches/availability/me/blackouts', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-coach-availability'] });
      setBlackoutDate('');
      setBlackoutReason('');
      showToast('Blackout date added.');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to add blackout date', 'error'),
  });

  const removeBlackoutMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/coaches/availability/me/blackouts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-coach-availability'] });
      showToast('Blackout date removed.');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to remove', 'error'),
  });

  function update(next: Slot[]) { setSlots(next); }
  function addRange(day: number) {
    update([...weekly, { dayOfWeek: day, startTime: '09:00', endTime: '17:00' }]);
  }
  function removeRange(index: number) {
    update(weekly.filter((_, i) => i !== index));
  }
  function editRange(index: number, field: 'startTime' | 'endTime', value: string) {
    update(weekly.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  if (isLoading) return <div className="text-center py-12 text-[var(--color-text-muted)]">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 space-y-4">
        <div>
          <h2 className="font-medium">Weekly Availability</h2>
          <p className="text-xs text-[var(--color-text-muted)]">Define the recurring time ranges you're available each day. Players can only book within these windows.</p>
        </div>
        <div className="space-y-3">
          {DAY_LABELS.map((label, day) => {
            const dayRanges = weekly.map((s, i) => ({ s, i })).filter(({ s }) => s.dayOfWeek === day);
            return (
              <div key={day} className="flex items-start gap-3 border-b border-[var(--color-border)] pb-3 last:border-0">
                <div className="w-24 pt-1.5 text-sm font-medium">{label}</div>
                <div className="flex-1 space-y-2">
                  {dayRanges.length === 0 && <span className="text-xs text-[var(--color-text-muted)]">Unavailable</span>}
                  {dayRanges.map(({ s, i }) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="time" value={s.startTime} onChange={(e) => editRange(i, 'startTime', e.target.value)} className="px-2 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
                      <span className="text-[var(--color-text-muted)]">–</span>
                      <input type="time" value={s.endTime} onChange={(e) => editRange(i, 'endTime', e.target.value)} className="px-2 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
                      <button onClick={() => removeRange(i)} className="text-[var(--color-error)] hover:opacity-90 text-xs">{t('common.remove')}</button>
                    </div>
                  ))}
                  <button onClick={() => addRange(day)} className="text-xs text-[var(--color-primary)] hover:underline">+ Add range</button>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={() => saveMutation.mutate(weekly)} disabled={saveMutation.isPending} className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm">
          {saveMutation.isPending ? 'Saving...' : 'Save Availability'}
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 space-y-4">
        <div>
          <h2 className="font-medium">Blackout Dates</h2>
          <p className="text-xs text-[var(--color-text-muted)]">Mark specific dates as unavailable (holidays, travel). You can't black out a date that already has scheduled sessions.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm mb-1">Date</label>
            <input type="date" value={blackoutDate} onChange={(e) => setBlackoutDate(e.target.value)} className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-sm mb-1">Reason (optional)</label>
            <input type="text" value={blackoutReason} onChange={(e) => setBlackoutReason(e.target.value)} maxLength={255} placeholder="e.g. Vacation" className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
          </div>
          <button
            onClick={() => blackoutDate && addBlackoutMutation.mutate({ date: blackoutDate, reason: blackoutReason || undefined })}
            disabled={!blackoutDate || addBlackoutMutation.isPending}
            className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm disabled:opacity-50"
          >
            {addBlackoutMutation.isPending ? 'Adding...' : 'Add'}
          </button>
        </div>
        <div className="space-y-2">
          {(data?.blackouts || []).length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No upcoming blackout dates.</p>}
          {(data?.blackouts || []).map((b: any) => (
            <div key={b.id} className="flex items-center justify-between text-sm p-3 border rounded-[var(--radius-md)]">
              <div>
                <span className="font-medium">{b.blackout_date}</span>
                {b.reason && <span className="text-[var(--color-text-muted)] ml-2">{b.reason}</span>}
              </div>
              <button onClick={() => removeBlackoutMutation.mutate(b.id)} disabled={removeBlackoutMutation.isPending} className="text-[var(--color-error)] hover:opacity-90 text-xs">{t('common.remove')}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CoachOrgsTab({ orgList, agreements, queryClient, showToast }: any) {
  const [orgId, setOrgId] = useState<number | ''>('');
  const [coachSplit, setCoachSplit] = useState('70');
  const [orgSplit, setOrgSplit] = useState('30');
  const [isActive, setIsActive] = useState(true);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/coaches/agreements', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-coach-agreements'] });
      showToast('Agreement saved!');
      setOrgId('');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to save', 'error'),
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) => api.post(`/coaches/agreements/${id}/respond`, { accept }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['my-coach-agreements'] });
      showToast(vars.accept ? 'Invite accepted!' : 'Invite declined', vars.accept ? 'success' : 'warning');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to respond', 'error'),
  });

  const pendingInvites = (agreements || []).filter((a: any) => a.status === 'pending' && a.initiated_by === 'org');

  function handleAdd(e: any) {
    e.preventDefault();
    if (!orgId) return;
    mutation.mutate({
      organisationId: Number(orgId),
      coachSplitPct: Number(coachSplit),
      orgSplitPct: Number(orgSplit),
      isActive,
    });
  }

  return (
    <div className="space-y-6">
      {pendingInvites.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 border border-[var(--color-primary)]/30">
          <h2 className="font-medium mb-3">Pending Organisation Invites</h2>
          <div className="space-y-2">
            {pendingInvites.map((ag: any) => (
              <div key={ag.id} className="flex items-center justify-between text-sm p-3 border rounded-[var(--radius-md)] gap-3">
                <div>
                  <span className="font-medium">{ag.organisation_name}</span>
                  <span className="text-[var(--color-text-muted)] ml-2">offers Coach: {ag.coach_split_pct}% • Org: {ag.org_split_pct}%</span>
                </div>
                <Can permission="coaches.invites.respond">
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => respondMutation.mutate({ id: ag.id, accept: true })} disabled={respondMutation.isPending}
                      className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs disabled:opacity-50">Accept</button>
                    <button onClick={() => respondMutation.mutate({ id: ag.id, accept: false })} disabled={respondMutation.isPending}
                      className="px-3 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs text-[var(--color-error)]">Decline</button>
                  </div>
                </Can>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 space-y-4">
        <h2 className="font-medium">Add / Edit Organization Agreement</h2>
        <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm mb-1">Organization</label>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value ? Number(e.target.value) : '')} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm">
              <option value="">Select an organization</option>
              {(orgList || []).map((o: any) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Coach Split (%)</label>
            <input type="number" min="0" max="100" value={coachSplit} onChange={(e) => setCoachSplit(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
          </div>
          <div>
            <label className="block text-sm mb-1">Org Split (%)</label>
            <input type="number" min="0" max="100" value={orgSplit} onChange={(e) => setOrgSplit(e.target.value)} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
          <div className="col-span-2">
            <button type="submit" disabled={mutation.isPending || !orgId} className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm">
              {mutation.isPending ? 'Saving...' : 'Save Agreement'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5">
        <h2 className="font-medium mb-3">Existing Agreements</h2>
        {(!agreements || agreements.length === 0) ? (
          <p className="text-sm text-[var(--color-text-muted)]">No agreements yet.</p>
        ) : (
          <div className="space-y-2">
            {agreements.map((ag: any) => (
              <div key={ag.id} className="flex items-center justify-between text-sm p-3 border rounded-[var(--radius-md)]">
                <div>
                  <span className="font-medium">{ag.organisation_name}</span>
                  <span className="text-[var(--color-text-muted)] ml-2">Coach: {ag.coach_split_pct}% • Org: {ag.org_split_pct}%</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${ag.status === 'accepted' && ag.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : ag.status === 'pending' ? 'bg-[var(--color-warning-bg,#fef3c7)] text-[var(--color-warning-text,#92400e)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                  {ag.status === 'pending' ? 'Pending' : ag.status === 'rejected' ? 'Rejected' : ag.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
