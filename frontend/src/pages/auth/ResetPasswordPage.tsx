import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from '../../i18n';
import api from '../../services/api';
import { Button, Input, Card } from '../../components/ui';
import SiteBrand from '../../components/branding/SiteBrand';

const ResetSchema = z.object({
  newPassword: z.string().min(6, t('auth.reset.min_length')),
  confirmPassword: z.string().min(6, t('auth.reset.min_length')),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: t('auth.reset.mismatch'),
  path: ['confirmPassword'],
});

type ResetForm = z.infer<typeof ResetSchema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [done, setDone] = useState(false);

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ResetForm>({
    resolver: zodResolver(ResetSchema),
  });

  const onSubmit = async (data: ResetForm) => {
    if (!token) {
      setError('root', { message: t('auth.reset.missing_token') });
      return;
    }
    try {
      await api.post('/auth/reset-password', { token, newPassword: data.newPassword });
      setDone(true);
    } catch (err: any) {
      setError('root', { message: err.response?.data?.message || t('common.error') });
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-text)] mb-2">{t('auth.reset.done_title')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('auth.reset.done_desc')}</p>
            <Link
              to="/login"
              className="inline-block py-2.5 px-6 bg-[var(--color-primary)] text-white font-medium rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
            >
              {t('auth.login.title')}
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <SiteBrand className="mb-8" subtitle={t('auth.reset.subtitle')} />
        <Card>
          <h2 className="text-xl font-semibold text-[var(--color-text)] mb-6">{t('auth.reset.title')}</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label={t('auth.register.password')}
              type="password"
              autoComplete="new-password"
              placeholder="Min 6 characters"
              {...register('newPassword')}
              error={errors.newPassword?.message}
            />
            <Input
              label={t('auth.register.confirm_password')}
              type="password"
              autoComplete="new-password"
              placeholder="Repeat password"
              {...register('confirmPassword')}
              error={errors.confirmPassword?.message}
            />
            {errors.root && <p className="text-sm text-[var(--color-error)]">{errors.root.message}</p>}
            <Button type="submit" loading={isSubmitting} className="w-full">
              {t('auth.reset.submit')}
            </Button>
          </form>
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
