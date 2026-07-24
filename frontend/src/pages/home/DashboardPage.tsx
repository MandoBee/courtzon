import { useEffect } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useQuery } from '@tanstack/react-query';
import HomeHero from './HomeHero';
import SmartActions from './SmartActions';
import ContinueSection from './ContinueSection';
import UpcomingSection from './UpcomingSection';
import RecommendationsSection from './RecommendationsSection';
import MarketplaceHighlights from './MarketplaceHighlights';
import RecentActivity from './RecentActivity';
import { ActionCenter, QuickActions } from '../../components/dashboard/ActionCenter';
import api from '../../services/api';

export default function DashboardPage() {
  const refreshOrganisations = useAuthStore((s) => s.refreshOrganisations);

  useEffect(() => { void refreshOrganisations(); }, [refreshOrganisations]);

  const { data: wallet } = useQuery({ queryKey: ['wallet', 'me'], queryFn: () => api.get('/wallets/me').then(r => r.data) });

  return (
    <div className="space-y-5 md:space-y-6 pb-4">
      <HomeHero />

      {/* Action Center */}
      <ActionCenter title="Pending" actions={[
        { label: 'Unread Notifications', path: '/notifications', icon: '🔔' },
        { label: 'Membership', path: '/membership', icon: '⭐' },
        { label: 'Wallet Balance', path: '/profile', icon: '💰', count: wallet?.balance ? Number(wallet.balance) : undefined },
      ]} />

      {/* Quick Actions */}
      <QuickActions actions={[
        { label: 'Book a Court', icon: '🎾', path: '/browse' },
        { label: 'Marketplace', icon: '🛒', path: '/marketplace' },
        { label: 'Coaches', icon: '👨‍🏫', path: '/coaches' },
        { label: 'Academies', icon: '🎓', path: '/academies' },
        { label: 'Tournaments', icon: '🏆', path: '/tournaments' },
        { label: 'Matches', icon: '🤝', path: '/matches' },
      ]} />

      <div className="space-y-5 md:space-y-6">
        <SmartActions />
        <ContinueSection />
        <UpcomingSection />
        <RecommendationsSection />
        <MarketplaceHighlights />
        <RecentActivity />
      </div>
    </div>
  );
}
