import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useTranslation } from '../../../i18n';
import { SkeletonRow } from '../../../components/ui/Skeleton';

type Tab = 'rankings' | 'analytics' | 'recommendations' | 'optimize';

export default function SportsEnginePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('rankings');

  const { data: rankings, isLoading: rLoading } = useQuery({
    queryKey: ['sports-engine', 'rankings'],
    queryFn: () => api.get('/sports-engine/rankings?limit=50').then(r => r.data),
    enabled: activeTab === 'rankings',
  });

  const { data: analytics } = useQuery({
    queryKey: ['sports-engine', 'match-quality'],
    queryFn: () => api.get('/sports-engine/analytics/match-quality').then(r => r.data),
    enabled: activeTab === 'analytics',
  });

  const { data: trends } = useQuery({
    queryKey: ['sports-engine', 'trends'],
    queryFn: () => api.get('/sports-engine/analytics/trends').then(r => r.data),
    enabled: activeTab === 'analytics',
  });

  const { data: partners } = useQuery({
    queryKey: ['sports-engine', 'partners'],
    queryFn: () => api.get('/sports-engine/recommend/partners').then(r => r.data),
    enabled: activeTab === 'recommendations',
  });

  const { data: coaches } = useQuery({
    queryKey: ['sports-engine', 'coaches'],
    queryFn: () => api.get('/sports-engine/recommend/coaches').then(r => r.data),
    enabled: activeTab === 'recommendations',
  });

  const { data: schedule } = useQuery({
    queryKey: ['sports-engine', 'optimize'],
    queryFn: () => api.get('/sports-engine/optimize/schedule').then(r => r.data),
    enabled: activeTab === 'optimize',
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'rankings', label: 'Rankings' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'recommendations', label: 'Recommendations' },
    { key: 'optimize', label: 'Schedule Optimizer' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--color-text)]">{t('admin.sports.engine') || 'Sports Engine'}</h1>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.key ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'rankings' && (
        <Can permission="sports-engine.view">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border overflow-x-auto">
            {rLoading ? <SkeletonRow count={5} /> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-xs text-[var(--color-text-muted)]">
                  <th className="px-3 py-2 text-center">#</th>
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-center">Rating</th>
                  <th className="px-3 py-2 text-center">Matches</th>
                  <th className="px-3 py-2 text-center">Win Rate</th>
                  <th className="px-3 py-2 text-left">Sport</th>
                </tr></thead>
                <tbody>
                  {rankings?.map((r: any) => (
                    <tr key={r.user_id} className="border-b last:border-0 hover:bg-[var(--color-bg)]">
                      <td className="px-3 py-2 text-center font-bold">{r.rank_position}</td>
                      <td className="px-3 py-2 font-medium">{r.full_name}</td>
                      <td className="px-3 py-2 text-center font-mono">{r.rating}</td>
                      <td className="px-3 py-2 text-center">{r.matches_played}</td>
                      <td className="px-3 py-2 text-center">{r.win_rate}%</td>
                      <td className="px-3 py-2 text-xs">{r.sport_name || '-'}</td>
                    </tr>
                  ))}
                  {(!rankings || rankings.length === 0) && <tr><td colSpan={6} className="text-center py-8 text-xs text-[var(--color-text-muted)]">No rankings yet</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </Can>
      )}

      {activeTab === 'analytics' && (
        <Can permission="sports-engine.view">
          <div className="space-y-4">
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Match Quality</h2>
              <div className="space-y-2">
                {analytics?.map((m: any) => (
                  <div key={m.match_id} className="flex items-center justify-between text-sm py-1">
                    <span className="text-[var(--color-text-muted)]">Match #{m.match_id}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs">Quality: {m.quality_score}%</span>
                      <div className="w-20 h-2 bg-gray-200 rounded-full">
                        <div className="h-2 bg-[var(--color-primary)] rounded-full" style={{ width: `${m.quality_score}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['bookings', 'tournaments', 'academy_enrollments'].map(key => (
                <div key={key} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4">
                  <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase mb-2">{key.replace('_', ' ')}</h3>
                  <div className="space-y-1">
                    {trends?.[key]?.slice(-6).map((t: any) => (
                      <div key={t.month} className="flex justify-between text-xs">
                        <span>{t.month}</span>
                        <span className="font-medium">{t.count || t.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Can>
      )}

      {activeTab === 'recommendations' && (
        <Can permission="sports-engine.view">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Partner Recommendations</h2>
              {partners?.map((p: any) => (
                <div key={p.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{p.full_name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">Rating: {p.rating || 'N/A'} · Compatibility: {p.compatibility_score}%</p>
                  </div>
                  <div className="w-16 h-2 bg-gray-200 rounded-full">
                    <div className="h-2 bg-green-500 rounded-full" style={{ width: `${p.compatibility_score}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Coach Recommendations</h2>
              {coaches?.map((c: any) => (
                <div key={c.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{c.full_name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{c.experience_years} yrs · ★ {c.rating_avg?.toFixed(1)}</p>
                  </div>
                  <span className="text-xs font-medium">${c.hourly_rate}/hr</span>
                </div>
              ))}
            </div>
          </div>
        </Can>
      )}

      {activeTab === 'optimize' && (
        <Can permission="sports-engine.view">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Underutilized Resources</h2>
            <div className="space-y-2">
              {schedule?.map((r: any) => (
                <div key={r.resource_id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{r.resource_name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{r.branch_name} · {r.opening_time?.slice(0,5)}-{r.closing_time?.slice(0,5)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Score: {r.availability_score}</span>
                    <div className="w-12 h-2 bg-gray-200 rounded-full">
                      <div className={`h-2 rounded-full ${r.availability_score > 70 ? 'bg-green-500' : r.availability_score > 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${r.availability_score}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Can>
      )}
    </div>
  );
}
