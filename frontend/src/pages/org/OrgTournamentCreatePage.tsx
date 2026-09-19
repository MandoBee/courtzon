import { useParams } from 'react-router-dom';
import TournamentCreatePage from '../tournaments/TournamentCreatePage';

/**
 * Org Admin create-tournament screen. Thin tenant-scoped wrapper around the ONE
 * SHARED create screen; creation is enforced server-side against
 * `/org/:orgId/tournaments` so a tournament always belongs to the authorised org.
 */
export default function OrgTournamentCreatePage() {
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  return <TournamentCreatePage mode="org" orgId={orgId} />;
}