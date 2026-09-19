import { useParams } from 'react-router-dom';
import TournamentListPage from '../admin/tournament/TournamentListPage';

/**
 * Org Admin tournament home. A thin tenant-scoped wrapper around the ONE SHARED
 * tournament list screen — same component the Super Admin workbench uses, but
 * routed through the `/org/:orgId/tournaments` tenant-scoped API with
 * `org.tournaments.*` permissions.
 */
export default function OrgTournamentsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  return <TournamentListPage mode="org" orgId={orgId} />;
}