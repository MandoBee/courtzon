import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { bracketTypeApi } from '../../../services/tournament';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { Card } from '../../../components/ui';
import { SkeletonRow } from '../../../components/ui/Skeleton';

interface BracketTypeRow {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  config_schema: string | null;
  referenced_count: number;
}

/**
 * Group 5B-SR — Super Admin Bracket Type management.
 * `tournament_bracket_types` is the single source of truth (never a second
 * table). Referenced types are deactivated (never destructively deleted).
 */
export default function TournamentBracketTypesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bracket-types'],
    queryFn: () => bracketTypeApi.listAll(),
  });
  const rows: BracketTypeRow[] = data?.data ?? [];

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => bracketTypeApi.setActive(id, isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-bracket-types'] });
      qc.invalidateQueries({ queryKey: ['bracket-types'] });
      showToast(t('tournaments.bracket_types.updated'));
    },
    onError: (err) => showToast(`Failed to update bracket type: ${(err as any).message}`, 'error'),
  });

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">{t('tournaments.bracket_types.title')}</h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left px-4 py-3">{t('tournaments.bracket_types.name')}</th>
              <th className="text-left px-4 py-3">{t('tournaments.bracket_types.slug')}</th>
              <th className="text-left px-4 py-3">{t('tournaments.bracket_types.config')}</th>
              <th className="text-left px-4 py-3">{t('tournaments.bracket_types.status')}</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-3"><SkeletonRow count={4} /></td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('tournaments.bracket_types.no_results')}</td></tr>
            )}
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                  {b.name}
                  <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)]">
                    {isEngineSupported(b.slug) ? t('tournaments.bracket_types.supported') : t('tournaments.bracket_types.deferred')}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{b.slug}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                  {b.config_schema ? <pre className="whitespace-pre-wrap font-mono text-[10px]">{b.config_schema}</pre> : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {b.is_active ? t('tournaments.bracket_types.active') : t('tournaments.bracket_types.inactive')}
                  </span>
                  {b.referenced_count > 0 && (
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-1">
                      {t('tournaments.bracket_types.referenced').replace('{count}', String(b.referenced_count))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Can permission="tournament.bracket-types.manage">
                    <button
                      onClick={() => toggleMutation.mutate({ id: b.id, isActive: !b.is_active })}
                      disabled={toggleMutation.isPending}
                      className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)] disabled:opacity-50">
                      {b.is_active ? t('tournaments.bracket_types.deactivate') : t('tournaments.bracket_types.activate')}
                    </button>
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/** Group 5B-SR — mirrors the backend engine-supported constant. */
function isEngineSupported(slug: string): boolean {
  return slug === 'single-elimination' || slug === 'round-robin';
}