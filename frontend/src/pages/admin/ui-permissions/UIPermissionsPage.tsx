import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { uiRegistry } from '../../../permissions/registry';
import { useToast } from '../../../components/ui/Toast';

type ElementType = 'button' | 'tab' | 'page' | 'section' | 'action' | 'field';

interface UIPermRow {
  id: number;
  permission_key: string;
  module_id: number;
  module_slug: string;
  element_type: ElementType | null;
  element_label: string | null;
  component_path: string | null;
  roles: { role_id: number; role_name: string; role_slug: string; has_permission: boolean }[];
}

export default function UIPermissionsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ElementType | 'all'>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [savingPermId, setSavingPermId] = useState<number | null>(null);
  const { showToast } = useToast();

  const { data: uiPerms, isLoading } = useQuery({
    queryKey: ['admin', 'ui-permissions'],
    queryFn: () => api.get('/ui-permissions').then((r: any) => r.data.data as UIPermRow[]),
  });

  const { data: roles } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.get('/roles').then((r: any) => r.data.data),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const elements = uiRegistry.map((e: any) => ({
        permissionKey: e.permissionKey,
        moduleSlug: e.moduleSlug,
        elementType: e.elementType,
        elementLabel: e.elementLabel,
        componentPath: e.componentPath,
      }));
      const res = await api.post('/ui-permissions/sync', { elements });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ui-permissions'] });
      showToast('Registry synced successfully!');
    },
    onError: () => {
      showToast('Sync failed. Check console.', 'error');
    },
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ permissionId, roleId, hasPermission }: { permissionId: number; roleId: number; hasPermission: boolean }) => {
      setSavingPermId(permissionId);
      const role = roles?.find((r: any) => r.id === roleId);
      if (!role) return;
      const currentPerms = await api.get(`/roles/${roleId}`).then((r: any) => r.data);
      let permIds: number[] = currentPerms.permissionIds || [];
      if (hasPermission) {
        permIds = permIds.filter((id: number) => id !== permissionId);
      } else {
        if (!permIds.includes(permissionId)) {
          permIds.push(permissionId);
        }
      }
      await api.put(`/roles/${roleId}/permissions`, { permissionIds: permIds });
    },
    onSettled: () => {
      setSavingPermId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'ui-permissions'] });
    },
  });

  const filteredPerms = useMemo(() => {
    if (!uiPerms) return [];
    return uiPerms.filter((p: any) => {
      if (search && !p.element_label?.toLowerCase().includes(search.toLowerCase()) && !p.permission_key.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== 'all' && p.element_type !== typeFilter) return false;
      if (moduleFilter !== 'all' && p.module_slug !== moduleFilter) return false;
      return true;
    });
  }, [uiPerms, search, typeFilter, moduleFilter]);

  const groupedByModule = useMemo(() => {
    const groups: Record<string, UIPermRow[]> = {};
    for (const p of filteredPerms) {
      const key = p.module_slug || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  }, [filteredPerms]);

  const modules = useMemo(() => {
    if (!uiPerms) return [];
    const mods = new Set(uiPerms.map((p: any) => p.module_slug));
    return Array.from(mods).sort();
  }, [uiPerms]);

  const elementTypes: { value: ElementType | 'all'; label: string }[] = [
    { value: 'all', label: 'All Types' },
    { value: 'page', label: 'Pages' },
    { value: 'tab', label: 'Tabs' },
    { value: 'button', label: 'Buttons' },
    { value: 'section', label: 'Sections' },
    { value: 'action', label: 'Actions' },
    { value: 'field', label: 'Fields' },
  ];

  const typeColors: Record<string, string> = {
    page: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    tab: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
    button: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
    section: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    action: 'bg-[var(--color-border)] text-[var(--color-text)]  text-[var(--color-text-muted)]',
    field: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">UI Permissions</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50"
          >
            {syncMutation.isPending ? 'Syncing...' : 'Sync Registry'}
          </button>
        </div>
      </div>

      <p className="text-sm text-[var(--color-text-muted)] mb-6">
        Control which UI elements each role can see. Toggle checkboxes to grant or revoke access.
        New elements are registered in <code className="text-xs bg-[var(--color-bg)] px-1 py-0.5 rounded">frontend/src/permissions/registry.ts</code>.
      </p>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Search elements..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          className="px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-56"
        />
        <select
          value={typeFilter}
          onChange={(e: any) => setTypeFilter(e.target.value as ElementType | 'all')}
          className="px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
        >
          {elementTypes.map((t: any) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={moduleFilter}
          onChange={(e: any) => setModuleFilter(e.target.value)}
          className="px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
        >
          <option value="all">All Modules</option>
          {modules.map((m: any) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
          {uiPerms && filteredPerms.length !== uiPerms.length && (
          <span className="text-xs text-[var(--color-text-muted)]">{filteredPerms.length} of {uiPerms.length} elements</span>
        )}
      </div>

      {/* UI Elements List */}
      {Object.entries(groupedByModule).length === 0 && (
        <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
          No UI elements found. Click "Sync Registry" to populate from the codebase.
        </div>
      )}

      {Object.entries(groupedByModule).map(([moduleSlug, perms]) => (
        <div key={moduleSlug} className="mb-8 bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="px-5 py-3 border-b bg-[var(--color-bg)]/50 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-text)] capitalize">{moduleSlug}</h2>
            <span className="text-xs text-[var(--color-text-muted)]">{perms.length} elements</span>
          </div>

          {/* Table Header */}
          <div className="hidden lg:grid grid-cols-[1fr_100px_120px_1fr] gap-4 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-bg)]/30 border-b">
            <span>Element</span>
            <span>Type</span>
            <span>Key</span>
            <span className="text-right">Role Access</span>
          </div>

          {perms.map((perm: any) => (
            <div key={perm.id} className="px-5 py-3 border-b last:border-b-0 hover:bg-[var(--color-bg)]/30">
              {/* Mobile layout */}
              <div className="lg:hidden space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text)]">{perm.element_label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColors[perm.element_type || 'action'] || typeColors.action}`}>
                    {perm.element_type}
                  </span>
                </div>
                <code className="text-[11px] font-mono text-[var(--color-text-muted)] block">{perm.permission_key}</code>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {roles?.filter((r: any) => !r.deleted_at).map((role: any) => {
                    const roleAssignment = perm.roles?.find((ra: any) => ra.role_id === role.id);
                    const hasPerm = roleAssignment?.has_permission ?? false;
                    return (
                      <label
                        key={role.id}
                        className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                          hasPerm
                            ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                            : 'bg-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={hasPerm}
                          disabled={savingPermId === perm.id}
                          onChange={() =>
                            toggleRoleMutation.mutate({
                              permissionId: perm.id,
                              roleId: role.id,
                              hasPermission: hasPerm,
                            })
                          }
                          className="sr-only"
                        />
                        {role.name}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Desktop layout */}
              <div className="hidden lg:grid grid-cols-[1fr_100px_120px_1fr] gap-4 items-center">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-[var(--color-text)]">{perm.element_label}</span>
                  {perm.component_path && (
                    <p className="text-[10px] text-[var(--color-text-muted)] font-mono truncate mt-0.5">{perm.component_path}</p>
                  )}
                </div>
                <div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColors[perm.element_type || 'action'] || typeColors.action}`}>
                    {perm.element_type}
                  </span>
                </div>
                <div>
                  <code className="text-[10px] font-mono text-[var(--color-text-muted)] break-all">{perm.permission_key}</code>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {roles?.filter((r: any) => !r.deleted_at).map((role: any) => {
                    const roleAssignment = perm.roles?.find((ra: any) => ra.role_id === role.id);
                    const hasPerm = roleAssignment?.has_permission ?? false;
                    return (
                      <label
                        key={role.id}
                        className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                          hasPerm
                            ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                            : 'bg-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={hasPerm}
                          disabled={savingPermId === perm.id}
                          onChange={() =>
                            toggleRoleMutation.mutate({
                              permissionId: perm.id,
                              roleId: role.id,
                              hasPermission: hasPerm,
                            })
                          }
                          className="sr-only"
                        />
                        {role.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
