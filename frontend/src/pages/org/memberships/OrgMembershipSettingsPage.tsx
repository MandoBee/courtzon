import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipP1Api } from '../../../services/membership.p1';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

const DURATIONS = ['monthly', 'quarterly', 'semi_annual', 'annual'];
const PAYMENT_METHODS = ['cash', 'card'];

export default function OrgMembershipSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const oid = Number(orgId);
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['org-membership-settings', oid],
    queryFn: () => membershipP1Api.getOrgSettings(oid),
    enabled: !!oid,
  });

  const [enabledDurations, setEnabledDurations] = useState<string[]>(['annual']);
  const [allowedMethods, setAllowedMethods] = useState<string[]>(['cash', 'card']);
  useMemo(() => {
    if (data) {
      setEnabledDurations(data.enabled_durations?.length ? data.enabled_durations : ['annual']);
      setAllowedMethods(data.allowed_payment_methods?.length ? data.allowed_payment_methods : ['cash', 'card']);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => membershipP1Api.saveOrgSettings(oid, { enabledDurations, allowedPaymentMethods: allowedMethods }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-membership-settings', oid] }); showToast('Membership settings saved'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to save settings', 'error'),
  });

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  if (isLoading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Membership Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Organisation-wide membership configuration (G11.22 P1).</p>
      </div>

      <Can permission="membership.manage">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 space-y-2">
            <p className="text-sm font-semibold">Supported durations</p>
            <p className="text-xs text-[var(--color-text-muted)]">Durations the organisation offers (multi plans may share a duration).</p>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button key={d} type="button" onClick={() => toggle(enabledDurations, setEnabledDurations, d)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${enabledDurations.includes(d) ? 'bg-[var(--color-primary)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 space-y-2">
            <p className="text-sm font-semibold">Allowed payment methods</p>
            <p className="text-xs text-[var(--color-text-muted)]">Cash / card (or both). Channel costs remain configured by CourtZon.</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button key={m} type="button" onClick={() => toggle(allowedMethods, setAllowedMethods, m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${allowedMethods.includes(m) ? 'bg-[var(--color-primary)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
            Save Settings
          </button>
        </div>
      </Can>
    </div>
  );
}