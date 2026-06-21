/** Public marketing routes where the PWA install banner is shown. */
export const LANDING_INSTALL_PROMPT_PATHS = [
  '/',
  '/about',
  '/mission',
  '/team',
  '/sell-with-us',
  '/blog',
  '/contact',
] as const;

export function isLandingInstallPromptPath(pathname: string): boolean {
  if (LANDING_INSTALL_PROMPT_PATHS.includes(pathname as (typeof LANDING_INSTALL_PROMPT_PATHS)[number])) {
    return true;
  }
  return pathname.startsWith('/blog/');
}
