import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import OrganisationForm from '../../components/organisations/OrganisationForm';
import UpgradeRequestModal from '../../components/subscription/UpgradeRequestModal';
import OrgShippingRatesPage from './OrgShippingRatesPage';

type SettingsTab = 'general' | 'shipping-rates';

export default function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const { data: subscription } = useQuery<any>({
    queryKey: ['org-subscription', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription`).then(r => r.data),
    enabled: !!orgId,
  });

  if (!orgId) return <div>Invalid organisation</div>;

  const sub = subscription;
  const tabs: { key: SettingsTab; label: string; permission?: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'shipping-rates', label: 'Shipping Rates', permission: 'org.settings.shipping-rates-tab' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Organisation Settings</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {tabs.map((tab) => {
          const btn = (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {tab.label}
            </button>
          );
          return tab.permission ? <Can key={tab.key} permission={tab.permission}>{btn}</Can> : btn;
        })}
      </div>

      {activeTab === 'general' && (
        <>
      {/* Subscription Plan Card */}
      {sub && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-semibold text-[var(--color-text)]">
                {sub.planName || 'No Plan'}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                {sub.isUnlimited
                  ? 'Unlimited / One-time'
                  : sub.priceMonthly != null
                    ? `${Number(sub.priceMonthly).toFixed(0)} EGP/${sub.billingCycle || 'mo'}`
                    : sub.priceYearly != null
                      ? `${Number(sub.priceYearly).toFixed(0)} EGP/yr`
                      : 'N/A'}
                {sub.status && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                    sub.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                    sub.status === 'pending' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' :
                    'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'
                  }`}>{sub.status}</span>
                )}
              </p>
            </div>
            <Can permission="subscription.upgrade.request">
              {sub.pendingUpgrade ? (
                <span className="text-xs text-[var(--color-warning-text)] bg-[var(--color-warning-bg)] px-2 py-1 rounded-[var(--radius-md)]">
                  Pending upgrade to {sub.pendingUpgrade.planName}
                </span>
              ) : (
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium"
                >
                  Upgrade Plan
                </button>
              )}
            </Can>
          </div>

          {sub.features && sub.features.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {sub.features.map((f: any) => {
                const isNumeric = f.valueType === 'numeric';
                const limit = parseInt(f.value, 10);
                const atLimit = isNumeric && f.usage >= limit && limit > 0 && !isNaN(limit);
                return (
                  <div key={f.featureKey}
                    className={`flex items-center justify-between text-xs p-1.5 rounded ${
                      atLimit ? 'bg-[var(--color-error-bg)] border border-[var(--color-error-border)]' : 'bg-[var(--color-bg)]'
                    }`}
                  >
                    <span className="text-[var(--color-text-muted)]">{f.label}</span>
                    <span className={`font-medium ${atLimit ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'}`}>
                      {isNumeric
                        ? `${f.usage}/${f.value === '-1' || isNaN(limit) ? '∞' : f.value}${f.unit ? ' ' + f.unit : ''}`
                        : f.valueType === 'boolean'
                          ? (f.value === 'true' ? '✓' : '—')
                          : String(f.value || '—')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <OrganisationForm orgId={parseInt(orgId, 10)} context="org" onClose={() => {}} />
        </>
      )}

      {activeTab === 'shipping-rates' && (
        <Can permission="org.settings.shipping-rates-tab">
          <OrgShippingRatesPage orgId={orgId} />
        </Can>
      )}

      <UpgradeRequestModal
        orgId={parseInt(orgId, 10)}
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </div>
  );
}
