import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';

export default function RoleListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', organisationId: null as number | null });
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [selectedPerms, setSelectedPerms] = useState<number[]>([]);
  const [permSearch, setPermSearch] = useState('');
  const [permTypeFilter, setPermTypeFilter] = useState<string>('all');
  const [permModuleFilter, setPermModuleFilter] = useState<string>('all');
  const [permSelectFilter, setPermSelectFilter] = useState<string>('all');
  const [sourceRoleId, setSourceRoleId] = useState<number | null>(null);

  const [roleSearch, setRoleSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showDeleted, setShowDeleted] = useState(false);

  const { data: roles } = useQuery({
    queryKey: ['admin', 'roles', showDeleted],
    queryFn: () => api.get(`/roles?includeDeleted=${showDeleted}`).then((r: any) => r.data.data),
  });

  const { data: permModules } = useQuery({
    queryKey: ['admin', 'permission-modules'],
    queryFn: () => api.get('/permission-modules').then((r: any) => r.data.data),
  });

  const { data: allPerms } = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => api.get('/permissions').then((r: any) => r.data.data),
  });

  const { data: organisations } = useQuery({
    queryKey: ['admin', 'organisations', 'all'],
    queryFn: () => api.get('/organisations').then((r: any) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/roles', { ...data, organisationId: form.organisationId });
      const newRole = res.data;
      if (selectedPerms.length > 0 && newRole?.id) {
        await api.put(`/roles/${newRole.id}/permissions`, { permissionIds: selectedPerms });
      }
      return newRole;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }); setShowCreate(false); setForm({ name: '', slug: '', description: '', organisationId: null }); setSourceRoleId(null); setSelectedRole(null); setSelectedPerms([]); showToast('Role created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/roles/${id}`, { ...data, organisationId: form.organisationId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }); setEditingRole(null); setForm({ name: '', slug: '', description: '', organisationId: null }); showToast('Role updated successfully!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/roles/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }); showToast('Role deleted!'); },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => api.put(`/roles/${id}/restore`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }); showToast('Role restored successfully!'); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/roles/${id}`, { isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }); showToast('Status updated!'); },
  });

  const assignPermsMutation = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: number; permissionIds: number[] }) =>
      api.put(`/roles/${roleId}/permissions`, { permissionIds }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }); showToast('Permissions saved!'); },
  });

  const loadRolePermissions = async (role: any) => {
    const res = await api.get(`/roles/${role.id}`);
    setSelectedRole(res.data);
    const validIds = new Set((allPerms || []).map((p: any) => p.id));
    const permIds = (res.data.permissionIds || []).filter((id: number) => validIds.has(id));
    setSelectedPerms(permIds);
    setPermSearch('');
  };

  const togglePermission = (permId: number) => {
    setSelectedPerms((prev: any) =>
      prev.includes(permId) ? prev.filter((id: any) => id !== permId) : [...prev, permId]
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    updateMutation.mutate({ id: editingRole.id, data: form });
  };

  const openEdit = (role: any) => {
    setEditingRole(role);
    setForm({ name: role.name, slug: role.slug, description: role.description || '', organisationId: role.organisation_id || null });
    setShowCreate(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelForm = () => {
    setShowCreate(false);
    setEditingRole(null);
    setForm({ name: '', slug: '', description: '', organisationId: null });
    setSourceRoleId(null);
    setSelectedRole(null);
    setSelectedPerms([]);
  };

  const handleCopyPermissions = async (roleId: number | null) => {
    setSourceRoleId(roleId);
    if (!roleId) { setSelectedRole(null); setSelectedPerms([]); return; }
    const role = roles?.find((r: any) => r.id === roleId);
    if (role) {
      loadRolePermissions(role);
    }
  };

  const permissionsByModule = (moduleId: number) =>
    allPerms?.filter((p: any) => p.module_id === moduleId) || [];

  const filteredRoles = useMemo(() => {
    if (!roles) return [];
    return roles.filter((r: any) => {
      if (roleSearch && !r.name.toLowerCase().includes(roleSearch.toLowerCase()) && !r.slug.toLowerCase().includes(roleSearch.toLowerCase())) return false;
      if (orgFilter !== 'all') {
        if (orgFilter === 'global' && r.organisation_id !== null) return false;
        if (orgFilter !== 'global' && String(r.organisation_id) !== orgFilter) return false;
      }
      if (statusFilter === 'active' && !r.is_active) return false;
      if (statusFilter === 'inactive' && r.is_active) return false;
      return true;
    });
  }, [roles, roleSearch, orgFilter, statusFilter]);

  const groupedRoles = useMemo(() => {
    const groups: Record<string, { orgName: string; isSystem: boolean; roles: any[] }> = {};
    for (const r of filteredRoles) {
      const key = r.organisation_id ? String(r.organisation_id) : r.is_system ? '__system' : '__global';
      if (!groups[key]) {
        groups[key] = {
          orgName: r.organisation_name || (r.is_system ? 'System' : 'CourtZon (global)'),
          isSystem: !!r.is_system,
          roles: [],
        };
      }
      groups[key].roles.push(r);
    }
    return Object.entries(groups);
  }, [filteredRoles]);

  const filteredModules = useMemo(() => {
    if (!permModules) return [];
    return permModules.filter((mod: any) => {
      if (permModuleFilter !== 'all' && mod.slug !== permModuleFilter) return false;
      let modPerms = permissionsByModule(mod.id);
      const q = permSearch.trim().toLowerCase();
      if (q) {
        modPerms = modPerms.filter((p: any) =>
          p.permission_key.toLowerCase().includes(q) ||
          (p.element_label || '').toLowerCase().includes(q)
        );
      }
      if (permTypeFilter !== 'all') {
        modPerms = modPerms.filter((p: any) => p.element_type === permTypeFilter);
      }
      return modPerms.length > 0;
    });
  }, [permModules, allPerms, permSearch, permTypeFilter, permModuleFilter]);

  const selectAllInModule = (moduleId: number, checked: boolean) => {
    const modPerms = permissionsByModule(moduleId).map((p: any) => p.id);
    if (checked) {
      setSelectedPerms(prev => [...new Set([...prev, ...modPerms])]);
    } else {
      setSelectedPerms(prev => prev.filter(id => !modPerms.includes(id)));
    }
  };

  const isSubmittable = form.name && form.slug;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Roles & Permissions</h1>
        <Can permission="roles.create">
          <button onClick={() => { cancelForm(); setShowCreate(true); }}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
            + New Role
          </button>
        </Can>
      </div>

      {showCreate && (
        <form onSubmit={editingRole ? handleEdit : handleCreate} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-6">
          <h3 className="font-semibold text-[var(--color-text)] mb-3">{editingRole ? 'Edit Role' : 'New Role'}</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.roles.name_label')}</label>
              <input type="text" value={form.name}
                onChange={(e: any) => { const s = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''); setForm(f => ({ ...f, name: e.target.value, slug: s })); }}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border bg-[var(--color-bg)] text-sm" required />
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Organisation</label>
              <select value={form.organisationId ?? ''} onChange={(e: any) => setForm(f => ({ ...f, organisationId: e.target.value ? Number(e.target.value) : null }))}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border bg-[var(--color-bg)] text-sm">
                <option value="">— CourtZon (global) —</option>
                {organisations?.map((o: any) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            {!editingRole && (
              <div className="flex-1">
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Copy permissions from</label>
                <select value={sourceRoleId ?? ''} onChange={(e: any) => handleCopyPermissions(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border bg-[var(--color-bg)] text-sm">
                  <option value="">— None —</option>
                  {roles?.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name}{r.organisation_name ? ` (${r.organisation_name})` : r.is_system ? ' (System)' : ''}</option>
                  ))}
                </select>
                {selectedPerms.length > 0 && sourceRoleId && <p className="text-[10px] text-[var(--color-success-text)] mt-0.5">{selectedPerms.length} permissions copied — review on the right</p>}
              </div>
            )}
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Description</label>
              <input type="text" value={form.description} onChange={(e: any) => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border bg-[var(--color-bg)] text-sm" />
            </div>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !isSubmittable}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm disabled:opacity-50">
              {editingRole ? 'Save' : 'Create'}
            </button>
            <button type="button" onClick={cancelForm}
              className="px-4 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Roles List */}
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="p-4 border-b space-y-3">
            <h2 className="font-semibold text-[var(--color-text)]">{t('admin.roles.title')}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="text" placeholder={t('admin.roles.search_placeholder')} value={roleSearch} onChange={e => setRoleSearch(e.target.value)}
                className="px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs w-40" />
              <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)}
                className="px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                <option value="all">All Orgs</option>
                <option value="global">CourtZon (global)</option>
                {organisations?.map((o: any) => (
                  <option key={o.id} value={String(o.id)}>{o.name}</option>
                ))}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                <option value="all">All Status</option>
                <option value="active">{t('common.active')}</option>
                <option value="inactive">{t('common.inactive')}</option>
              </select>
              {filteredRoles.length !== roles?.length && (
                <span className="text-[10px] text-[var(--color-text-muted)]">{filteredRoles.length} of {roles?.length} roles</span>
              )}
              <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[var(--color-text-muted)] ml-auto">
                <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)}
                  className="rounded border-[var(--color-border)]" />
                Show deleted
              </label>
            </div>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {groupedRoles.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No roles match your filters</div>
            )}
            {groupedRoles.map(([key, group]) => (
              <div key={key}>
                <div className="sticky top-0 z-10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-bg)] border-b flex items-center gap-1.5">
                  {group.orgName}
                  {group.isSystem && <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-info-bg)] text-[var(--color-info-text)]">SYS</span>}
                </div>
                {group.roles.map((role: any) => {
                  const isDeleted = !!role.deleted_at;
                  return (
                    <div key={role.id}
                      className={`px-4 py-2.5 flex items-center hover:bg-[var(--color-bg)]/50 cursor-pointer transition-colors ${selectedRole?.id === role.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'} ${isDeleted ? 'opacity-60' : ''}`}
                      onClick={() => !isDeleted && loadRolePermissions(role)}>
                      <div className={`flex-[2] min-w-0 ${isDeleted ? 'line-through' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-[var(--color-text)]">{role.name}</p>
                          {role.is_system && <span className="text-[9px] px-1 py-0.5 rounded font-medium bg-[var(--color-info-bg)] text-[var(--color-info-text)] leading-none">SYS</span>}
                          {isDeleted && <span className="text-[9px] px-1 py-0.5 rounded font-medium bg-[var(--color-error-bg)] text-[var(--color-error-text)] leading-none">Deleted</span>}
                        </div>
                      </div>
                      <div className={`flex-1 text-xs text-[var(--color-text-muted)] ${isDeleted ? 'line-through' : ''}`}>
                        {role.organisation_name || (role.is_system ? 'System' : 'CourtZon')}
                      </div>
                      <div className="w-[90px] text-center" onClick={e => !isDeleted && e.stopPropagation()}>
                        {!isDeleted && !role.is_system ? (
                          <Can permission="roles.toggle-active">
                            <button onClick={() => toggleActiveMutation.mutate({ id: role.id, isActive: !role.is_active })}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${role.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:bg-[var(--color-error-bg)] hover:text-[var(--color-error-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:bg-[var(--color-success-bg)] hover:text-[var(--color-success-text)]'}`}>
                              {role.is_active ? t('common.active') : t('common.inactive')}
                            </button>
                          </Can>
                        ) : !isDeleted ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-[var(--color-success-bg)] text-[var(--color-success-text)]">{t('common.active')}</span>
                        ) : null}
                      </div>
                      <div className="w-[100px] flex items-center justify-end gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {isDeleted ? (
                          <Can permission="roles.restore">
                            <button onClick={() => { if (confirm(`Restore role "${role.name}"?`)) restoreMutation.mutate(role.id); }}
                              className="text-[10px] px-2 py-1 border rounded-[var(--radius-md)] text-[var(--color-success-text)] hover:bg-[var(--color-success-bg)] border-[var(--color-border)]">
                              Undelete
                            </button>
                          </Can>
                        ) : !role.is_system && (
                          <>
                            <Can permission="roles.edit">
                              <button onClick={() => openEdit(role)}
                                className="text-[10px] px-2 py-1 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">{t('common.edit')}</button>
                            </Can>
                            <Can permission="roles.delete">
                              <button onClick={() => { if (confirm(`Delete role "${role.name}"?`)) deleteMutation.mutate(role.id); }}
                                className="text-[10px] px-2 py-1 border rounded-[var(--radius-md)] text-[var(--color-error)] hover:bg-red-50">Del</button>
                            </Can>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Permissions Panel */}
        {selectedRole && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-[var(--color-text)]">
                {showCreate && sourceRoleId
                  ? `New Role — Permissions (from ${selectedRole.name})`
                  : `${selectedRole.name} — Permissions`}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="text" placeholder={t('admin.roles.search_generic')} value={permSearch} onChange={e => setPermSearch(e.target.value)}
                  className="px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs w-32" />
                <select value={permTypeFilter} onChange={e => setPermTypeFilter(e.target.value)}
                  className="px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                  <option value="all">All Types</option>
                  <option value="page">Pages</option>
                  <option value="tab">Tabs</option>
                  <option value="button">Buttons</option>
                  <option value="section">Sections</option>
                  <option value="action">Actions</option>
                  <option value="field">Fields</option>
                </select>
                <select value={permModuleFilter} onChange={e => setPermModuleFilter(e.target.value)}
                  className="px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                  <option value="all">All Modules</option>
                  {(permModules || []).map((m: any) => (
                    <option key={m.id} value={m.slug}>{m.slug}</option>
                  ))}
                </select>
                <select value={permSelectFilter} onChange={e => setPermSelectFilter(e.target.value)}
                  className="px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                  <option value="all">All Permissions</option>
                  <option value="selected">Selected Only</option>
                  <option value="unselected">Unselected Only</option>
                </select>
                {!showCreate && (
                  <Can permission="roles.assign-permissions">
                    <div className="flex items-center gap-2">
                      <button onClick={() => assignPermsMutation.mutate({ roleId: selectedRole.id, permissionIds: selectedPerms })}
                        disabled={assignPermsMutation.isPending}
                        className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50">
                        {assignPermsMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </Can>
                )}
              </div>
            </div>
            <div className="p-4 max-h-[500px] overflow-y-auto space-y-4">
              {filteredModules.map((mod: any) => {
                let modPerms = permissionsByModule(mod.id);
                const q = permSearch.trim().toLowerCase();
                if (q) {
                  modPerms = modPerms.filter((p: any) =>
                    p.permission_key.toLowerCase().includes(q) ||
                    (p.element_label || '').toLowerCase().includes(q)
                  );
                }
                if (permTypeFilter !== 'all') {
                  modPerms = modPerms.filter((p: any) => p.element_type === permTypeFilter);
                }
                if (permSelectFilter === 'selected') {
                  modPerms = modPerms.filter((p: any) => selectedPerms.includes(p.id));
                }
                if (permSelectFilter === 'unselected') {
                  modPerms = modPerms.filter((p: any) => !selectedPerms.includes(p.id));
                }
                const matchingPerms = modPerms;
                if (!matchingPerms.length) return null;
                const allSelected = matchingPerms.every((p: any) => selectedPerms.includes(p.id));
                const someSelected = matchingPerms.some((p: any) => selectedPerms.includes(p.id));
                return (
                  <div key={mod.id}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{mod.slug}</h3>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                        <input type="checkbox"
                          checked={allSelected}
                          ref={(el: any) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                          onChange={() => selectAllInModule(mod.id, !allSelected)}
                          className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </label>
                    </div>
                    <div className="space-y-1">
                      {matchingPerms.map((perm: any) => {
                        const typeColors: Record<string, string> = {
                          page: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                          tab: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
                          button: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
                          section: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                          action: 'bg-[var(--color-border)] text-[var(--color-text)]  text-[var(--color-text-muted)]',
                          field: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
                        };
                        return (
                        <label key={perm.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                          <input type="checkbox" checked={selectedPerms.includes(perm.id)}
                            onChange={() => togglePermission(perm.id)}
                            className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {perm.element_label && <span className="text-sm font-medium text-[var(--color-text)]">{perm.element_label}</span>}
                              {perm.element_type && (
                                <span className={`text-[9px] px-1 py-0.5 rounded font-medium leading-none ${typeColors[perm.element_type] || typeColors.action}`}>
                                  {perm.element_type}
                                </span>
                              )}
                            </div>
                            <code className="text-[11px] font-mono text-[var(--color-text-muted)]">{perm.permission_key}</code>
                          </div>
                        </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {filteredModules.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No permissions match your search</p>
              )}
            </div>
          </div>
        )}

        {!selectedRole && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-8 flex items-center justify-center">
            <p className="text-sm text-[var(--color-text-muted)]">Select a role to manage its permissions</p>
          </div>
        )}
      </div>
    </div>
  );
}
