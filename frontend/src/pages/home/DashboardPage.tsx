import { useEffect } from 'react';
import { useAuthStore } from '../../store/auth.store';
import HomeHero from './HomeHero';
import SmartActions from './SmartActions';
import ContinueSection from './ContinueSection';
import UpcomingSection from './UpcomingSection';
import RecommendationsSection from './RecommendationsSection';
import MarketplaceHighlights from './MarketplaceHighlights';
import RecentActivity from './RecentActivity';

export default function DashboardPage() {
  const refreshOrganisations = useAuthStore((s) => s.refreshOrganisations);
  useEffect(() => {
    void refreshOrganisations();
  }, [refreshOrganisations]);

  return (
    <div className="space-y-5 md:space-y-6 pb-4">
      <HomeHero />

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
