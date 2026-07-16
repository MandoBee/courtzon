import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function sanitizeAvatar(url: string | null | undefined): string | null {
  if (!url || url === 'null' || url === 'undefined') return null;
  if (url.startsWith('http')) return url;
  return null;
}

interface Props {
  fullName?: string;
  avatarUrl?: string | null;
  workspaceLabel: string;
  greetingIcon: string;
  accentColor: string;
  gradientFrom: string;
  gradientTo: string;
  primaryCta: { label: string; icon: string; to: string };
}

export default function WorkspaceHero({
  fullName, avatarUrl, workspaceLabel, greetingIcon,
  accentColor, gradientFrom, gradientTo, primaryCta,
}: Props) {
  const navigate = useNavigate();
  const greeting = useMemo(getGreeting, []);
  const dateStr = useMemo(formatDate, []);
  const avatar = sanitizeAvatar(avatarUrl);

  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br ${gradientFrom} ${gradientTo} p-5 md:p-8`}
      style={{ borderLeft: `4px solid ${accentColor}` }}
    >
      <div className="absolute top-0 right-0 w-32 h-32 opacity-5 flex items-center justify-center">
        <span className="text-8xl">{greetingIcon}</span>
      </div>
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {avatar ? (
            <img src={avatar} alt="" className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover ring-2 ring-[var(--color-border)]" />
          ) : (
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-xl">
              {fullName?.charAt(0) || '👤'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--color-text-muted)] font-medium">{greeting}</p>
          <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)] mt-0.5 truncate">
            {fullName || 'User'}
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full"
              style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
            >
              {greetingIcon} {workspaceLabel}
            </span>
            <span className="text-[11px] text-[var(--color-text-muted)]">{dateStr}</span>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <Button
          onClick={() => navigate(primaryCta.to)}
          className="w-full md:w-auto shadow-lg"
          style={{ background: accentColor, border: 'none', color: '#fff' }}
        >
          {primaryCta.icon} {primaryCta.label}
        </Button>
      </div>
    </div>
  );
}
