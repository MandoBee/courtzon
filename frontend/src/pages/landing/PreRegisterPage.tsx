import { Link } from 'react-router-dom';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import SiteBrand from '../../components/branding/SiteBrand';
import { useTranslation } from '../../i18n';

const options = [
  {
    type: 'player',
    titleKey: 'landing.register.for_players',
    descKey: 'landing.register.for_players_desc',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    link: '/register/player',
    color: 'from-emerald-500 to-emerald-600',
    flag: 'player.registration_enabled',
  },
  {
    type: 'organization',
    titleKey: 'landing.register.for_orgs',
    descKey: 'landing.register.for_orgs_desc',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    link: '/register/organization',
    color: 'from-blue-500 to-blue-600',
    flag: 'organization.registration_enabled',
  },
  {
    type: 'seller',
    titleKey: 'landing.register.for_sellers',
    descKey: 'landing.register.for_sellers_desc',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
    ),
    link: '/register/seller',
    color: 'from-purple-500 to-purple-600',
    flag: 'seller.registration_enabled',
  },
];

export default function PreRegisterPage() {
  const playerEnabled = useFeatureFlag('player.registration_enabled');
  const sellerEnabled = useFeatureFlag('seller.registration_enabled');
  const orgEnabled = useFeatureFlag('organization.registration_enabled');
  const { t } = useTranslation();

  const flagMap: Record<string, boolean> = {
    'player.registration_enabled': playerEnabled,
    'seller.registration_enabled': sellerEnabled,
    'organization.registration_enabled': orgEnabled,
  };

  const visibleOptions = options.filter((opt) => flagMap[opt.flag] !== false);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-6">
            {t('landing.back_home')}
          </Link>
          <SiteBrand className="mb-4" subtitle={t('landing.register.choose_title')} />
        </div>

        <div className={`grid grid-cols-1 gap-6 ${visibleOptions.length === 2 ? 'md:grid-cols-2 max-w-2xl mx-auto' : visibleOptions.length === 1 ? 'md:grid-cols-1 max-w-md mx-auto' : 'md:grid-cols-3'}`}>
          {visibleOptions.map((opt) => (
            <Link
              key={opt.type}
              to={opt.link}
              className="group bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${opt.color} flex items-center justify-center text-white mb-5 group-hover:scale-110 transition-transform`}>
                {opt.icon}
              </div>
              <h3 className="text-xl font-bold text-[var(--color-text)] mb-2">{t(opt.titleKey)}</h3>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{t(opt.descKey)}</p>
              <div className="mt-6 flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] group-hover:gap-2 transition-all">
                {t('landing.register.get_started')}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </div>
            </Link>
          ))}
        </div>

        <p className="text-center mt-8 text-sm text-[var(--color-text-muted)]">
          {t('landing.register.already_account')} <Link to="/login" className="text-[var(--color-primary)] font-medium hover:underline">{t('landing.register.sign_in')}</Link>
        </p>
      </div>
    </div>
  );
}
