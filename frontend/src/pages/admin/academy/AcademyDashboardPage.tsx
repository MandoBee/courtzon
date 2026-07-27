import { useQuery } from '@tanstack/react-query';
import { academyApi } from '../../../services/academy';
import { useTranslation } from '../../../i18n';
import { SkeletonRow } from '../../../components/ui/Skeleton';

export default function AcademyDashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'academy', 'dashboard'],
    queryFn: academyApi.getDashboard,
  });

  if (isLoading) return <SkeletonRow count={4} />;

  const cards = [
    { label: t('admin.academy.total_programs'), value: data?.total_programs ?? 0, color: 'bg-blue-500' },
    { label: t('admin.academy.published'), value: data?.published_programs ?? 0, color: 'bg-green-500' },
    { label: t('admin.academy.running'), value: data?.running_programs ?? 0, color: 'bg-purple-500' },
    { label: t('admin.academy.total_groups'), value: data?.total_groups ?? 0, color: 'bg-indigo-500' },
    { label: t('admin.academy.total_players'), value: data?.total_players ?? 0, color: 'bg-teal-500' },
    { label: t('admin.academy.waiting_list'), value: data?.waiting_list_count ?? 0, color: 'bg-amber-500' },
    { label: t('admin.academy.capacity_utilization'), value: `${data?.capacity_utilization ?? 0}%`, color: 'bg-rose-500' },
  ];

  const att = data?.attendance_summary;
  const totalAtt = att ? att.present + att.absent + att.excused + att.late : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">{t('admin.academy.dashboard')}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 space-y-1">
            <span className="text-xs text-[var(--color-text-muted)]">{c.label}</span>
            <p className="text-2xl font-bold text-[var(--color-text)]">{c.value}</p>
          </div>
        ))}
      </div>
      {totalAtt > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">{t('admin.academy.attendance_summary')}</h2>
          <div className="grid grid-cols-4 gap-3 text-center text-sm">
            <div><span className="block text-lg font-bold text-green-600">{att?.present ?? 0}</span><span className="text-[var(--color-text-muted)]">{t('admin.academy.present')}</span></div>
            <div><span className="block text-lg font-bold text-red-600">{att?.absent ?? 0}</span><span className="text-[var(--color-text-muted)]">{t('admin.academy.absent')}</span></div>
            <div><span className="block text-lg font-bold text-amber-600">{att?.excused ?? 0}</span><span className="text-[var(--color-text-muted)]">{t('admin.academy.excused')}</span></div>
            <div><span className="block text-lg font-bold text-blue-600">{att?.late ?? 0}</span><span className="text-[var(--color-text-muted)]">{t('admin.academy.late')}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
