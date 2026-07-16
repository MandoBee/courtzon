import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useWorkspaceStore } from '../../store/workspace.store';
import { workspaceContent } from './workspace-content';
import { Button } from '../../components/ui';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getAvatarUrl(user: any): string | null {
  const url = user?.avatarUrl;
  if (!url || url === 'null' || url === 'undefined') return null;
  if (url.startsWith('http')) return url;
  return url;
}

export default function HomeHero() {
  const user = useAuthStore((s) => s.user);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const navigate = useNavigate();
  const content = workspaceContent[activeWorkspace];
  const avatarUrl = getAvatarUrl(user);

  const greeting = useMemo(getGreeting, []);
  const dateStr = useMemo(formatDate, []);

  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br ${content.gradientFrom} ${content.gradientTo} p-5 md:p-8`}
      style={{ borderLeft: `4px solid ${content.accentColor}` }}
    >
      <div className="absolute top-0 right-0 w-32 h-32 opacity-5">
        <div className="text-8xl">{content.greetingIcon}</div>
      </div>
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover ring-2 ring-[var(--color-border)]"
            />
          ) : (
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-xl">
              {user?.fullName?.charAt(0) || '👤'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--color-text-muted)] font-medium">{greeting}</p>
          <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)] mt-0.5 truncate">
            {user?.fullName || 'Player'}
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full"
              style={{ backgroundColor: `${content.accentColor}15`, color: content.accentColor }}
            >
              {content.greetingIcon} {activeWorkspace === 'resident_coach' ? 'Resident Coach' : activeWorkspace.charAt(0).toUpperCase() + activeWorkspace.slice(1)}
            </span>
            <span className="text-[11px] text-[var(--color-text-muted)]">{dateStr}</span>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <Button
          onClick={() => navigate(content.primaryCta.to)}
          className="w-full md:w-auto shadow-lg"
          style={{
            background: content.accentColor,
            border: 'none',
            color: '#fff',
          }}
        >
          {content.primaryCta.icon} {content.primaryCta.label}
        </Button>
      </div>
    </div>
  );
}
