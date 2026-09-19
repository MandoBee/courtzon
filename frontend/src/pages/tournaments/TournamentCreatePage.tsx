import { useMemo } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { Button, Input, Card } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';

type TournamentForm = {
  name: string;
  description?: string;
  bracketTypeId: string;
  sportId?: string;
  maxParticipants: string;
  minParticipants?: string;
  entryFee?: string;
  currencyCode?: string;
  commissionRate?: string;
  startDate: string;
  endDate?: string;
  rules?: string;
};

export type TournamentCreateContextMode = 'player' | 'admin' | 'org';

interface Props {
  mode?: TournamentCreateContextMode;
  orgId?: string;
}

/**
 * ONE SHARED create-tournament screen. Used by the Super Admin workbench
 * (`/admin/tournament/list/new`) and the Org Admin portal
 * (`/org/:orgId/tournaments/new`). Only the API endpoint and post-create
 * navigation differ per context; the form, validation and field permissions
 * stay single-source.
 */
export default function TournamentCreatePage({ mode = 'admin', orgId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isOrg = mode === 'org';
  const isAdmin = mode === 'admin';
  const endpoint = isOrg && orgId ? `/org/${orgId}/tournaments` : `/admin/tournaments`;
  const detailPath = (id: number) =>
    isOrg && orgId ? `/org/${orgId}/tournaments/${id}` : isAdmin ? `/admin/tournament/list/${id}` : `/tournaments/${id}`;

  const TournamentSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t('tournaments.create.validation.name')),
        description: z.string().optional(),
        bracketTypeId: z.string(),
        sportId: z.string().optional(),
        maxParticipants: z.string().min(1, t('tournaments.create.validation.max_players')),
        minParticipants: z.string().optional(),
        entryFee: z.string().optional(),
        currencyCode: z.string().optional(),
        commissionRate: z.string().optional(),
        startDate: z.string().min(1, t('tournaments.create.validation.start_date')),
        endDate: z.string().optional(),
        rules: z.string().optional(),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TournamentForm>({
    resolver: zodResolver(TournamentSchema),
    defaultValues: { bracketTypeId: '1', maxParticipants: '16', currencyCode: 'AED' },
  });

  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: () => api.get('/sports').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(endpoint, data),
    onSuccess: (res) => {
      showToast(t('tournaments.create.success'));
      navigate(detailPath(res.data.id));
    },
    onError: (err) => {
      showToast(`${t('tournaments.create.error')}: ${(err as any).message}`, 'error');
    },
  });

  const onSubmit = (data: TournamentForm) => {
    createMutation.mutate({
      ...data,
      bracketTypeId: Number(data.bracketTypeId),
      maxParticipants: Number(data.maxParticipants),
      minParticipants: data.minParticipants ? Number(data.minParticipants) : 2,
      entryFee: data.entryFee ? Number(data.entryFee) : 0,
      commissionRate: data.commissionRate ? Number(data.commissionRate) : 0,
      sportId: data.sportId ? Number(data.sportId) : undefined,
      organisationId: isOrg && orgId ? Number(orgId) : undefined,
    });
  };

  const bracketOptions = [
    { value: 1, label: t('tournaments.create.single_elimination') },
    { value: 2, label: t('tournaments.create.round_robin') },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">{t('tournaments.create.title')}</h1>
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Can permission="tournaments.create.name">
            <Input label={t('tournaments.create.name')} {...register('name')} error={errors.name?.message} />
          </Can>
          <Can permission="tournaments.create.description">
            <Input label={t('tournaments.create.description')} tag="textarea" rows={3} {...register('description')} />
          </Can>

          <div className="grid grid-cols-2 gap-4">
            <Can permission="tournaments.create.type">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('tournaments.create.bracket_type')}</label>
                <select {...register('bracketTypeId')}
                  className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                  {bracketOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </Can>
            <Can permission="tournaments.create.sport">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('tournaments.create.sport')}</label>
                <select {...register('sportId')} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                  <option value="">{t('tournaments.create.any_sport')}</option>
                  {sports?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </Can>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Can permission="tournaments.create.max-participants">
              <Input label={t('tournaments.create.max_players')} type="number" min={2} {...register('maxParticipants')} error={errors.maxParticipants?.message} />
            </Can>
            <Can permission="tournaments.create.prize">
              <Input label={t('tournaments.create.entry_fee')} type="number" min={0} step="0.01" {...register('entryFee')} />
            </Can>
            <Input label={t('tournaments.create.commission_rate')} type="number" min={0} max={100} {...register('commissionRate')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Can permission="tournaments.create.start-date">
              <Input label={t('tournaments.create.start_date')} type="date" {...register('startDate')} error={errors.startDate?.message} />
            </Can>
            <Can permission="tournaments.create.end-date">
              <Input label={t('tournaments.create.end_date')} type="date" {...register('endDate')} />
            </Can>
          </div>

          <Can permission="tournaments.create.rules">
            <Input label={t('tournaments.create.rules')} tag="textarea" rows={3} {...register('rules')} />
          </Can>

          <Button type="submit" loading={createMutation.isPending} className="w-full">
            {t('tournaments.create.submit')}
          </Button>

          {createMutation.isError && (
            <p className="text-sm text-[var(--color-error)]">{t('tournaments.create.error')}</p>
          )}
        </form>
      </Card>
    </div>
  );
}