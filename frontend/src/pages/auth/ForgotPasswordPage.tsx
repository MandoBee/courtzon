import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from '../../i18n';
import api from '../../services/api';
import { featureFlags } from '../../config/feature-flags';
import { Button, Input, Card } from '../../components/ui';
import SiteBrand from '../../components/branding/SiteBrand';

const ForgotSchema = z.object({
  email: z.string().email(t('validation.invalid_email')),
});

type ForgotForm = z.infer<typeof ForgotSchema>;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'done'>('email');

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ForgotForm>({
    resolver: zodResolver(ForgotSchema),
  });

  const onSubmit = async (data: ForgotForm) => {
    try {
      // TODO: Replace with email verification flow when email service is enabled.
      if (featureFlags.auth.temporaryPasswordReset) {
        const res = await api.post('/auth/temporary-reset/verify', { email: data.email });
        if (res.data?.email) {
          navigate(`/temporary-reset-password?email=${encodeURIComponent(res.data.email)}`);
          return;
        }
      }
      const res = await api.post('/auth/forgot-password', { email: data.email });
      const token = res.data?.token;
      setStep('done');
      if (token) {
        setTimeout(() => navigate(`/reset-password?token=${token}`), 1500);
      }
    } catch (err: any) {
      setError('root', { message: err.response?.data?.message || 'Something went wrong' });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <SiteBrand className="mb-8" subtitle={t('auth.forgot.subtitle')} />
        <Card>
          {step === 'email' ? (
            <>
              <h2 className="text-xl font-semibold text-[var(--color-text)] mb-6">{t('auth.forgot.title')}</h2>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label={t('auth.forgot.email')}
                  type="email"
                  placeholder="you@example.com"
                  {...register('email')}
                  error={errors.email?.message}
                />
                {errors.root && <p className="text-sm text-[var(--color-error)]">{errors.root.message}</p>}
                <Button type="submit" loading={isSubmitting} className="w-full">
                  {t('auth.forgot.submit')}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[var(--color-text)] mb-2">{t('auth.forgot.checked_title')}</h2>
              <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('auth.forgot.checked_desc')}</p>
            </div>
          )}
          <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
            {t('auth.forgot.remember')}{' '}
            <Link to="/login" className="text-[var(--color-primary)] hover:underline">
              {t('auth.login.title')}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
