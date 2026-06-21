import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Button, Input, Card } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';

const TournamentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  bracketTypeId: z.string(),
  sportId: z.string().optional(),
  maxParticipants: z.string().min(1, 'Required'),
  minParticipants: z.string().optional(),
  entryFee: z.string().optional(),
  currencyCode: z.string().optional(),
  commissionRate: z.string().optional(),
  startDate: z.string().min(1, 'Start date required'),
  endDate: z.string().optional(),
  rules: z.string().optional(),
});

type TournamentForm = z.infer<typeof TournamentSchema>;


export default function TournamentCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<TournamentForm>({
    resolver: zodResolver(TournamentSchema),
    defaultValues: { bracketTypeId: '1', maxParticipants: '16', currencyCode: 'AED', commissionRate: '', entryFee: '', minParticipants: '' },
  });

  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: () => api.get('/sports').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/tournaments', data),
    onSuccess: (res) => {
      showToast('Tournament created successfully!');
      navigate(`/tournaments/${res.data.id}`);
    },
    onError: (err) => {
      showToast('Failed to create tournament: ' + (err as any).message, 'error');
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
      organisationId: undefined,
    });
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Create Tournament</h1>
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Can permission="tournaments.create.name">
            <Input label="Name" {...register('name')} error={errors.name?.message} />
          </Can>
          <Can permission="tournaments.create.description">
            <Input label="Description" tag="textarea" rows={3} {...register('description')} />
          </Can>

          <div className="grid grid-cols-2 gap-4">
            <Can permission="tournaments.create.type">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Bracket Type</label>
                <select {...register('bracketTypeId')} defaultValue="1"
                  className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                  <option value={1}>Single Elimination</option>
                  <option value={2}>Round Robin</option>
                </select>
              </div>
            </Can>
            <Can permission="tournaments.create.sport">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Sport</label>
                <select {...register('sportId')} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                  <option value="">Any Sport</option>
                  {sports?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </Can>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Can permission="tournaments.create.max-participants">
              <Input label="Max Players" type="number" min={2} {...register('maxParticipants')} error={errors.maxParticipants?.message} />
            </Can>
            <Can permission="tournaments.create.prize">
              <Input label="Entry Fee" type="number" min={0} step="0.01" {...register('entryFee')} />
            </Can>
            <Input label="Commission %" type="number" min={0} max={100} {...register('commissionRate')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Can permission="tournaments.create.start-date">
              <Input label="Start Date" type="date" {...register('startDate')} error={errors.startDate?.message} />
            </Can>
            <Can permission="tournaments.create.end-date">
              <Input label="End Date" type="date" {...register('endDate')} />
            </Can>
          </div>

          <Can permission="tournaments.create.rules">
            <Input label="Rules" tag="textarea" rows={3} {...register('rules')} />
          </Can>

          <Button type="submit" loading={createMutation.isPending} className="w-full">
            Create Tournament
          </Button>

          {createMutation.isError && (
            <p className="text-sm text-[var(--color-error)]">Failed to create tournament. Try again.</p>
          )}
        </form>
      </Card>
    </div>
  );
}
