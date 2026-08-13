import { useParams } from 'react-router-dom';
import OrganisationForm from '../../components/organisations/OrganisationForm';

export default function OrgProfilePage() {
  const { orgId } = useParams<{ orgId: string }>();

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;

  return (
    <OrganisationForm
      orgId={Number(orgId)}
      context="org"
      onClose={() => {}}
      initialTab="basic"
      tabs={['basic']}
      variant="page"
      pageTitle="Profile & Settings"
    />
  );
}
