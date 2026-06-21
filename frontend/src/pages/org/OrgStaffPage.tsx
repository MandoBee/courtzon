import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { EntityImage } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import UpgradeRequestModal from '../../components/subscription/UpgradeRequestModal';

const ROLE_OPTIONS = [
  { slug: 'org-admin', label: 'Org Admin' },
  { slug: 'branch-mgr', label: 'Branch Manager' },
  { slug: 'resource-mgr', label: 'Resource Manager' },
  { slug: 'shop-admin', label: 'Shop Admin' },
  { slug: 'coach', label: 'Coach' },
  { slug: 'accountant', label: 'Accountant' },
];

const roleLabel = (slug: string) => ROLE_OPTIONS.find((r) => r.slug === slug)?.label || slug;
const scopeSummary = (branchIds: number[], resourceIds: number[], branches: any[], resources: any[]) => {
  const parts: string[] = [];
  if (branchIds.length === 0 && resourceIds.length === 0) return 'All branches & resources';
  if (branchIds.length > 0) {
    const names = branchIds.map((id) => branches.find((b: any) => b.id === id)?.name || `#${id}`).join(', ');
    parts.push(`${branchIds.length} branch${branchIds.length > 1 ? 'es' : ''} (${names})`);
  }
  if (resourceIds.length > 0) {
    const names = resourceIds.map((id) => resources.find((r: any) => r.id === id)?.name || `#${id}`).join(', ');
    parts.push(`${resourceIds.length} resource${resourceIds.length > 1 ? 's' : ''} (${names})`);
  }
  return parts.join('; ') || 'None';
};

interface TemplatePerm {
  id: number;
  permission_key: string;
  element_label: string | null;
}

export default function OrgStaffPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();

  // Add Staff modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleSlug, setRoleSlug] = useState('org-admin');
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [selectedPermIds, setSelectedPermIds] = useState<number[]>([]);
  const [templatePerms, setTemplatePerms] = useState<TemplatePerm[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Edit Staff modal (role + scopes + permissions)
  const [editStaffOpen, setEditStaffOpen] = useState(false);
  const [editStaffUserId, setEditStaffUserId] = useState<number | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffRoleSlug, setEditStaffRoleSlug] = useState('org-admin');
  const [editStaffBranchIds, setEditStaffBranchIds] = useState<number[]>([]);
  const [editStaffResourceIds, setEditStaffResourceIds] = useState<number[]>([]);
  const [editStaffPermsList, setEditStaffPermsList] = useState<TemplatePerm[]>([]);
  const [editStaffPermsSelected, setEditStaffPermsSelected] = useState<number[]>([]);
  const [editStaffRoleName, setEditStaffRoleName] = useState('');

  const { data: staff, isLoading } = useQuery({
    queryKey: ['org-staff', orgId],
    queryFn: () => api.get(`/org/${orgId}/staff`).then((r) => r.data?.data || []),
    enabled: !!orgId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['org-branches', orgId],
    queryFn: () => api.get(`/org/${orgId}/branches`).then((r) => r.data || []),
    enabled: !!orgId,
  });

  const { data: resources = [] } = useQuery({
    queryKey: ['org-resources', orgId],
    queryFn: () => api.get(`/org/${orgId}/resources`).then((r) => r.data || []),
    enabled: !!orgId,
  });

  const { data: templateRolePerms } = useQuery({
    queryKey: ['role-template-perms', roleSlug, orgId],
    queryFn: () =>
      api
        .get(`/org/${orgId}/role-templates/${roleSlug}/permissions`)
        .then((r) => r.data.data as { roleId: number; permissions: TemplatePerm[] }),
    enabled: !!orgId && inviteOpen,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['org-staff', orgId] });
  const errMsg = (err: any) => err?.response?.data?.message || err?.message || 'Request failed';

  const toggleId = (id: number, list: number[], setter: (v: number[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  useEffect(() => {
    if (templateRolePerms?.permissions) {
      setTemplatePerms(templateRolePerms.permissions);
      setSelectedPermIds(templateRolePerms.permissions.map((p) => p.id));
    } else {
      setTemplatePerms([]);
      setSelectedPermIds([]);
    }
  }, [templateRolePerms, roleSlug]);

  const addMutation = useMutation({
    mutationFn: () => {
      const body: any = { email: email.trim(), roleSlug };
      if (selectedBranchIds.length > 0) body.branchIds = selectedBranchIds;
      if (selectedResourceIds.length > 0) body.resourceIds = selectedResourceIds;
      body.permissionIds = selectedPermIds;
      return api.post(`/org/${orgId}/staff`, body);
    },
    onSuccess: () => {
      invalidate();
      setInviteOpen(false);
      setEmail('');
      setSelectedBranchIds([]);
      setSelectedResourceIds([]);
      setSelectedPermIds([]);
      setTemplatePerms([]);
      showToast('Staff member added');
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) {
        showToast(errMsg(err), 'warning');
        setShowUpgradeModal(true);
      } else {
        showToast('Failed to add staff: ' + errMsg(err), 'error');
      }
    },
  });

  const editStaffMutation = useMutation({
    mutationFn: async ({ userId, slug, branchIds, resourceIds, permissionIds }: { userId: number; slug: string; branchIds: number[]; resourceIds: number[]; permissionIds: number[] }) => {
      await api.put(`/org/${orgId}/staff/${userId}`, { roleSlug: slug, branchIds: branchIds.length > 0 ? branchIds : undefined, resourceIds: resourceIds.length > 0 ? resourceIds : undefined });
      await api.put(`/org/${orgId}/staff/${userId}/permissions`, { permissionIds });
    },
    onSuccess: () => { invalidate(); setEditStaffOpen(false); showToast('Staff updated'); },
    onError: (err) => showToast('Failed to update: ' + errMsg(err), 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => api.delete(`/org/${orgId}/staff/${userId}`),
    onSuccess: () => { invalidate(); showToast('Staff member removed', 'warning'); },
    onError: (err) => showToast('Failed to remove staff: ' + errMsg(err), 'error'),
  });

  const openEditStaff = async (s: any) => {
    try {
      const r = await api.get(`/org/${orgId}/staff/${s.user_id}/permissions`);
      const data = r.data.data as {
        permissions: TemplatePerm[];
        templatePermissions: TemplatePerm[];
        roleName: string;
      };
      const referencePerms = data.templatePermissions && data.templatePermissions.length > 0
        ? data.templatePermissions
        : data.permissions;
      const currentIds = new Set(data.permissions.map((p) => p.id));
      setEditStaffPermsList(referencePerms);
      setEditStaffPermsSelected(referencePerms.filter((p) => currentIds.has(p.id)).map((p) => p.id));
      setEditStaffUserId(s.user_id);
      setEditStaffName(s.full_name || s.email);
      setEditStaffRoleSlug(s.role_slug);
      setEditStaffBranchIds(s.branch_ids || []);
      setEditStaffResourceIds(s.resource_ids || []);
      setEditStaffRoleName(data.roleName || roleLabel(s.role_slug));
      setEditStaffOpen(true);
    } catch (err: any) {
      showToast('Failed to load staff data: ' + errMsg(err), 'error');
    }
  };

  // Filter resources by branch for grouped display
  const resourcesByBranch = (branchId: number) =>
    Array.isArray(resources) ? resources.filter((r: any) => r.branch_id === branchId) : [];

  const getPermLabel = (p: TemplatePerm) => p.element_label || p.permission_key;

  const groupedPerms = (perms: TemplatePerm[]) =>
    perms.reduce((acc: Record<string, TemplatePerm[]>, p) => {
      const group = p.permission_key.split('.').slice(0, 2).join('.');
      if (!acc[group]) acc[group] = [];
      acc[group].push(p);
      return acc;
    }, {});

  if (!orgId) return <div>Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-border)] bg-[var(--color-surface)] rounded-xl" />;

  const renderPermsList = (perms: TemplatePerm[], selected: number[], onToggle: (id: number) => void) => {
    const groups = groupedPerms(perms);
    return (
      <div className="max-h-64 overflow-y-auto space-y-2">
        {Object.entries(groups).map(([group, groupPerms]) => (
          <div key={group}>
            <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1">{group}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
              {groupPerms.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-[var(--color-primary)]">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => onToggle(p.id)}
                    className="accent-[var(--color-primary)] shrink-0"
                  />
                  <span className="text-[var(--color-text)] truncate">{getPermLabel(p)}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderScopeCheckboxes = (
    branchIds: number[],
    resourceIds: number[],
    onToggleBranch: (id: number) => void,
    onToggleResource: (id: number) => void,
  ) => (
    <div className="max-h-64 overflow-y-auto space-y-3 border border-[var(--color-border)] rounded-md p-3">
      {Array.isArray(branches) && branches.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">No branches available</p>
      )}
      {Array.isArray(branches) && branches.map((b: any) => {
        const branchResources = resourcesByBranch(b.id);
        return (
          <div key={b.id}>
            <label className="flex items-center gap-2 text-sm cursor-pointer font-medium">
              <input type="checkbox" checked={branchIds.includes(b.id)} onChange={() => onToggleBranch(b.id)} className="accent-[var(--color-primary)]" />
              {b.name}
            </label>
            {branchResources.length > 0 && (
              <div className="ml-6 mt-1 space-y-1">
                {branchResources.map((r: any) => (
                  <label key={r.id} className="flex items-center gap-2 text-xs cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                    <input type="checkbox" checked={resourceIds.includes(r.id)} onChange={() => onToggleResource(r.id)} className="accent-[var(--color-primary)]" />
                    {r.name} {r.sport_name ? `(${r.sport_name})` : ''}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Staff</h1>
        <Can permission="org.staff.manage">
          <button onClick={() => { setEmail(''); setRoleSlug('org-admin'); setSelectedBranchIds([]); setSelectedResourceIds([]); setSelectedPermIds([]); setTemplatePerms([]); setInviteOpen(true); }}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90">
            + Add Staff
          </button>
        </Can>
      </div>

      <p className="text-sm text-[var(--color-text-muted)]">
        Add registered users as staff and control their access level. The organisation owner always has full access and is not listed here.
      </p>

      {!staff?.length ? (
        <p className="text-[var(--color-text-muted)]">No staff members yet.</p>
      ) : (
        <div className="grid gap-3">
          {staff.map((s: any) => (
            <div key={`${s.user_id}-${s.role_slug}`} className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <EntityImage
                  src={s.avatar_url}
                  name={s.full_name || s.email || 'User'}
                  className="w-9 h-9 rounded-full text-sm"
                />
                <div className="min-w-0">
                  <p className="font-medium text-[var(--color-text)] truncate">{s.full_name || '—'}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">{s.email}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {roleLabel(s.role_slug)} &middot; {scopeSummary(s.branch_ids || [], s.resource_ids || [], branches, resources)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Can permission="org.staff.manage">
                  <button onClick={() => openEditStaff(s)} className="px-3 py-1.5 text-xs border rounded-md hover:bg-[var(--color-primary)]/10 font-medium">
                    Edit
                  </button>
                  <button onClick={() => { if (confirm(`Remove ${s.full_name || s.email} from this organisation?`)) removeMutation.mutate(s.user_id); }}
                    className="text-sm text-[var(--color-error)] hover:underline">
                    Remove
                  </button>
                </Can>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Staff Modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Add Staff Member">
        <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Email of registered user *</span>
            <input
              required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Role *</span>
            <select value={roleSlug} onChange={(e) => { setRoleSlug(e.target.value); setSelectedBranchIds([]); setSelectedResourceIds([]); }}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]">
              {ROLE_OPTIONS.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
            </select>
          </label>

          {/* Scope selection — shown for all roles */}
          <fieldset>
            <legend className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Scope (branches & resources) — leave empty for full org access
            </legend>
            {renderScopeCheckboxes(
              selectedBranchIds,
              selectedResourceIds,
              (id) => toggleId(id, selectedBranchIds, setSelectedBranchIds),
              (id) => toggleId(id, selectedResourceIds, setSelectedResourceIds),
            )}
          </fieldset>

          {templatePerms.length > 0 && (
            <fieldset className="border border-[var(--color-border)] rounded-md p-3">
              <legend className="text-xs font-medium text-[var(--color-text-muted)] px-1 flex items-center gap-2">
                Permissions for {roleLabel(roleSlug)}
                <button type="button" onClick={() => setSelectedPermIds(templatePerms.map((p) => p.id))} className="text-[var(--color-primary)] hover:underline text-xs">Select all</button>
                <button type="button" onClick={() => setSelectedPermIds([])} className="text-[var(--color-primary)] hover:underline text-xs">Deselect all</button>
              </legend>
              {renderPermsList(templatePerms, selectedPermIds, (id) => toggleId(id, selectedPermIds, setSelectedPermIds))}
            </fieldset>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setInviteOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
            <button type="submit" disabled={addMutation.isPending}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {addMutation.isPending ? 'Adding…' : 'Add Staff'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Staff Modal (role + scopes + permissions) */}
      <Modal open={editStaffOpen} onClose={() => setEditStaffOpen(false)} title="Edit Staff">
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Editing <strong className="text-[var(--color-text)]">{editStaffName}</strong>
          </p>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Role</span>
            <select value={editStaffRoleSlug} onChange={(e) => { setEditStaffRoleSlug(e.target.value); setEditStaffBranchIds([]); setEditStaffResourceIds([]); }}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]">
              {ROLE_OPTIONS.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
            </select>
          </label>
          <fieldset>
            <legend className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Scope (branches & resources) — leave empty for full org access
            </legend>
            {renderScopeCheckboxes(
              editStaffBranchIds,
              editStaffResourceIds,
              (id) => toggleId(id, editStaffBranchIds, setEditStaffBranchIds),
              (id) => toggleId(id, editStaffResourceIds, setEditStaffResourceIds),
            )}
          </fieldset>
          {editStaffPermsList.length > 0 && (
            <fieldset className="border border-[var(--color-border)] rounded-md p-3">
              <legend className="text-xs font-medium text-[var(--color-text-muted)] px-1 flex items-center gap-2">
                Permissions for {editStaffRoleName}
                <button type="button" onClick={() => setEditStaffPermsSelected(editStaffPermsList.map((p) => p.id))} className="text-[var(--color-primary)] hover:underline text-xs">Select all</button>
                <button type="button" onClick={() => setEditStaffPermsSelected([])} className="text-[var(--color-primary)] hover:underline text-xs">Deselect all</button>
              </legend>
              {renderPermsList(editStaffPermsList, editStaffPermsSelected, (id) => toggleId(id, editStaffPermsSelected, setEditStaffPermsSelected))}
            </fieldset>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditStaffOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
            <button
              type="button"
              onClick={() => editStaffMutation.mutate({
                userId: editStaffUserId!,
                slug: editStaffRoleSlug,
                branchIds: editStaffBranchIds,
                resourceIds: editStaffResourceIds,
                permissionIds: editStaffPermsSelected,
              })}
              disabled={editStaffMutation.isPending}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {editStaffMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      <UpgradeRequestModal
        orgId={parseInt(orgId!, 10)}
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        triggerMessage={addMutation.error ? errMsg(addMutation.error) : undefined}
      />
    </div>
  );
}
