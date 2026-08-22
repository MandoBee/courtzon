import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { getDefaultCurrency } from '../../utils/currency';
import PlanPickerSection, { type PlanPickerPlan } from '../../components/subscription/PlanPickerSection';
import type { BillingPeriod } from '../../utils/subscription-pricing';
import { resolveDisplayPrice } from '../../utils/subscription-pricing';
import { useCurrencyStore } from '../../store/currency.store';
import PhoneNumberInput from '../../components/form/PhoneNumberInput';
import { isValidLocalPhone } from '../../utils/phone';
import { useDetectedCountry } from '../../hooks/useDetectedCountry';
import {
  filterOrgRegistrationPlans,
  filterOrgRegistrationTypes,
} from '../../utils/org-registration-filters';
import { scrollToTop } from '../../utils/scroll';
import { buildAuthRegisterPayload, filterOrganizationRegistrationPaymentMethods, DEFAULT_ORGANIZATION_PAYMENT_METHOD } from '../../utils/registration';
import { getErrorMessage } from '../../utils/errors';
import { PasswordInput } from '../../components/ui/PasswordInput';
import LegalConsent from '../../components/legal/LegalConsent';
import { Modal } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import PaymobPixelCard from '../../components/payment/PaymobPixelCard';
import PaymentStatusPoller from '../../components/payment/PaymentStatusPoller';
import { usePaymentConfirm } from '../../hooks/usePaymentConfirm';
import { useAuthStore } from '../../store/auth.store';
import { resolveUserHome } from '../../store/workspace.store';

interface Country { id: number; name: string; phone_code: string; iso_code: string; flag_emoji?: string; default_currency?: string; currency_symbol?: string | null; }
interface OrgType { id: number; slug: string; name: string; description?: string; }
interface PaymentMethod { id: number; slug: string; name: string; icon: string; description: string; requiresApproval: boolean; }
interface PaymentInfo { paymentId: number; clientSecret: string; }

const STEPS = ['Pick a Plan', 'Personal Info', 'Account Setup', 'Organization Details', 'Review & Submit'];

export default function OrganizationRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<PlanPickerPlan[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [countries, setCountries] = useState<Country[]>([]);
  const [orgTypes, setOrgTypes] = useState<OrgType[]>([]);
  const [allOrgTypes, setAllOrgTypes] = useState<OrgType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const applyDetected = useCurrencyStore((s) => s.applyDetected);
  const displayCurrency = useCurrencyStore((s) => s.currencyCode) || getDefaultCurrency();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const { showToast } = useToast();
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const { state: confirmState, confirm: confirmPayment, reset: resetConfirm } = usePaymentConfirm();

  const [approvedResult, setApprovedResult] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [pollingPaid, setPollingPaid] = useState(false);
  const paymentIdRef = useRef<number>(0);

  const [form, setForm] = useState({
    planId: 0,
    countryId: 0, phoneNumber: '', fullName: '', email: '',
    password: '', confirmPassword: '', gender: '', birthDate: '',
    orgName: '', orgWebsite: '', orgTypeId: 0, orgEmail: '',
    documents: [] as string[],
    paymentMethod: '',
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
    api.get('/public/payment-methods', { params: { context: 'organization-registration' } }).then(r => {
      const methods = filterOrganizationRegistrationPaymentMethods<PaymentMethod>(r.data?.data || []);
      setPaymentMethods(methods);
      // Credit/Debit Card is the default organization payment method — preselect
      // it unless the user already chose one (server filters the allowed set).
      if (methods.some(m => m.slug === DEFAULT_ORGANIZATION_PAYMENT_METHOD)) {
        setForm(f => (f.paymentMethod ? f : { ...f, paymentMethod: DEFAULT_ORGANIZATION_PAYMENT_METHOD }));
      }
    }).catch(() => {});
    api.get('/public/organisation-types').then(r => {
      const types = r.data?.data || r.data || [];
      setAllOrgTypes(types);
      setOrgTypes(filterOrgRegistrationTypes(types));
    }).catch(() => {});
  }, []);

  const orgPlans = filterOrgRegistrationPlans(plans, allOrgTypes);

  const selectedPlan = plans.find(p => p.id === form.planId);
  const isFreePlan = !!selectedPlan && resolveDisplayPrice(selectedPlan, billingPeriod) <= 0;

  const canNext = () => {
    switch (step) {
      case 0: return form.planId > 0;
      case 1: return form.countryId > 0 && isValidLocalPhone(form.phoneNumber) && form.fullName.trim() && form.email.includes('@');
      case 2: return form.password.length >= 6 && form.password === form.confirmPassword && form.gender && form.birthDate;
      case 3: return form.orgName.trim() && form.orgTypeId > 0 && (isFreePlan || !!form.paymentMethod);
      default: return true;
    }
  };

  const goDashboard = async () => {
    await checkAuth();
    if (useAuthStore.getState().user) {
      navigate(resolveUserHome().path);
    } else {
      navigate('/login');
    }
  };

  const finishApproved = async (msg: string) => {
    setPollingPaid(false);
    setPaymentInfo(null);
    showToast(msg);
    // Card/free flows create an authenticated session, so land the owner on
    // their workspace home instead of /login.
    await goDashboard();
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        ...buildAuthRegisterPayload(form),
        planId: form.planId,
        billingCycle: billingPeriod,
        orgName: form.orgName.trim(),
        orgTypeId: form.orgTypeId,
        orgDocuments: form.documents,
        ...(isFreePlan ? {} : { paymentMethod: form.paymentMethod }),
      };
      const res = await api.post('/auth/register-organization', payload);
      const data = res.data;
      // Card flow — backend created a session + Paymob intention; show the widget.
      if (data.payment?.clientSecret) {
        paymentIdRef.current = data.payment.paymentId;
        setPaymentInfo({ paymentId: data.payment.paymentId, clientSecret: data.payment.clientSecret });
        return;
      }
      if (data.isApproved) {
        setApprovedResult(true);
        setStep(5);
        showToast('Your organization is approved and ready!');
        return;
      }
      if (data.paymentWarning) {
        showToast(data.paymentWarning, 'warning');
      }
      setStep(5);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentCancel = () => {
    resetConfirm();
    setPaymentInfo(null);
    setStep(5);
    showToast('Payment cancelled — your organization is pending review.', 'warning');
  };

  const handlePaymentComplete = async () => {
    const pmId = paymentIdRef.current;
    setPaymentInfo(null);
    showToast('Payment submitted — confirming…', 'info');
    if (!pmId) return;
    try {
      const cResult = await confirmPayment(pmId);
      if (cResult.confirmed) {
        await finishApproved('Payment confirmed — your organization is active!');
        return;
      }
    } catch {
      // fall through to polling
    }
    // Not yet confirmed locally — the Paymob webhook will approve; poll as fallback
    setPollingPaid(true);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl min-w-0">
        <Link to="/register" className="inline-flex items-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-8">
          &larr; Back to registration options
        </Link>

        {step === 5 ? (
          approvedResult ? (
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-10 text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--color-success-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Organization Active</h2>
              <p className="text-[var(--color-text-muted)] max-w-md mx-auto">Your organization has been approved and is ready to use. You are already logged in.</p>
              <button onClick={goDashboard} className="mt-6 px-6 py-3 bg-[var(--gradient-primary)] text-white font-semibold rounded-xl">Go to Dashboard</button>
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-10 text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-warning-bg)] dark:bg-yellow-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Pending Approval</h2>
              <p className="text-[var(--color-text-muted)] max-w-md mx-auto">Your organization registration has been submitted for review. A super admin will approve your account shortly. You'll be able to log in with player access in the meantime.</p>
              <button onClick={() => navigate('/login')} className="mt-6 px-6 py-3 bg-[var(--gradient-primary)] text-white font-semibold rounded-xl">Go to Login</button>
            </div>
          )
        ) : (
          <>
            <div className="flex items-center gap-2 mb-8">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    i < step ? 'bg-[var(--color-primary)] text-white' :
                    i === step ? 'bg-[var(--color-primary)] text-white ring-4 ring-[var(--color-primary)]/20' :
                    'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                  }`}>{i < step ? '\u2713' : i + 1}</div>
                  <span className={`text-xs hidden sm:inline font-medium ${i <= step ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>{s}</span>
                  {i < STEPS.length - 1 && <div className={`w-6 sm:w-10 h-0.5 ${i < step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`} />}
                </div>
              ))}
            </div>

            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 shadow-[var(--shadow-md)] animate-fade-in">
              {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-[var(--color-error-text)] dark:text-red-400">{error}</div>}

              <form onSubmit={(e) => e.preventDefault()} noValidate>
              {/* Step 0: Pick a Plan */}
              {step === 0 && (
                <div>
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Choose Your Plan</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">Select a subscription plan that fits your organization needs.</p>
                  <PlanPickerSection
                    plans={orgPlans}
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
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Personal Information</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">Your personal details for the account.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Country *</label>
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
                        <option value={0}>Select country...</option>
                        {countries.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone_code})</option>)}
                      </select>
                    </div>
                    <PhoneNumberInput
                      label="Phone Number"
                      value={form.phoneNumber}
                      onChange={(v) => update('phoneNumber', v)}
                      required
                    />
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Full Name *</label>
                      <input type="text" value={form.fullName} onChange={e => update('fullName', e.target.value)} placeholder="Your full name" className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Email *</label>
                      <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Account Setup */}
              {step === 2 && (
                <div>
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Account Setup</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">Create your password and complete your profile.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Password *</label>
                      <PasswordInput autoComplete="new-password" value={form.password} onChange={e => update('password', e.target.value)} placeholder="At least 6 characters" className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Confirm Password *</label>
                      <PasswordInput autoComplete="new-password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)} placeholder="Re-type password" className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                      {form.confirmPassword && form.password !== form.confirmPassword && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Gender *</label>
                      <select value={form.gender} onChange={e => update('gender', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none">
                        <option value="">Select...</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Date of Birth *</label>
                      <input type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Organization Details */}
              {step === 3 && (
                <div>
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Organization Details</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">Tell us about your organization.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Organization Name *</label>
                      <input type="text" value={form.orgName} onChange={e => update('orgName', e.target.value)} placeholder="Your organization name" className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Website</label>
                      <input type="url" value={form.orgWebsite} onChange={e => update('orgWebsite', e.target.value)} placeholder="https://example.com" className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">Leave blank, or enter a domain (example.com) or full URL (https://...)</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Organization Type *</label>
                      <select value={form.orgTypeId} onChange={e => update('orgTypeId', Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none">
                        <option value={0}>Select type...</option>
                        {orgTypes.map(t => <option key={t.id} value={t.id}>{t.name || t.slug}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Organization Email</label>
                      <input type="email" value={form.orgEmail} onChange={e => update('orgEmail', e.target.value)} placeholder="org@example.com" className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none" />
                    </div>
                    {!isFreePlan && (
                      <div>
                        <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Payment Method *</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {paymentMethods.map(m => (
                            <button key={m.id} type="button" onClick={() => update('paymentMethod', m.slug)}
                              className={`p-4 rounded-xl border-2 text-left transition-all ${form.paymentMethod === m.slug ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)]/30' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/30'}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg">{m.icon === 'wallet' ? '\uD83D\uDCB0' : m.icon === 'cash' ? '\uD83D\uDCB5' : m.icon === 'card' ? '\uD83D\uDCB3' : m.icon === 'bank_transfer' ? '\uD83C\uDFE6' : '\uD83D\uDCB3'}</span>
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
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {step === 4 && (
                <div>
                  <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Review & Submit</h2>
                  <p className="text-sm text-[var(--color-text-muted)] mb-6">Verify your information before submitting.</p>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Plan</span><span className="font-medium text-[var(--color-text)]">{(() => { const p = plans.find(x => x.id === form.planId); if (!p) return '\u2014'; const pr = resolveDisplayPrice(p, billingPeriod); return `${p.planName} (${billingPeriod === 'yearly' ? 'Annual' : 'Monthly'}${pr > 0 ? ` — ${pr} ${displayCurrency}` : ''})`; })()}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Country</span><span className="font-medium text-[var(--color-text)]">{countries.find(c => c.id === form.countryId)?.name || '\u2014'}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Phone</span><span className="font-medium text-[var(--color-text)]">{form.phoneNumber}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Full Name</span><span className="font-medium text-[var(--color-text)]">{form.fullName}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Email</span><span className="font-medium text-[var(--color-text)]">{form.email}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Gender</span><span className="font-medium text-[var(--color-text)] capitalize">{form.gender}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Date of Birth</span><span className="font-medium text-[var(--color-text)]">{form.birthDate}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Org Name</span><span className="font-medium text-[var(--color-text)]">{form.orgName}</span></div>
                    <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Org Type</span><span className="font-medium text-[var(--color-text)]">{orgTypes.find(t => t.id === form.orgTypeId)?.name || '\u2014'}</span></div>
                    {!isFreePlan && <div className="flex justify-between py-2 border-b border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">Payment</span><span className="font-medium text-[var(--color-text)] capitalize">{form.paymentMethod}</span></div>}
                  </div>
                  <div className="mt-6">
                    <LegalConsent onChange={setAgreed} />
                  </div>
                </div>
              )}

              </form>

              <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--color-border)]">
                <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                  className="px-5 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-bg)] disabled:opacity-30 transition-all text-[var(--color-text)]">
                  Back
                </button>
                {step < 4 ? (
                  <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all">
                    Next
                  </button>
                ) : (
                  <button type="button" onClick={handleSubmit} disabled={submitting || !agreed}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all">
                    {submitting ? 'Submitting...' : 'Submit Registration'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Card payment modal (same Paymob widget used for booking a court) */}
      <Modal open={!!paymentInfo} onClose={handlePaymentCancel} title="Complete Payment" size="lg">
        {paymentInfo && (
          <div>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">Pay securely to activate your organization immediately.</p>
            <PaymobPixelCard
              clientSecret={paymentInfo.clientSecret}
              beforePaymentComplete={async () => true}
              onComplete={handlePaymentComplete}
              onCancel={handlePaymentCancel}
            />
          </div>
        )}
      </Modal>

      {/* Payment confirming overlay */}
      {(confirmState === 'confirming' || confirmState === 'polling') && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center">
          <div className="bg-[var(--color-surface)] rounded-xl shadow-xl p-6 text-center space-y-3">
            <div className="animate-spin w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-[var(--color-text-muted)]">
              {confirmState === 'confirming' ? 'Confirming payment…' : 'Waiting for confirmation…'}
            </p>
          </div>
        </div>
      )}

      {/* Fallback polling (webhook will activate the organization) */}
      {pollingPaid && paymentIdRef.current > 0 && (
        <PaymentStatusPoller
          endpoint={`/payments/status/${paymentIdRef.current}`}
          isComplete={(data: any) => data?.paymentStatus === 'paid'}
          interval={2000}
          timeout={90000}
          onPaid={() => void finishApproved('Payment confirmed — your organization is active!')}
          onTimeout={() => {
            setPollingPaid(false);
            setStep(5);
            showToast('Payment confirmation is taking longer than expected. Your organization will be activated automatically.', 'warning');
          }}
        />
      )}
    </div>
  );
}
