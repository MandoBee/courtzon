import { useParams } from 'react-router-dom';
import TournamentDetailPage from '../admin/tournament/TournamentDetailPage';

/**
 * Org Admin tournament detail screen (overview / groups / matches / standings
 * + registrations). Thin tenant-scoped wrapper around the ONE SHARED detail
 * screen; every read is guarded server-side by row-level org tenancy.
 */
export default function OrgTournamentDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  return <TournamentDetailPage mode="org" orgId={orgId} />;
}