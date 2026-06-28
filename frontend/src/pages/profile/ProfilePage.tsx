import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { syncUserThemePreference } from '../../store/theme.store';
import { setLocale, useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import api, { authApi } from '../../services/api';
import { Button, Input, EntityImage } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { Can } from '../../permissions/Can';
import { Link } from 'react-router-dom';

const LEVELS = [
  { id: 1, name: 'Beginner' }, { id: 2, name: 'Intermediate' },
  { id: 3, name: 'Advanced' }, { id: 4, name: 'Professional' },
  { id: 5, name: 'Elite' },
];

const ProfileSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
  gender: z.enum(['male', 'female']),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').nullable(),
  darkMode: z.enum(['light', 'dark', 'system']),
  timezone: z.string(),
  languageId: z.number().nullable(),
  mainSportId: z.number().min(1, 'Main sport is required'),
  mainLevelId: z.number().min(1, 'Skill level is required'),
  interestedSportIds: z.array(z.number()),
  avatarUrl: z.string().nullable(),
});

type ProfileForm = z.infer<typeof ProfileSchema>;

function AvatarDisplay({ user, size = 'md' }: { user: any; size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'w-8 h-8 text-lg', md: 'w-16 h-16 text-3xl', lg: 'w-24 h-24 text-5xl' };
  return (
    <EntityImage
      src={user.avatarUrl}
      name={user.fullName || 'User'}
      className={`${sizeMap[size]} rounded-full`}
    />
  );
}

function CoachProfileSection({ profile, sportsList, availability, agreements }: any) {
  const { t } = useTranslation();
  if (!profile) {
    return (
      <div className="text-center py-8 text-[var(--color-text-muted)]">
        <p className="text-sm">{t('profile.coach.not_found')}</p>
        <Link to="/coaches/profile" className="text-sm text-[var(--color-primary)] hover:underline mt-2 inline-block">
          {t('profile.coach.setup')}
        </Link>
      </div>
    );
  }

  const parseJSON = (v: any): any[] => typeof v === 'string' ? JSON.parse(v) : (v || []);
  const sports = parseJSON(profile.sports);
  const certs = parseJSON(profile.certifications);
  const durations = parseJSON(profile.session_durations);
  const weekly = availability?.weekly || [];

  const sportNames = sports
    .map((id: number) => sportsList?.find((s: any) => s.id === id)?.name)
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
        <p className="text-xs text-[var(--color-text-muted)]">{t('org.bio')}</p>
        <p className="text-sm text-[var(--color-text)]">{profile.bio || '—'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <p className="text-xs text-[var(--color-text-muted)]">{t('org.experience')}</p>
          <p className="text-sm font-medium text-[var(--color-text)]">{profile.experience_years ? `${profile.experience_years} years` : '—'}</p>
        </div>
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <p className="text-xs text-[var(--color-text-muted)]">{t('profile.coach.hourly_rate')}</p>
          <p className="text-sm font-medium text-[var(--color-text)]">
            {profile.hourly_rate ? `${profile.hourly_rate} ${profile.currency_code || ''}` : '—'}
          </p>
        </div>
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <p className="text-xs text-[var(--color-text-muted)]">{t('org.sport')}</p>
          <p className="text-sm font-medium text-[var(--color-text)]">{sportNames.length ? sportNames.join(', ') : '—'}</p>
        </div>
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <p className="text-xs text-[var(--color-text-muted)]">{t('common.status')}</p>
          <p className="text-sm font-medium text-[var(--color-text)]">
            {profile.is_verified ? (
              <span className="text-[var(--color-success)]">{t('common.verified')}</span>
            ) : t('profile.coach.not_verified')}
            {profile.is_available !== false ? (
              <span className="ml-2 text-[var(--color-success)]">· {t('profile.coach.available')}</span>
            ) : (
              <span className="ml-2 text-[var(--color-text-muted)]">· {t('profile.coach.unavailable')}</span>
            )}
          </p>
        </div>
      </div>

      {durations.length > 0 && (
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <p className="text-xs text-[var(--color-text-muted)] mb-2">{t('profile.coach.session_durations')}</p>
          <div className="flex flex-wrap gap-2">
            {durations.map((d: number) => (
              <span key={d} className="text-xs px-2.5 py-1 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
                {d} min
              </span>
            ))}
          </div>
        </div>
      )}

      {certs.length > 0 && (
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <p className="text-xs text-[var(--color-text-muted)] mb-2">{t('org.certifications')}</p>
          <div className="space-y-1">
            {certs.map((c: any, i: number) => (
              <a
                key={i}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-[var(--color-primary)] hover:underline"
              >
                {c.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {weekly.length > 0 && (
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <p className="text-xs text-[var(--color-text-muted)] mb-2">{t('org.availability')}</p>
          <div className="space-y-1">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((label, day) => {
              const ranges = weekly.filter((w: any) => Number(w.day_of_week) === day);
              if (ranges.length === 0) return null;
              return (
                <div key={day} className="text-sm text-[var(--color-text)]">
                  <span className="font-medium">{label}:</span>{' '}
                  {ranges.map((r: any, i: number) => (
                    <span key={i}>{r.start_time}–{r.end_time}{i < ranges.length - 1 ? ', ' : ''}</span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(agreements || []).length > 0 && (
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <p className="text-xs text-[var(--color-text-muted)] mb-2">{t('profile.coach.org_agreements')}</p>
          <div className="space-y-2">
            {agreements.map((ag: any) => (
              <div key={ag.id} className="flex items-center justify-between text-sm p-2 border rounded-[var(--radius-md)]">
                <span className="font-medium">{ag.organisation_name}</span>
                <span className="text-[var(--color-text-muted)] text-xs">
                  {ag.coach_split_pct}% / {ag.org_split_pct}% · {ag.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <Link
          to="/coaches/profile"
          className="inline-block px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm hover:opacity-90"
        >
          {t('org.edit_coach_profile')}
        </Link>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [showCoachModal, setShowCoachModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'player' | 'coach' | 'settings'>('player');

  const { data: coachProfile } = useQuery({
    queryKey: ['my-coach-profile'],
    queryFn: () => api.get('/coaches/profile/me').then((r) => r.data).catch(() => null),
    enabled: !!user && user.coachStatus === 'approved',
  });

  const { data: coachAvailability } = useQuery({
    queryKey: ['my-coach-availability'],
    queryFn: () => api.get('/coaches/availability/me').then((r) => r.data).catch(() => null),
    enabled: !!user && user.coachStatus === 'approved' && activeTab === 'coach',
  });

  const { data: coachAgreements } = useQuery({
    queryKey: ['my-coach-agreements'],
    queryFn: () => api.get('/coaches/agreements').then(r => r.data?.data || []),
    enabled: !!user && user.coachStatus === 'approved' && activeTab === 'coach',
  });

  const { data: sellerStatus } = useQuery({
    queryKey: ['mp-player-status'],
    queryFn: () => api.get('/marketplace/player/status').then((r) => r.data),
    staleTime: 60000,
  });

  const activatePlayerSell = useMutation({
    mutationFn: () => api.post('/marketplace/player/activate').then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-player-status'] });
      showToast('Selling account activated!');
      refreshUser();
    },
    onError: (err) => {
      showToast('Failed to activate: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error');
    },
  });

  const { data: notifPrefs, refetch: refetchNotifPrefs } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.get('/notification-preferences').then((r) => r.data?.data ?? []).catch(() => []),
    enabled: activeTab === 'settings',
  });

  const notifPrefsMutation = useMutation({
    mutationFn: (preferences: any[]) => api.put('/notification-preferences', { preferences }).then((r) => r.data),
    onSuccess: () => {
      showToast('Notification preferences saved');
      refetchNotifPrefs();
    },
    onError: (err) => {
      showToast('Failed to save preferences: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error');
    },
  });

  const { data: sportsList } = useQuery({
    queryKey: ['sports'],
    queryFn: () => api.get('/sports').then(r => r.data || []),
    staleTime: 300000,
  });

  const { data: languages = [] } = useQuery({
    queryKey: ['public', 'languages'],
    queryFn: () => api.get('/public/languages').then((r) => r.data.data as { id: number; code: string; native_name: string; isRtl?: boolean }[]),
    staleTime: 300000,
  });

  const applyCoachMutation = useMutation({
    mutationFn: (data: any) => api.post('/coaches/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-coach-profile'] });
      showToast('Coach application submitted! Awaiting admin approval.');
      setShowCoachModal(false);
      refreshUser();
    },
    onError: (err) => {
      const status = (err as any)?.response?.status;
      if (status === 409) {
        showToast('You have already applied. Awaiting admin approval.');
        setShowCoachModal(false);
        refreshUser();
      } else {
        showToast('Failed to submit: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error');
      }
    },
  });

  const [coachBio, setCoachBio] = useState('');
  const [coachExp, setCoachExp] = useState('');
  const [coachRate, setCoachRate] = useState('');
  const [coachSports, setCoachSports] = useState<number[]>([]);
  const [coachDurations, setCoachDurations] = useState<number[]>([]);
  const [coachCerts, setCoachCerts] = useState<{ name: string; url: string }[]>([]);
  const [coachCertUploading, setCoachCertUploading] = useState(false);

  function handleCoachSubmit() {
    applyCoachMutation.mutate({
      bio: coachBio || undefined,
      experienceYears: coachExp ? Number(coachExp) : undefined,
      hourlyRate: coachRate ? Number(coachRate) : undefined,
      sports: coachSports.length ? coachSports : undefined,
      sessionDurations: coachDurations.length ? coachDurations : undefined,
      certifications: coachCerts.length ? coachCerts : undefined,
    });
  }

  function handleCoachCertUpload(file: File) {
    setCoachCertUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    api.post('/upload/coach-cert', formData)
      .then((r) => {
        const result = r.data;
        const name = file.name.replace(/\.[^/.]+$/, '');
        setCoachCerts((prev) => [...prev, { name, url: result.url }]);
      })
      .catch(() => showToast('Certification upload failed', 'error'))
      .finally(() => setCoachCertUploading(false));
  }

  function removeCoachCert(idx: number) {
    setCoachCerts((prev) => prev.filter((_, i) => i !== idx));
  }

  function openCoachModal() {
    setCoachBio('');
    setCoachExp('');
    setCoachRate('');
    setCoachSports([]);
    setCoachDurations([]);
    setCoachCerts([]);
    setShowCoachModal(true);
  }

  async function refreshUser() {
    try {
      const result = await authApi.me();
      if (result?.user) {
        setUser(result.user);
        sessionStorage.setItem('user', JSON.stringify(result.user));
      }
    } catch {}
  }

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: { interestedSportIds: [] },
  });

  const darkModeValue = watch('darkMode');
  const mainSportIdValue = watch('mainSportId');
  const interestedSportIds = watch('interestedSportIds') || [];
  useEffect(() => {
    if (editing && darkModeValue) {
      syncUserThemePreference(darkModeValue);
    }
  }, [editing, darkModeValue]);

  useEffect(() => {
    if (!mainSportIdValue) return;
    const current = getValues('interestedSportIds') || [];
    if (current.includes(mainSportIdValue)) {
      setValue(
        'interestedSportIds',
        current.filter((id) => id !== mainSportIdValue),
        { shouldDirty: true }
      );
    }
  }, [mainSportIdValue, setValue, getValues]);

  useEffect(() => {
    if (user) {
      reset({
        fullName: user.fullName,
        email: user.email,
        gender: user.gender as 'male' | 'female',
        birthDate: user.birthDate ? String(user.birthDate).split('T')[0] : null,
        darkMode: user.darkMode as 'light' | 'dark' | 'system',
        timezone: user.timezone || 'UTC',
        languageId: user.languageId ?? null,
        mainSportId: user.mainSportId ?? undefined,
        mainLevelId: user.mainLevelId ?? undefined,
        interestedSportIds: user.interestedSportIds || [],
        avatarUrl: user.avatarUrl || null,
      });
    }
  }, [user, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.patch('/auth/profile', data).then((r) => r.data),
    onSuccess: (result) => {
      setUser(result.user);
      localStorage.setItem('user', JSON.stringify(result.user));
      syncUserThemePreference(result.user?.darkMode);
      const lang = languages.find((l) => l.id === result.user?.languageId);
      if (lang?.code) {
        void setLocale(lang.code, lang.isRtl);
      }
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      showToast('Profile updated successfully!');
    },
    onError: (err) => {
      showToast('Failed to update profile: ' + (err as any).message, 'error');
    },
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      console.warn('[avatar] uploading', { name: file.name, type: file.type, size: file.size });
      const formData = new FormData();
      formData.append('file', file);
      const r = await api.post('/upload/avatar', formData);
      setValue('avatarUrl', r.data.url);
      showToast('Avatar uploaded!');
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message;
      const full = JSON.stringify(err?.response?.data || {});
      console.error('[avatar] upload failed', { status: err?.response?.status, serverMsg, full });
      showToast(serverMsg || err?.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = (data: ProfileForm) => {
    updateMutation.mutate(data);
  };

  const avatarUrl = watch('avatarUrl');
  const previewUser = (avatarUrl ? { ...user, avatarUrl } : user)!;

  if (!user) return null;

  const sportName = sportsList?.find((s: any) => s.id === user.mainSportId)?.name;
  const levelName = LEVELS.find((l) => l.id === user.mainLevelId)?.name;
  const languageLabel =
    languages.find((l) => l.id === user.languageId)?.native_name ||
    languages.find((l) => l.id === user.languageId)?.code ||
    '—';
  const interestedNames = (user.interestedSportIds || [])
    .map((id) => sportsList?.find((s: any) => s.id === id)?.name)
    .filter(Boolean);
  const otherSports = (sportsList || []).filter((s: any) => s.id !== mainSportIdValue);

  const toggleInterested = (sportId: number) => {
    const current = interestedSportIds;
    if (current.includes(sportId)) {
      setValue('interestedSportIds', current.filter((id) => id !== sportId));
    } else {
      setValue('interestedSportIds', [...current, sportId]);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <AvatarDisplay user={previewUser} />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-[var(--color-text)]">{previewUser.fullName}</h1>
            <p className="text-sm text-[var(--color-text-muted)]">{user.fullPhone} &middot; {user.email}</p>
            {user.mainSportId && (
              <span className="inline-block mt-1 text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded-full">
                {sportName}{levelName ? ` - ${levelName}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-1 mb-6 border-b border-[var(--color-border)]">
          <button
            onClick={() => setActiveTab('player')}
            className={`px-5 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'player' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
          >
            {t('profile.tabs.player')}
          </button>
          {user.coachStatus === 'approved' && (
            <button
              onClick={() => setActiveTab('coach')}
              className={`px-5 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'coach' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
            >
              {t('profile.tabs.coach')}
            </button>
          )}
          <Can permission="profile.settings.view">
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-5 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'settings' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
            >
              {t('profile.tabs.settings')}
            </button>
          </Can>
        </div>

        {activeTab === 'player' && (
          <>

        <Can permission="appearance.role-customize">
          <div className="mb-4 p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-primary)]/5">
            <p className="text-sm text-[var(--color-text)]">{t('profile.appearance.banner')}</p>
            <Link to="/settings/appearance" className="text-sm text-[var(--color-primary)] hover:underline mt-1 inline-block">
              {t('profile.appearance.open_settings')}
            </Link>
          </div>
        </Can>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <p className="text-xs text-[var(--color-text-muted)]">{t('org.gender')}</p>
            <p className="text-sm font-medium text-[var(--color-text)] capitalize">{user.gender}</p>
          </div>
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <p className="text-xs text-[var(--color-text-muted)]">{t('org.birth_date')}</p>
            <p className="text-sm font-medium text-[var(--color-text)]">{user.birthDate ? new Date(user.birthDate).toLocaleDateString('en-GB') : '—'}</p>
          </div>
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <p className="text-xs text-[var(--color-text-muted)]">{t('org.timezone')}</p>
            <p className="text-sm font-medium text-[var(--color-text)]">{user.timezone}</p>
          </div>
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <p className="text-xs text-[var(--color-text-muted)]">{t('settings.language')}</p>
            <p className="text-sm font-medium text-[var(--color-text)]">{languageLabel}</p>
          </div>
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <p className="text-xs text-[var(--color-text-muted)]">{t('settings.theme')}</p>
            <p className="text-sm font-medium text-[var(--color-text)] capitalize">{user.darkMode}</p>
          </div>
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <div className="flex items-center gap-3">
              <p className="text-xs text-[var(--color-text-muted)]">{t('org.coach')}</p>
              <Can permission="coaches.apply" fallback={<p className="text-sm font-medium text-[var(--color-text)]">{user.isCoach ? t('common.yes') : t('common.no')}</p>}>
                {user.coachStatus === 'approved' ? (
                  <span className="text-sm font-medium text-[var(--color-success)]">{t('common.approved')}</span>
                ) : user.coachStatus === 'pending' ? (
                  <span className="text-sm font-medium text-[var(--color-warning)]">{t('common.pending')}</span>
                ) : user.coachStatus === 'rejected' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-error)]">{t('common.rejected')}</span>
                    <Button onClick={openCoachModal} variant="secondary" size="sm">
                      {t('profile.coach.reapply')}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={openCoachModal} size="sm">
                    {t('profile.coach.apply')}
                  </Button>
                )}
              </Can>
            </div>
          </div>
          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <div className="flex items-center gap-3">
              <p className="text-xs text-[var(--color-text-muted)]">{t('profile.free_selling')}</p>
              <Can permission="marketplace.sell" fallback={
                <p className="text-sm font-medium text-[var(--color-text)]">{sellerStatus?.active ? t('common.active') : (user.isSeller ? t('common.pending') : '—')}</p>
              }>
                {sellerStatus?.active ? (
                  <span className="text-sm font-medium text-[var(--color-success)]">{t('common.active')}</span>
                ) : user.isSeller ? (
                  <span className="text-sm font-medium text-[var(--color-warning)]">{t('common.pending')}</span>
                ) : (
                  <Button onClick={() => activatePlayerSell.mutate()} size="sm" loading={activatePlayerSell.isPending}>
                    {t('profile.activate_free_selling')}
                  </Button>
                )}
              </Can>
            </div>
          </div>
        </div>

        {!editing && interestedNames.length > 0 && (
          <div className="mb-6 p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t('org.interested')}</h3>
            <div className="flex flex-wrap gap-2">
              {interestedNames.map((name) => (
                <span key={name} className="text-xs px-2.5 py-1 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {!editing ? (
          <Button onClick={() => setEditing(true)}>{t('org.edit_profile')}</Button>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 border-t border-[var(--color-border)] pt-4">
            <h3 className="font-semibold text-[var(--color-text)]">{t('org.edit_profile')}</h3>

            <Can permission="profile.edit.first-name">
              <Input label={t('landing.player_reg.full_name')} {...register('fullName')} error={errors.fullName?.message} />
            </Can>
            <Can permission="profile.edit.email">
              <Input label={t('common.email')} type="email" {...register('email')} error={errors.email?.message} />
            </Can>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">{t('org.avatar')}</label>
                <div className="flex gap-2 items-start">
                  <div className="flex-shrink-0 pt-1">
                    <AvatarDisplay user={previewUser} size="sm" />
                  </div>
                  <div className="flex-1 flex gap-2">
                    <Can permission="profile.edit.avatar">
                      <Input
                        placeholder={t('profile.avatar.placeholder')}
                        {...register('avatarUrl')}
                        onChange={(e) => setValue('avatarUrl', e.target.value || null)}
                      />
                    </Can>
                    <Can permission="profile.edit.avatar">
                      <input
                        ref={fileInputRef}
                        type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(file);
                          e.target.value = '';
                        }}
                      />
                    </Can>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="whitespace-nowrap"
                    >
                      {uploading ? t('common.uploading') : t('common.upload')}
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">{t('org.gender')}</label>
                <select
                  {...register('gender')}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]"
                >
                  <option value="male">{t('common.male')}</option>
                  <option value="female">{t('common.female')}</option>
                </select>
              </div>

              <Can permission="profile.edit.birth-date">
                <div>
                  <label className="block text-sm text-[var(--color-text-muted)] mb-1">{t('org.birth_date')}</label>
                  <input type="date"
                    {...register('birthDate')}
                    className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                  />
                  {errors.birthDate && <p className="text-xs text-[var(--color-error)] mt-1">{errors.birthDate.message}</p>}
                </div>
              </Can>

              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">{t('player.main_sport')} *</label>
                <select
                  {...register('mainSportId', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]"
                >
                  <option value="">{t('profile.select_main_sport')}</option>
                  {(sportsList || []).map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
                {errors.mainSportId && <p className="text-xs text-[var(--color-error)] mt-1">{errors.mainSportId.message}</p>}
              </div>

              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">{t('player.level')} *</label>
                <select
                  {...register('mainLevelId', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]"
                >
                  <option value="">{t('profile.select_skill_level')}</option>
                  {LEVELS.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                </select>
                {errors.mainLevelId && <p className="text-xs text-[var(--color-error)] mt-1">{errors.mainLevelId.message}</p>}
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <h4 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t('org.interested')}</h4>
              <p className="text-xs text-[var(--color-text-muted)] mb-3">
                {t('profile.interested_desc')}
              </p>
              {otherSports.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">{t('profile.choose_main_sport_first')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {otherSports.map((sport: any) => (
                    <label
                      key={sport.id}
                      className="flex items-center gap-2 text-sm text-[var(--color-text)] cursor-pointer py-1"
                    >
                      <input
                        type="checkbox"
                        className="cz-checkbox"
                        checked={interestedSportIds.includes(sport.id)}
                        onChange={() => toggleInterested(sport.id)}
                      />
                      <span>{sport.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="submit" loading={updateMutation.isPending}>{t('common.save')}</Button>
              <Button type="button" variant="secondary" onClick={() => { setEditing(false); reset(); }}>
                {t('common.cancel')}
              </Button>
            </div>

            {updateMutation.isError && (
              <p className="text-sm text-[var(--color-error)]">{t('profile.update_failed')}</p>
            )}
          </form>
        )}
          </>
        )}

        {activeTab === 'coach' && user.coachStatus === 'approved' && (
          <CoachProfileSection
            profile={coachProfile}
            sportsList={sportsList}
            availability={coachAvailability}
            agreements={coachAgreements}
          />
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <Can permission="profile.settings.language">
              <div className="p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]">
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('settings.language')}</label>
                <select
                  value={user.languageId ?? ''}
                  onChange={(e) => {
                    const languageId = e.target.value ? Number(e.target.value) : null;
                    const lang = languages.find((l) => l.id === languageId);
                    if (lang?.code) void setLocale(lang.code, lang.isRtl);
                    updateMutation.mutate({ languageId });
                  }}
                  className="w-full max-w-xs px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <option value="">{t('common.default')}</option>
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id}>{lang.native_name || lang.code}</option>
                  ))}
                </select>
              </div>
            </Can>

            <Can permission="profile.settings.theme">
              <div className="p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]">
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('settings.theme')}</label>
                <select
                  value={user.darkMode}
                  onChange={(e) => {
                    const mode = e.target.value as 'light' | 'dark' | 'system';
                    syncUserThemePreference(mode);
                    updateMutation.mutate({ darkMode: mode });
                  }}
                  className="w-full max-w-xs px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <option value="light">{t('settings.light')}</option>
                  <option value="dark">{t('settings.dark')}</option>
                  <option value="system">{t('settings.system')}</option>
                </select>
              </div>
            </Can>

            <Can permission="profile.settings.visibility">
              <div className="p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-[var(--color-text)]">{t('profile.visibility')}</label>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{t('profile.visibility_desc')}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={!!(user as any).isPublic}
                      onChange={() => updateMutation.mutate({ isPublic: !(user as any).isPublic })}
                    />
                    <div className="w-9 h-5 bg-[var(--color-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-[var(--color-border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]" />
                  </label>
                </div>
              </div>
            </Can>

            <Can permission="profile.settings.notifications">
              <div className="p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]">
                <h3 className="text-sm font-medium text-[var(--color-text)] mb-1">{t('settings.notifications')}</h3>
                <p className="text-xs text-[var(--color-text-muted)] mb-4">{t('profile.notifications_desc')}</p>
                {!notifPrefs ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 bg-[var(--color-surface)] rounded-[var(--radius-md)] animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {notifPrefs.map((pref: any) => (
                      <label
                        key={pref.categoryId}
                        className="flex items-center justify-between py-2.5 px-3 rounded-[var(--radius-md)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
                      >
                        <span className="text-sm text-[var(--color-text)] capitalize">
                          {pref.slug.replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={pref.isAllowed}
                              onChange={() => {
                                const updated = notifPrefs.map((p: any) =>
                                  p.categoryId === pref.categoryId ? { ...p, isAllowed: !p.isAllowed } : p
                                );
                                notifPrefsMutation.mutate(updated);
                              }}
                            />
                            <div className="w-9 h-5 bg-[var(--color-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-[var(--color-border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]" />
                          </label>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </Can>
          </div>
        )}
      </div>

      <Modal open={showCoachModal} onClose={() => setShowCoachModal(false)} title={t('profile.coach.modal_title')} size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">{t('org.bio')}</label>
            <textarea
              value={coachBio}
              onChange={(e) => setCoachBio(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
              placeholder={t('profile.coach.bio_placeholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">{t('profile.coach.experience_years')}</label>
              <input
                type="number"
                value={coachExp}
                onChange={(e) => setCoachExp(e.target.value)}
                min="0"
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                placeholder={t('profile.coach.exp_placeholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">{t('profile.coach.hourly_rate_label')}</label>
              <input
                type="number"
                value={coachRate}
                onChange={(e) => setCoachRate(e.target.value)}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                placeholder={t('profile.coach.rate_placeholder')}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">{t('org.sport')}</label>
            <select
              value={coachSports[0] || ''}
              onChange={(e) => setCoachSports(e.target.value ? [Number(e.target.value)] : [])}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
            >
              <option value="">{t('profile.coach.select_sport')}</option>
              {(sportsList || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('profile.coach.session_durations')}</label>
            <div className="flex flex-wrap gap-2">
              {[30, 45, 60, 90].map((d) => (
                <label
                  key={d}
                  className={`flex items-center gap-2 text-sm cursor-pointer border rounded-[var(--radius-md)] px-3 py-2 transition-colors ${coachDurations.includes(d) ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'}`}
                >
                  <input
                    type="checkbox"
                    checked={coachDurations.includes(d)}
                    onChange={() => setCoachDurations((prev) => prev.includes(d) ? prev.filter((v) => v !== d) : [...prev, d])}
                    className="w-4 h-4"
                  />
                  <span>{d} min</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('org.certifications')}</label>
            <div className="space-y-2">
              {coachCerts.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 border rounded-[var(--radius-md)]">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline truncate">{c.name}</a>
                  <button onClick={() => removeCoachCert(i)} className="text-[var(--color-error)] hover:opacity-90 text-xs ml-2 shrink-0">{t('common.remove')}</button>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer text-[var(--color-primary)] hover:underline mt-2">
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoachCertUpload(f); e.target.value = ''; }}
              />
              {t('profile.coach.add_cert')}
            </label>
            {coachCertUploading && <p className="text-xs text-[var(--color-text-muted)] mt-1">{t('common.uploading')}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleCoachSubmit} loading={applyCoachMutation.isPending}>{t('profile.coach.submit_application')}</Button>
            <Button variant="secondary" onClick={() => setShowCoachModal(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
