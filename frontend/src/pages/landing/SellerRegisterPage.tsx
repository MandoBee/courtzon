import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { getDefaultCurrency } from '../../utils/currency';
import PlanPickerSection, { type PlanPickerPlan } from '../../components/subscription/PlanPickerSection';
import type { BillingPeriod } from '../../utils/subscription-pricing';
import { resolveDisplayPrice } from '../../utils/subscription-pricing';
import { useCurrencyStore } from '../../store/currency.store';
import PhoneNumberInput from '../../components/form/PhoneNumberInput';
import { isValidLocalPhone } from '../../utils/phone';
import { useDetectedCountry } from '../../hooks/useDetectedCountry';
import { scrollToTop } from '../../utils/scroll';
import { buildAuthRegisterPayload, filterRegistrationPaymentMethods } from '../../utils/registration';
import { getErrorMessage } from '../../utils/errors';
import { useTranslation } from '../../i18n';

interface Country { id: number; name: string; phone_code: string; iso_code: string; flag_emoji?: string; default_currency?: string; currency_symbol?: string | null; }
interface PaymentMethod { id: number; slug: string; name: string; icon: string; description: string; requiresApproval: boolean; }

const STEP_KEYS = ['landing.seller_reg.step1', 'landing.seller_reg.step2', 'landing.seller_reg.step3', 'landing.seller_reg.step4', 'landing.seller_reg.step5'];

export default function SellerRegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPlanId = Number(searchParams.get('planId')) || 0;
  const initialBilling = (searchParams.get('billing') as BillingPeriod) || 'monthly';
  const [step, setStep] = useState(initialPlanId > 0 ? 1 : 0);
  const [plans, setPlans] = useState<PlanPickerPlan[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(initialBilling);
  const [countries, setCountries] = useState<Country[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const applyDetected = useCurrencyStore((s) => s.applyDetected);
  const displayCurrency = useCurrencyStore((s) => s.currencyCode) || getDefaultCurrency();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation();

  const [form, setForm] = useState({
    planId: initialPlanId,
    countryId: 0, phoneNumber: '', fullName: '', email: '',
    password: '', confirmPassword: '', gender: '', birthDate: '',
    shopName: '', paymentMethod: '',
  });

  const update = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  useDetectedCountry(countries, (id) => update('countryId', id), { currentCountryId: form.countryId });

  const skipStepScroll = useRef(true);
  useEffect(() => {
    if (skipStepScroll.current) {
      skipStepScroll.current = false;
      return;
    }
    scrollToTop();
  }, [step]);

  useEffect(() => {
    api.get('/public/subscription-plans').then(r => {
      const d = (r.data?.data || r.data || []).slice().sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setPlans(d);
    }).catch(() => {});
    api.get('/public/countries').then(r => setCountries(r.data?.data || r.data || [])).catch(() => {});
    api.get('/public/payment-methods').then(r => {
      const methods = r.data?.data || [];
      setPaymentMethods(filterRegistrationPaymentMethods(methods));
    }).catch(() => {});
  }, []);

  const sellerPlans = (() => {
    if (!plans.length) return plans;
    const filtered = plans.filter(p => {
      if (!p.applicableOrgTypes?.length) return true;
      return p.applicableOrgTypes.includes(10);
    });
    return filtered.length ? filtered : plans;
  })();

  const canNext = () => {
    switch (step) {
      case 0: return form.planId > 0;
      case 1: return form.countryId > 0 && isValidLocalPhone(form.phoneNumber) && form.fullName.trim() && form.email.includes('@');
      case 2: return form.password.length >= 6 && form.password === form.confirmPassword && form.gender && form.birthDate;
      case 3: return form.shopName.trim() && form.paymentMethod;
      default: return true;
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        ...buildAuthRegisterPayload(form),
        shopName: form.shopName.trim(),
        paymentMethod: form.paymentMethod,
        planId: form.planId || undefined,
        billingCycle: billingPeriod,
      };
      await api.post('/auth/register-seller', payload);
      setStep(5);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl min-w-0">
        <Link to="/register" className="inline-flex items-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-8">
          {t('landing.back_options')}
        </Link>

        {step === 5 ? (
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-10 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-warning-bg)] dark:bg-yellow-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">{t('landing.seller_reg.pending_title')}</h2>
            <p className="text-[var(--color-text-muted)] max-w-md mx-auto">{t('landing.seller_reg.pending_desc')}</p>
            <button onClick={() => navigate('/login')} className="mt-6 px-6 py-3 bg-[var(--gradient-primary)] text-white font-semibold rounded-xl">{t('landing.player_reg.go_login')}</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-8">
              {STEP_KEYS.map((key, i) => (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    i < step ? 'bg-[var(--color-primary)] text-white' :
                    i === step ? 'bg-[var(--color-primary)] text-white ring-4 ring-[var(--color-primary)]/20' :
                    'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                  }`}>{i < step ? '✓' : i + 1}</div>
                  <span className={`text-xs hidden sm:inline font-medium ${i <= step ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>{t(key)}</span>
                  {i < STEP_KEYS.length - 1 && <div className={`w-6 sm:w-10 h-0.5 ${i < step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`} />}
                </div>
              ))}
            </div>

            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 shadow-[var(--shadow-md)] animate-fade-in">
              {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-[var(--color-error-text)] dark:text-red-400">{error}</div>}

              {/* Step 0: Pick a Plan */}
              {step === 0 && (
                <div>
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('landing.seller_reg.step0_title')}</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('landing.seller_reg.step0_desc')}</p>
                  <PlanPickerSection
                    plans={sellerPlans}
                    selectedPlanId={form.planId}
                    onSelectPlan={(id) => update('planId', id)}
                    billingPeriod={billingPeriod}
                    onBillingPeriodChange={setBillingPeriod}
                    displayCurrency={displayCurrency}
                    publicMode
                  />
                </div>
              )}

              {/* Step 1: Personal Info */}
              {step === 1 && (
                <div>
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('landing.player_reg.step1_title')}</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('landing.player_reg.step1_desc')}</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.country')} *</label>
                      <select value={form.countryId} onChange={e => {
                        const id = Number(e.target.value);
                        update('countryId', id);
                        const c = countries.find((x) => x.id === id);
                        if (c?.default_currency) {
                          applyDetected({
                            countryCode: c.iso_code ?? null,
                            currencyCode: c.default_currency,
                            currencySymbol: c.currency_symbol ?? null,
                          });
                        }
                      }} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none">
                        <option value={0}>{t('common.select_country')}</option>
                        {countries.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone_code})</option>)}
                      </select>
                    </div>
                    <PhoneNumberInput
                      label={t('common.phone')}
                      value={form.phoneNumber}
                      onChange={(v) => update('phoneNumber', v)}
                      required
                    />
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('landing.player_reg.full_name')} *</label>
                      <input type="text" value={form.fullName} onChange={e => update('fullName', e.target.value)} placeholder={t('landing.player_reg.full_name_placeholder')} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('common.email')} *</label>
                      <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Account Setup */}
              {step === 2 && (
                <div>
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('landing.seller_reg.step2_title')}</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('landing.seller_reg.step2_desc')}</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.password')} *</label>
                      <input type="password" value={form.password} onChange={e => update('password', e.target.value)} placeholder={t('landing.player_reg.password_placeholder')} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.confirm_password')} *</label>
                      <input type="password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)} placeholder={t('landing.player_reg.confirm_password_placeholder')} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                      {form.confirmPassword && form.password !== form.confirmPassword && <p className="text-xs text-red-500 mt-1">{t('auth.register.password_mismatch')}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.gender')} *</label>
                      <select value={form.gender} onChange={e => update('gender', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none">
                        <option value="">{t('landing.player_reg.select_option')}</option>
                        <option value="male">{t('common.male')}</option>
                        <option value="female">{t('common.female')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('auth.register.birth_date')} *</label>
                      <input type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Shop Details */}
              {step === 3 && (
                <div>
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('landing.seller_reg.step3_title')}</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('landing.seller_reg.step3_desc')}</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('landing.seller_reg.shop_name')} *</label>
                      <input type="text" value={form.shopName} onChange={e => update('shopName', e.target.value)} placeholder={t('landing.seller_reg.shop_name_placeholder')} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{t('landing.seller_reg.payment_method')} *</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {paymentMethods.map(m => (
                          <button key={m.id} type="button" onClick={() => update('paymentMethod', m.slug)}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${form.paymentMethod === m.slug ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)]/30' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/30'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{m.icon === 'wallet' ? '💰' : m.icon === 'cash' ? '💵' : m.icon === 'card' ? '💳' : m.icon === 'bank_transfer' ? '🏦' : '💳'}</span>
                              <span className="font-semibold text-[var(--color-text)]">{m.name}</span>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)]">{m.description}</p>
                            {m.requiresApproval ? (
                              <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-bold text-[var(--color-warning-text)] bg-[var(--color-warning-bg)] dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">Requires Approval</span>
                            ) : (
                              <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-bold text-[var(--color-success-text)] bg-[var(--color-success-bg)] text-[var(--color-success-text)] rounded-full">Instant</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {step === 4 && (
                <div>
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('landing.player_reg.review_title')}</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('landing.player_reg.review_desc')}</p>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('landing.seller_reg.plan')}</span><span className="font-medium text-[var(--color-text)]">{(() => { const p = plans.find(x => x.id === form.planId); if (!p) return '—'; const pr = resolveDisplayPrice(p, billingPeriod); return `${p.planName} (${billingPeriod === 'yearly' ? 'Annual' : 'Monthly'}${pr > 0 ? ` — ${pr} ${displayCurrency}` : ''})`; })()}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('auth.register.country')}</span><span className="font-medium text-[var(--color-text)]">{countries.find(c => c.id === form.countryId)?.name || '—'}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('common.phone')}</span><span className="font-medium text-[var(--color-text)]">{form.phoneNumber}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('landing.player_reg.full_name')}</span><span className="font-medium text-[var(--color-text)]">{form.fullName}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('common.email')}</span><span className="font-medium text-[var(--color-text)]">{form.email}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('auth.register.gender')}</span><span className="font-medium text-[var(--color-text)] capitalize">{form.gender}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('auth.register.birth_date')}</span><span className="font-medium text-[var(--color-text)]">{form.birthDate}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('landing.seller_reg.shop_name')}</span><span className="font-medium text-[var(--color-text)]">{form.shopName}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{t('landing.seller_reg.payment_method')}</span><span className="font-medium text-[var(--color-text)] capitalize">{form.paymentMethod}</span></div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--color-border)]">
                <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                  className="px-5 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-bg)] disabled:opacity-30 transition-all text-[var(--color-text)]">
                  {t('common.back')}
                </button>
                {step < 4 ? (
                  <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all">
                    {t('common.next')}
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={submitting}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all">
                    {submitting ? t('landing.player_reg.submitting') : t('landing.seller_reg.submit')}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
