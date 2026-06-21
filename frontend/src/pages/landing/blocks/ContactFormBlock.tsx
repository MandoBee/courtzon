import { useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';
import { Button, Input } from '../../../components/ui';
import PhoneNumberInput from '../../../components/form/PhoneNumberInput';
import { localPhoneZod } from '../../../utils/phone';
import { useDetectedCountry } from '../../../hooks/useDetectedCountry';

interface ContactFormBlockProps {
  title?: string;
  subtitle?: string;
}

const ContactSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().email('Valid email is required'),
  countryId: z.number().int().positive('Country is required'),
  phone: localPhoneZod('Phone number must be exactly 11 digits (e.g. 01012345678)'),
  subject: z.string().min(1, 'Subject is required'),
  subjectOther: z.string().optional(),
  message: z.string().trim().min(10, 'Message must be at least 10 characters'),
  referralSource: z.string().min(1, 'Please select how you heard about us'),
  referralOther: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.subject === 'other' && !data.subjectOther?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Please specify your subject', path: ['subjectOther'] });
  }
  if (data.referralSource === 'other' && !data.referralOther?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Please tell us how you heard about us', path: ['referralOther'] });
  }
});

type ContactForm = z.infer<typeof ContactSchema>;

type ContactOptions = {
  generalSubjects: { value: string; label: string }[];
  referralSources: { value: string; label: string }[];
  acceptedFileTypesLabel: string;
  maxFiles: number;
};

export default function ContactFormBlock({ title, subtitle }: ContactFormBlockProps) {
  const { showToast } = useToast();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const { data: countries = [] } = useQuery({
    queryKey: ['public', 'countries'],
    queryFn: () => api.get('/public/countries').then((r) => r.data.data as Array<{
      id: number;
      name: string;
      iso_code: string;
      default_currency?: string;
      phone_code?: string;
      flag_emoji?: string;
    }>),
    staleTime: 300_000,
  });

  const { data: options } = useQuery({
    queryKey: ['public', 'contact-options'],
    queryFn: () => api.get('/public/contact/options').then((r) => r.data.data as ContactOptions),
    staleTime: 300_000,
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ContactForm>({
    resolver: zodResolver(ContactSchema),
    defaultValues: {
      countryId: countries[0]?.id ?? undefined,
      subject: '',
      referralSource: '',
    },
  });

  const subjectValue = watch('subject');
  const referralValue = watch('referralSource');
  const countryId = watch('countryId');

  useDetectedCountry(
    countries,
    (id) => {
      reset((prev) => ({ ...prev, countryId: id }));
    },
    { currentCountryId: countryId ?? 0 },
  );
  const submitMut = useMutation({
    mutationFn: async (data: ContactForm) => {
      const fd = new FormData();
      fd.append('fullName', data.fullName);
      fd.append('email', data.email);
      fd.append('countryId', String(data.countryId));
      fd.append('phone', data.phone);
      fd.append('subject', data.subject);
      if (data.subjectOther) fd.append('subjectOther', data.subjectOther);
      fd.append('message', data.message);
      fd.append('referralSource', data.referralSource);
      if (data.referralOther) fd.append('referralOther', data.referralOther);
      for (const file of files) {
        fd.append('attachments', file);
      }
      return api.post('/public/contact', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      showToast('Your message has been sent successfully.');
      reset({
        fullName: '',
        email: '',
        countryId: countries[0]?.id,
        phone: '',
        subject: '',
        subjectOther: '',
        message: '',
        referralSource: '',
        referralOther: '',
      });
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to send your message. Please try again.';
      showToast(msg, 'error');
    },
  });

  const maxFiles = options?.maxFiles ?? 5;
  const acceptTypes = '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf';

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length + files.length > maxFiles) {
      showToast(`You can attach up to ${maxFiles} files.`, 'warning');
      return;
    }
    const maxBytes = 5 * 1024 * 1024;
    for (const f of picked) {
      if (f.size > maxBytes) {
        showToast(`${f.name} exceeds 5 MB.`, 'error');
        return;
      }
    }
    setFiles((prev) => [...prev, ...picked].slice(0, maxFiles));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <section className="cz-landing-section cz-landing-section--bg">
      <div className="cz-landing-inner cz-landing-inner--narrow animate-fade-in">
        {(title || subtitle) && (
          <div className="cz-landing-section-header">
            {title && <h2 className="cz-landing-h2">{title}</h2>}
            {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
          </div>
        )}

        <form
          onSubmit={handleSubmit((data) => submitMut.mutate(data))}
          className="cz-landing-card space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={`${t('landing.player_reg.full_name')} *`}
              {...register('fullName')}
              error={errors.fullName?.message}
            />
            <Input
              label={`${t('common.email')} *`}
              type="email"
              {...register('email')}
              error={errors.email?.message}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="cz-form-label">{t('auth.register.country')} *</label>
              <select
                {...register('countryId', { valueAsNumber: true })}
                className="cz-form-input w-full"
              >
                <option value="">{t('common.select_country')}</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.flag_emoji ? `${c.flag_emoji} ` : ''}{c.name}
                  </option>
                ))}
              </select>
              {errors.countryId && (
                <p className="mt-1 text-sm text-[var(--color-danger)]">{errors.countryId.message}</p>
              )}
            </div>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneNumberInput
                  label={`${t('common.phone')} *`}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.phone?.message}
                  required
                />
              )}
            />
          </div>

          <div>
            <label className="cz-form-label">{t('landing.contact.subject')}</label>
            <select {...register('subject')} className="cz-form-input w-full">
              <option value="">{t('landing.contact.select_subject')}</option>
              {options?.generalSubjects?.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
              <option value="other">{t('landing.contact.other')}</option>
            </select>
            {errors.subject && (
              <p className="mt-1 text-sm text-[var(--color-danger)]">{errors.subject.message}</p>
            )}
          </div>

          {subjectValue === 'other' && (
            <Input
              label={t('landing.contact.custom_subject')}
              {...register('subjectOther')}
              error={errors.subjectOther?.message}
            />
          )}

          <div>
            <label className="cz-form-label">{t('landing.contact.message')}</label>
            <textarea
              rows={6}
              {...register('message')}
              className="cz-form-input w-full resize-y"
              placeholder={t('landing.contact.message_placeholder')}
            />
            {errors.message && (
              <p className="mt-1 text-sm text-[var(--color-danger)]">{errors.message.message}</p>
            )}
          </div>

          <div>
            <label className="cz-form-label">{t('landing.contact.attachments')}</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptTypes}
              onChange={onFileChange}
              disabled={files.length >= maxFiles}
              className="block w-full text-sm text-[var(--color-text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary-bg)] file:text-[var(--color-primary)] hover:file:opacity-90"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {options?.acceptedFileTypesLabel ||
                'JPEG, PNG, WebP, GIF, HEIC, or PDF (max 5 files, 5 MB each)'}
            </p>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate text-[var(--color-text)]">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-[var(--color-danger)] hover:underline shrink-0"
                    >
                      {t('common.remove')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="cz-form-label">{t('landing.contact.referral_source')} *</label>
            <select {...register('referralSource')} className="cz-form-input w-full">
              <option value="">{t('landing.contact.select_referral')}</option>
              {options?.referralSources?.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {errors.referralSource && (
              <p className="mt-1 text-sm text-[var(--color-danger)]">{errors.referralSource.message}</p>
            )}
          </div>

          {referralValue === 'other' && (
            <Input
              label={t('landing.contact.specify_referral')}
              {...register('referralOther')}
              error={errors.referralOther?.message}
            />
          )}

          <Button
            type="submit"
            disabled={submitMut.isPending}
            className="cz-on-gradient-btn w-full sm:w-auto px-8"
          >
            {submitMut.isPending ? t('landing.contact.sending') : t('landing.contact.send')}
          </Button>
        </form>
      </div>
    </section>
  );
}
