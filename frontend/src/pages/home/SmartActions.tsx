import { useNavigate } from 'react-router-dom';
import { QuickActions } from '../../components/workspace';
import { useWorkspaceStore } from '../../store/workspace.store';
import { workspaceContent } from './workspace-content';

export default function SmartActions() {
  const navigate = useNavigate();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const content = workspaceContent[activeWorkspace];

  return (
    <QuickActions
      actions={content.actions.map((a) => ({ ...a, onClick: () => navigate(a.to) }))}
      accentColor={content.accentColor}
    />
  );
}
