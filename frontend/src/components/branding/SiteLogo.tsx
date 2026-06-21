import { Link } from 'react-router-dom';
import {
  useAppSettingsStore,
  resolveAssetUrl,
  isInlineWordmarkLogo,
  pickSiteLogoForTheme,
} from '../../store/app-settings.store';
import { useThemeStore } from '../../store/theme.store';

type Size = 'sm' | 'md' | 'lg';

const sizeClass: Record<Size, string> = {
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-10',
};

const textClass: Record<Size, string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
};

interface Props {
  to?: string;
  className?: string;
  size?: Size;
  showText?: boolean;
  /** Primary nav styling (inherits theme text color). */
  variant?: 'default' | 'primary';
}

function Wordmark({
  size,
  showText,
  siteName,
  variant,
}: {
  size: Size;
  showText: boolean;
  siteName: string;
  variant: 'default' | 'primary';
}) {
  const color = variant === 'primary' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]';
  return (
    <span className={`inline-flex items-center gap-2 ${textClass[size]} font-bold ${color}`}>
      <svg
        className={`${sizeClass[size]} w-auto flex-shrink-0`}
        viewBox="0 0 132 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9V3L4 13h6v6l8-10h-6z"
        />
        {showText && (
          <text
            x="24"
            y="20"
            fill="currentColor"
            fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
            fontSize="19"
            fontWeight="700"
          >
            {siteName}
          </text>
        )}
      </svg>
      {!showText && <span className="sr-only">{siteName}</span>}
    </span>
  );
}

export default function SiteLogo({
  to = '/',
  className = '',
  size = 'md',
  showText = true,
  variant = 'default',
}: Props) {
  const siteName = useAppSettingsStore((s) => s.siteName);
  const siteLogoLightUrl = useAppSettingsStore((s) => s.siteLogoLightUrl);
  const siteLogoDarkUrl = useAppSettingsStore((s) => s.siteLogoDarkUrl);
  const theme = useThemeStore((s) => s.resolved);

  const activeUrl = pickSiteLogoForTheme(siteLogoLightUrl, siteLogoDarkUrl, theme);
  const useUploadedImage = activeUrl && !isInlineWordmarkLogo(activeUrl);

  const content = useUploadedImage ? (
    <img
      src={resolveAssetUrl(activeUrl)}
      alt={siteName}
      className={`${sizeClass[size]} w-auto max-w-[220px] object-contain object-left`}
    />
  ) : (
    <Wordmark size={size} showText={showText} siteName={siteName} variant={variant} />
  );

  const colorClass = variant === 'primary' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]';

  return (
    <Link to={to} className={`inline-flex items-center group ${colorClass} ${className}`}>
      {content}
    </Link>
  );
}
