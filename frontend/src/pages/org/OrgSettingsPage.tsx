import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Can } from '../../permissions/Can';
import OrganisationForm from '../../components/organisations/OrganisationForm';
import SubscriptionCard from '../../components/subscription/SubscriptionCard';
import OrgShippingRatesPage from './OrgShippingRatesPage';

type SettingsTab = 'general' | 'shipping-rates';

export default function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  if (!orgId) return <div>Invalid organisation</div>;

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
          <SubscriptionCard orgId={parseInt(orgId, 10)} />
          <OrganisationForm orgId={parseInt(orgId, 10)} context="org" onClose={() => {}} />
        </>
      )}

      {activeTab === 'shipping-rates' && (
        <Can permission="org.settings.shipping-rates-tab">
          <OrgShippingRatesPage orgId={orgId} />
        </Can>
      )}
    </div>
  );
}
