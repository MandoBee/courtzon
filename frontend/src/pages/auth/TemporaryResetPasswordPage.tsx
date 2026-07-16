import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '../../components/ui/Toast';
import api from '../../services/api';
import { Button, Input, Card } from '../../components/ui';
import SiteBrand from '../../components/branding/SiteBrand';

const ResetSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ResetForm = z.infer<typeof ResetSchema>;

/**
 * Temporary password reset page — bypasses email verification.
 * TODO: Replace with email verification flow when email service is enabled.
 */
export default function TemporaryResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const email = searchParams.get('email') || '';
  const [done, setDone] = useState(false);

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ResetForm>({
    resolver: zodResolver(ResetSchema),
  });

  const onSubmit = async (data: ResetForm) => {
    if (!email) {
      setError('root', { message: 'Missing email. Please start again from Forgot Password.' });
      return;
    }
    try {
      await api.post('/auth/temporary-reset', {
        email,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });
      showToast('Password reset successfully.', 'success');
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Something went wrong', 'error');
      setError('root', { message: err.response?.data?.message || 'Something went wrong' });
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
            <h2 className="text-xl font-semibold text-[var(--color-text)] mb-2">Password Reset</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">Your password has been reset successfully. Redirecting to login...</p>
            <Link
              to="/login"
              className="inline-block py-2.5 px-6 bg-[var(--color-primary)] text-white font-medium rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
            >
              Go to Login
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <SiteBrand className="mb-8" subtitle="Set a new password" />
        <Card>
          <div className="mb-4 p-3 bg-[var(--color-warning-bg)] border border-[var(--color-warning)] rounded-[var(--radius-md)] text-sm text-[var(--color-warning-text)]">
            Temporary flow — no email verification. Will be replaced with email-based reset.
          </div>
          <h2 className="text-xl font-semibold text-[var(--color-text)] mb-6">Reset Password</h2>
          {email && (
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Resetting password for: <span className="font-medium text-[var(--color-text)]">{email}</span>
            </p>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="New Password"
              type="password"
              autoComplete="new-password"
              placeholder="Min 6 characters"
              {...register('newPassword')}
              error={errors.newPassword?.message}
            />
            <Input
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat password"
              {...register('confirmPassword')}
              error={errors.confirmPassword?.message}
            />
            {errors.root && <p className="text-sm text-[var(--color-error)]">{errors.root.message}</p>}
            <Button type="submit" loading={isSubmitting} className="w-full">
              Reset Password
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
            Remember your password?{' '}
            <Link to="/login" className="text-[var(--color-primary)] hover:underline">
              Sign In
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
