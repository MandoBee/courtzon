import { WorkspaceHero } from '../../components/workspace';
import { useAuthStore } from '../../store/auth.store';
import { useWorkspaceStore } from '../../store/workspace.store';
import { workspaceContent } from './workspace-content';

export default function HomeHero() {
  const user = useAuthStore((s) => s.user);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const content = workspaceContent[activeWorkspace];

  return (
    <WorkspaceHero
      fullName={user?.fullName}
      avatarUrl={user?.avatarUrl}
      workspaceLabel={activeWorkspace === 'resident_coach' ? 'Resident Coach' : activeWorkspace.charAt(0).toUpperCase() + activeWorkspace.slice(1)}
      greetingIcon={content.greetingIcon}
      accentColor={content.accentColor}
      gradientFrom={content.gradientFrom}
      gradientTo={content.gradientTo}
      primaryCta={content.primaryCta}
    />
  );
}
