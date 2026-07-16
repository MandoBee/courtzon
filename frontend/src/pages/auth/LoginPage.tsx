import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '../../store/auth.store';
import { t } from '../../i18n';
import { Button, Input, Card } from '../../components/ui';
import PhoneNumberInput from '../../components/form/PhoneNumberInput';
import { localPhoneZod } from '../../utils/phone';
import { useDetectedCountry } from '../../hooks/useDetectedCountry';
import api from '../../services/api';

interface Country {
  id: number;
  name: string;
  phone_code: string;
  iso_code: string;
  flag_emoji?: string;
}

const LoginSchema = z.object({
  countryId: z.number().int().positive(),
  phoneNumber: localPhoneZod(t('validation.phone_11_digits')),
  password: z.string().min(1, t('validation.required')),
  rememberMe: z.boolean(),
});

type LoginForm = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [countries, setCountries] = useState<Country[]>([]);

  const { register, handleSubmit, setValue, watch, setError, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { countryId: 0, phoneNumber: '', rememberMe: false },
  });

  const selectedCountryId = watch('countryId');
  const phoneNumber = watch('phoneNumber');

  useEffect(() => {
    api.get('/public/countries').then((r) => {
      setCountries(r.data?.data || r.data || []);
    }).catch(() => {});
  }, []);

  useDetectedCountry(countries, (id) => setValue('countryId', id, { shouldValidate: true }), {
    currentCountryId: selectedCountryId,
  });

  const onSubmit = async (data: LoginForm) => {
    const country = countries.find((c) => c.id === data.countryId);
    try {
      await login({
        phoneNumber: data.phoneNumber,
        password: data.password,
        countryCode: country?.phone_code,
        rememberMe: data.rememberMe,
      });
      navigate('/app');
    } catch (err: any) {
      setError('root', { message: err.response?.data?.message || t('common.error') });
    }
  };

  return (
    <div className="flex items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-md">
        <Card>
          <h2 className="text-xl font-semibold text-[var(--color-text)] mb-6">{t('auth.login.title')}</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                {t('auth.register.country')}
              </label>
              <select
                value={selectedCountryId || ''}
                onChange={(e) => setValue('countryId', Number(e.target.value), { shouldValidate: true })}
                className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">Select country...</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.flag_emoji ? `${c.flag_emoji} ` : ''}{c.name} ({c.phone_code})
                  </option>
                ))}
              </select>
              {errors.countryId && (
                <p className="text-xs text-[var(--color-error)] mt-1">{errors.countryId.message}</p>
              )}
            </div>
            <PhoneNumberInput
              label={t('auth.login.phone')}
              value={phoneNumber}
              onChange={(v) => setValue('phoneNumber', v, { shouldValidate: true })}
              error={errors.phoneNumber?.message}
              required
            />
            <Input
              label={t('auth.login.password')}
              type="password"
              autoComplete="current-password"
              {...register('password')}
              error={errors.password?.message}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('rememberMe')}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text-muted)]">Remember me</span>
            </label>
            {errors.root && (
              <p className="text-sm text-[var(--color-error)]">{errors.root.message}</p>
            )}
            <Button type="submit" loading={isSubmitting} className="w-full" disabled={!selectedCountryId}>
              {t('auth.login.submit')}
            </Button>
          </form>
          <div className="mt-3 text-center">
            <Link to="/forgot-password" className="text-sm text-[var(--color-primary)] hover:underline">
              Forgot password?
            </Link>
          </div>
          <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
            {t('auth.login.no_account')}{' '}
            <Link to="/register" className="text-[var(--color-primary)] hover:underline">
              {t('auth.register.title')}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
