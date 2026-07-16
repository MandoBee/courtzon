import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useThemeStore } from '../../store/theme.store';
import SiteLogo from '../../components/branding/SiteLogo';
import LanguageSwitcher from '../../components/i18n/LanguageSwitcher';
import { useAppSettingsStore } from '../../store/app-settings.store';
import { useTranslation } from '../../i18n';
import api from '../../services/api';

const allNavLinks = [
  { to: '/',            labelKey: 'landing.nav.home',          cmsSlug: 'home' },
  { to: '/about',       labelKey: 'landing.nav.about',         cmsSlug: 'about' },
  { to: '/mission',     labelKey: 'landing.nav.mission',       cmsSlug: 'mission' },
  { to: '/team',        labelKey: 'landing.nav.team',          cmsSlug: 'team' },
  { to: '/sell-with-us', labelKey: 'landing.nav.sell',         cmsSlug: 'sell-with-us' },
  { to: '/blog',        labelKey: 'landing.nav.blog',          cmsSlug: 'blog' },
  { to: '/contact',     labelKey: 'landing.nav.contact',       cmsSlug: 'contact' },
] as const;

const footerPlatformLinks = [
  { to: '/about',        labelKey: 'landing.nav.about',     cmsSlug: 'about' },
  { to: '/mission',      labelKey: 'landing.nav.mission',   cmsSlug: 'mission' },
  { to: '/team',         labelKey: 'landing.nav.team',      cmsSlug: 'team' },
  { to: '/blog',         labelKey: 'landing.nav.blog',      cmsSlug: null },
  { to: '/contact',      labelKey: 'landing.nav.contact',   cmsSlug: 'contact' },
  { to: '/faq',          labelKey: 'landing.nav.faq',       cmsSlug: 'faq' },
  { to: '/sell-with-us', labelKey: 'landing.nav.sell',      cmsSlug: 'sell-with-us' },
];

const footerLegalLinks = [
  { to: '/privacy', labelKey: 'landing.privacy',  cmsSlug: 'privacy' },
  { to: '/terms',   labelKey: 'landing.terms',    cmsSlug: 'terms' },
];

function isNavActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

function filterLinks<T extends { cmsSlug: string | null }>(links: readonly T[], publishedSlugs: Set<string>): T[] {
  return links.filter((l) => l.cmsSlug === null || publishedSlugs.has(l.cmsSlug));
}

async function fetchPublishedSlugs(): Promise<Set<string>> {
  try {
    const { data } = await api.get('/public/published-pages');
    const slugs: string[] = data?.data || [];
    return new Set(slugs);
  } catch {
    return new Set();
  }
}

export default function LandingLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [publishedSlugs, setPublishedSlugs] = useState<Set<string>>(new Set());
  const { resolved: theme, setMode } = useThemeStore();
  const siteName = useAppSettingsStore((s) => s.siteName);
  const { t } = useTranslation();

  useEffect(() => {
    fetchPublishedSlugs().then(setPublishedSlugs);
  }, []);

  const visibleNavLinks = filterLinks(allNavLinks, publishedSlugs);
  const visibleFooterPlatform = filterLinks(footerPlatformLinks, publishedSlugs);
  const visibleFooterLegal = filterLinks(footerLegalLinks, publishedSlugs);

  const closeMobileMenu = () => setMobileOpen(false);

  const toggleTheme = () => {
    setMode(theme === 'dark' ? 'light' : 'dark');
    closeMobileMenu();
  };

  useEffect(() => {
    closeMobileMenu();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  const navLinkClass = (active: boolean) =>
    active
      ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-primary-bg)]/50';

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      <header className="sticky top-0 z-50 bg-[var(--color-surface)]/95 backdrop-blur-sm border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <SiteLogo to="/" size="md" className="group-hover:opacity-90 transition-opacity" />
            <nav className="hidden md:flex items-center gap-1">
              {visibleNavLinks.map((l) => {
                const active = isNavActive(location.pathname, l.to);
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${navLinkClass(active)}`}
                  >
                    {t(l.labelKey)}
                  </Link>
                );
              })}
            </nav>
            <div className="hidden md:flex items-center gap-2">
              <LanguageSwitcher />
              <button
                type="button"
                onClick={() => setMode(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-primary-bg)] transition-colors"
                title={theme === 'dark' ? t('landing.light_mode') : t('landing.dark_mode')}
              >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
              <Link
                to="/login"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  location.pathname === '/login'
                    ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text)] hover:text-[var(--color-primary)]'
                }`}
              >
                {t('landing.header.sign_in')}
              </Link>
              <Link to="/register" className="cz-on-gradient-btn px-5 py-2.5 text-sm font-semibold rounded-xl hover:opacity-90 transition-all shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]">{t('landing.header.get_started')}</Link>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 text-[var(--color-text)]"
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? t('landing.mobile.close_menu') : t('landing.mobile.open_menu')}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
            </button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 space-y-1">
            {visibleNavLinks.map((l) => {
              const active = isNavActive(location.pathname, l.to);
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={closeMobileMenu}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${navLinkClass(active)}`}
                >
                  {t(l.labelKey)}
                </Link>
              );
            })}
            <div className="flex items-center gap-3 pt-3 border-t border-[var(--color-border)]">
              <LanguageSwitcher className="flex-1" onSelect={closeMobileMenu} />
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-primary-bg)] transition-colors"
                title={theme === 'dark' ? t('landing.light_mode') : t('landing.dark_mode')}
              >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
            </div>
            <div className="flex items-center gap-3 pt-3">
              <Link
                to="/login"
                onClick={closeMobileMenu}
                className={`flex-1 text-center px-4 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl ${
                  location.pathname === '/login' ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)] border-[var(--color-primary)]' : ''
                }`}
              >
                {t('landing.header.sign_in')}
              </Link>
              <Link
                to="/register"
                onClick={closeMobileMenu}
                className={`cz-on-gradient-btn flex-1 text-center px-4 py-2.5 text-sm font-semibold rounded-xl ${
                  location.pathname.startsWith('/register') ? 'ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-[var(--color-surface)]' : ''
                }`}
              >
                {t('landing.header.get_started')}
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="bg-[var(--color-surface)] border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div className="col-span-2">
              <SiteLogo to="/" size="sm" className="mb-4" />
              <p className="text-sm text-[var(--color-text-muted)] max-w-xs">{t('landing.hero.tagline')}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-4">{t('landing.platform')}</h4>
              <div className="space-y-2.5">
                {visibleFooterPlatform.map((l) => (
                  <Link key={l.to} to={l.to} className="block text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">
                    {t(l.labelKey)}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-4">{t('landing.legal')}</h4>
              <div className="space-y-2.5">
                {visibleFooterLegal.map((l) => (
                  <Link key={l.to} to={l.to} className="block text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">
                    {t(l.labelKey)}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-4">{t('landing.connect')}</h4>
              <div className="space-y-2.5">
                <a href="mailto:support@courtzon.com" className="block text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">{t('landing.contact_email')}</a>
              </div>
            </div>
          </div>
          <div className="border-t border-[var(--color-border)] mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-text-muted)]">{t('landing.copyright', { year: new Date().getFullYear(), siteName })}</p>
            <button onClick={() => setMode(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
              {theme === 'dark' ? (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> {t('landing.light_mode')}</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg> {t('landing.dark_mode')}</>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
