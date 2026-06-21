import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { authApi } from '../../services/api';
import PhoneNumberInput from '../../components/form/PhoneNumberInput';
import { isValidLocalPhone } from '../../utils/phone';
import { useDetectedCountry } from '../../hooks/useDetectedCountry';
import { scrollToTop } from '../../utils/scroll';
import { getErrorMessage } from '../../utils/errors';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { ReactivationModal } from '../../components/ui/ReactivationModal';

interface Country { id: number; name: string; phone_code: string; iso_code: string; flag_emoji?: string; default_currency?: string; }
interface Sport { id: number; name: string; }

const STEP_KEYS = ['landing.player_reg.step1', 'landing.player_reg.step2', 'landing.player_reg.step3'];

const LEVELS = [
  { id: 1, label: 'Beginner' },
  { id: 2, label: 'Intermediate' },
  { id: 3, label: 'Advanced' },
  { id: 4, label: 'Professional' },
];

export default function PlayerRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [countries, setCountries] = useState<Country[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showReactivationModal, setShowReactivationModal] = useState(false);
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [form, setForm] = useState({
    countryId: 0, phoneNumber: '', fullName: '', email: '',
    password: '', confirmPassword: '', gender: '', birthDate: '',
    mainSportId: 0, mainLevelId: 0, interestedSportIds: [] as number[],
  });

  const update = (k: string, v: any) => { setForm(f => ({ ...f, [k]: v })); clearFieldError(k); };

  const skipStepScroll = useRef(true);
  useEffect(() => {
    if (skipStepScroll.current) {
      skipStepScroll.current = false;
      return;
    }
    scrollToTop();
  }, [step]);

  useEffect(() => {
    api.get('/public/countries').then(r => setCountries(r.data?.data || r.data || [])).catch(() => {});
    api.get('/sports').then(r => setSports(r.data || [])).catch(() => {});
  }, []);

  useDetectedCountry(countries, (id) => update('countryId', id), { currentCountryId: form.countryId });

  const validateStep = (s: number): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (!form.countryId) errs.countryId = 'Please select a country';
      if (!isValidLocalPhone(form.phoneNumber)) errs.phoneNumber = 'Please enter a valid 11-digit phone number';
      if (!form.fullName.trim()) errs.fullName = 'Please enter your full name';
      if (!form.email.includes('@')) errs.email = 'Please enter a valid email';
      if (form.password.length < 6) errs.password = 'Password must be at least 6 characters';
      if (!form.confirmPassword || form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
      if (!form.gender) errs.gender = 'Please select your gender';
      if (!form.birthDate) errs.birthDate = 'Please select your birth date';
    } else if (s === 1) {
      if (!form.mainSportId) errs.mainSportId = 'Please select your main sport';
      if (!form.mainLevelId) errs.mainLevelId = 'Please select your skill level';
    }
    return errs;
  };

  const clearFieldError = (k: string) => {
    if (fieldErrors[k]) setFieldErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  };

  const goNext = async () => {
    const errs = validateStep(step);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (step === 0) {
      try {
        const result = await authApi.checkUniqueness({
          phoneNumber: form.phoneNumber,
          countryId: form.countryId,
          email: form.email,
        });
        if (!result.phoneAvailable || !result.emailAvailable) {
          const isActive = result.phoneStatus === 'active' || result.emailStatus === 'active';
          if (isActive) {
            showToast('This player already has an account', 'error');
            navigate('/login');
            return;
          } else {
            setShowReactivationModal(true);
            return;
          }
        }
      } catch {
        showToast('Unable to verify account. Please try again.', 'error');
        return;
      }
    }

    setStep(s => s + 1);
  };

  const toggleInterestedSport = (id: number) => {
    setForm(f => ({
      ...f,
      interestedSportIds: f.interestedSportIds.includes(id)
        ? f.interestedSportIds.filter(s => s !== id)
        : [...f.interestedSportIds, id],
    }));
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/register-player', {
        countryId: form.countryId,
        phoneNumber: form.phoneNumber,
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        gender: form.gender,
        birthDate: form.birthDate || undefined,
        mainSportId: form.mainSportId,
        mainLevelId: form.mainLevelId,
        interestedSportIds: form.interestedSportIds,
      });
      setSuccess(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-10 text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">{t('landing.player_reg.success_title')}</h2>
          <p className="text-[var(--color-text-muted)]">{t('landing.player_reg.success_desc')}</p>
          <button onClick={() => navigate('/login')} className="mt-6 px-6 py-3 bg-[var(--gradient-primary)] text-white font-semibold rounded-xl">{t('landing.player_reg.go_login')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl min-w-0">
        <Link to="/register" className="inline-flex items-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-8">
          {t('landing.back_options')}
        </Link>

        <div className="flex items-center gap-2 mb-8">
          {STEP_KEYS.map((key, i) => (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i < step ? 'bg-[var(--color-primary)] text-white' :
                i === step ? 'bg-[var(--color-primary)] text-white ring-4 ring-[var(--color-primary)]/20' :
                'bg-[var(--color-border)] text-[var(--color-text-muted)]'
              }`}>{i < step ? '\u2713' : i + 1}</div>
              <span className={`text-xs hidden sm:inline font-medium ${i <= step ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>{t(key)}</span>
              {i < STEP_KEYS.length - 1 && <div className={`w-6 sm:w-10 h-0.5 ${i < step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 shadow-[var(--shadow-md)] animate-fade-in">
          {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-[var(--color-error-text)] dark:text-red-400">{error}</div>}

          {/* Step 0: Personal Info */}
          {step === 0 && (
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('landing.player_reg.step1_title')}</h2>
              <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('landing.player_reg.step1_desc')}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.country')} *</label>
                  <select value={form.countryId} onChange={e => update('countryId', Number(e.target.value))} className={`w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ${fieldErrors.countryId ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`}>
                    <option value={0}>{t('common.select_country')}</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone_code})</option>)}
                  </select>
                  {fieldErrors.countryId && <p className="text-xs text-[var(--color-error)] mt-1">{fieldErrors.countryId}</p>}
                </div>
                <PhoneNumberInput
                  label={t('common.phone')}
                  value={form.phoneNumber}
                  onChange={(v) => update('phoneNumber', v)}
                  required
                  error={fieldErrors.phoneNumber}
                />
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('landing.player_reg.full_name')} *</label>
                  <input type="text" value={form.fullName} onChange={e => update('fullName', e.target.value)} placeholder={t('landing.player_reg.full_name_placeholder')} className={`w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ${fieldErrors.fullName ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`} />
                  {fieldErrors.fullName && <p className="text-xs text-[var(--color-error)] mt-1">{fieldErrors.fullName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('common.email')} *</label>
                  <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="you@example.com" className={`w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ${fieldErrors.email ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`} />
                  {fieldErrors.email && <p className="text-xs text-[var(--color-error)] mt-1">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.password')} *</label>
                  <input type="password" value={form.password} onChange={e => update('password', e.target.value)} placeholder={t('landing.player_reg.password_placeholder')} className={`w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ${fieldErrors.password ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`} />
                  {fieldErrors.password && <p className="text-xs text-[var(--color-error)] mt-1">{fieldErrors.password}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.confirm_password')} *</label>
                  <input type="password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)} placeholder={t('landing.player_reg.confirm_password_placeholder')} className={`w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ${fieldErrors.confirmPassword ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`} />
                  {fieldErrors.confirmPassword && <p className="text-xs text-[var(--color-error)] mt-1">{fieldErrors.confirmPassword}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.gender')} *</label>
                  <select value={form.gender} onChange={e => update('gender', e.target.value)} className={`w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ${fieldErrors.gender ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`}>
                    <option value="">{t('landing.player_reg.select_option')}</option>
                    <option value="male">{t('common.male')}</option>
                    <option value="female">{t('common.female')}</option>
                  </select>
                  {fieldErrors.gender && <p className="text-xs text-[var(--color-error)] mt-1">{fieldErrors.gender}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.birth_date')} *</label>
                  <input type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} className={`w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ${fieldErrors.birthDate ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`} />
                  {fieldErrors.birthDate && <p className="text-xs text-[var(--color-error)] mt-1">{fieldErrors.birthDate}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Sports Setup */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('landing.player_reg.step2_title')}</h2>
              <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('landing.player_reg.step2_desc')}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('player.main_sport')} *</label>
                  <select value={form.mainSportId} onChange={e => update('mainSportId', Number(e.target.value))} className={`w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ${fieldErrors.mainSportId ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`}>
                    <option value={0}>{t('landing.player_reg.select_main_sport')}</option>
                    {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {fieldErrors.mainSportId && <p className="text-xs text-[var(--color-error)] mt-1">{fieldErrors.mainSportId}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('player.level')} *</label>
                  <select value={form.mainLevelId} onChange={e => update('mainLevelId', Number(e.target.value))} className={`w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ${fieldErrors.mainLevelId ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`}>
                    <option value={0}>{t('landing.player_reg.select_skill_level')}</option>
                    {LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                  {fieldErrors.mainLevelId && <p className="text-xs text-[var(--color-error)] mt-1">{fieldErrors.mainLevelId}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('landing.player_reg.interested_sports')}</label>
                  <p className="text-xs text-[var(--color-text-muted)] mb-2">{t('landing.player_reg.interested_sports_desc')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                    {sports.map(s => {
                      const checked = form.interestedSportIds.includes(s.id);
                      return (
                        <label key={s.id} className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${checked ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)]/30' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/30'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleInterestedSport(s.id)} className="accent-[var(--color-primary)]" />
                          <span className="text-sm text-[var(--color-text)]">{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Review & Submit */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('landing.player_reg.review_title')}</h2>
              <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('landing.player_reg.review_desc')}</p>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('auth.register.country')}</span><span className="font-medium text-[var(--color-text)]">{countries.find(c => c.id === form.countryId)?.name || '\u2014'}</span></div>
                <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('common.phone')}</span><span className="font-medium text-[var(--color-text)]">{form.phoneNumber}</span></div>
                <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('landing.player_reg.full_name')}</span><span className="font-medium text-[var(--color-text)]">{form.fullName}</span></div>
                <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('common.email')}</span><span className="font-medium text-[var(--color-text)]">{form.email}</span></div>
                <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('auth.register.gender')}</span><span className="font-medium text-[var(--color-text)] capitalize">{form.gender}</span></div>
                <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('auth.register.birth_date')}</span><span className="font-medium text-[var(--color-text)]">{form.birthDate}</span></div>
                <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('player.main_sport')}</span><span className="font-medium text-[var(--color-text)]">{sports.find(s => s.id === form.mainSportId)?.name || '\u2014'}</span></div>
                <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('player.level')}</span><span className="font-medium text-[var(--color-text)]">{LEVELS.find(l => l.id === form.mainLevelId)?.label || '\u2014'}</span></div>
                {form.interestedSportIds.length > 0 && (
                  <div className="flex justify-between py-2 border-b border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)]">{t('landing.player_reg.interested_sports')}</span>
                    <span className="font-medium text-[var(--color-text)] text-right">{form.interestedSportIds.map(id => sports.find(s => s.id === id)?.name).filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--color-border)]">
            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
              className="px-5 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-bg)] disabled:opacity-30 transition-all text-[var(--color-text)]">
              {t('common.back')}
            </button>
            {step < 2 ? (
              <button onClick={goNext}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl hover:opacity-90 transition-all">
                {t('common.next')}
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all">
                {submitting ? t('landing.player_reg.submitting') : t('landing.player_reg.submit')}
              </button>
            )}
          </div>
        </div>

        <p className="text-center mt-4 text-sm text-[var(--color-text-muted)]">
          {t('landing.register.already_account')} <Link to="/login" className="text-[var(--color-primary)] font-medium hover:underline">{t('landing.register.sign_in')}</Link>
        </p>
      </div>

      <ReactivationModal
        open={showReactivationModal}
        onClose={() => setShowReactivationModal(false)}
        phoneNumber={form.phoneNumber}
        email={form.email}
        countryId={form.countryId}
      />
    </div>
  );
}
