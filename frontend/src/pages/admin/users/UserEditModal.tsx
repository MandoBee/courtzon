import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Spinner, EntityImage } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface UserEditModalProps {
  userId: number;
  onClose: () => void;
}

const activityColors: Record<string, string> = {
  login: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  logout: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
  page_view: 'bg-purple-100 text-purple-700',
  error: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  password_change: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  role_change: 'bg-orange-100 text-orange-700',
  profile_update: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  booking: 'bg-teal-100 text-teal-700',
  payment: 'bg-emerald-100 text-emerald-700',
};

function getActivityColor(type: string): string {
  for (const [key, color] of Object.entries(activityColors)) {
    if (type.toLowerCase().includes(key)) return color;
  }
  return 'bg-[var(--color-border)] text-[var(--color-text-muted)]';
}

export default function UserEditModal({ userId, onClose }: UserEditModalProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('profile');
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => api.get(`/admin/users/${userId}`).then((r: any) => r.data.data),
  });

  const { data: bookings } = useQuery({
    queryKey: ['admin', 'user', userId, 'bookings'],
    queryFn: () => api.get(`/admin/users/${userId}/bookings`).then((r: any) => r.data.data),
    enabled: activeTab === 'bookings',
  });

  const { data: bookingDetail } = useQuery({
    queryKey: ['admin', 'booking', selectedBookingId],
    queryFn: () => api.get(`/admin/bookings/${selectedBookingId}`).then((r: any) => r.data.data),
    enabled: !!selectedBookingId,
  });

  const { data: academies } = useQuery({
    queryKey: ['admin', 'user', userId, 'academies'],
    queryFn: () => api.get(`/admin/users/${userId}/academies`).then((r: any) => r.data.data),
    enabled: activeTab === 'academies',
  });

  const { data: orders } = useQuery({
    queryKey: ['admin', 'user', userId, 'orders'],
    queryFn: () => api.get(`/admin/users/${userId}/orders`).then((r: any) => r.data.data),
    enabled: activeTab === 'orders',
  });

  const { data: orderDetail } = useQuery({
    queryKey: ['admin', 'order', selectedOrderId],
    queryFn: () => api.get(`/admin/orders/${selectedOrderId}`).then((r: any) => r.data.data),
    enabled: !!selectedOrderId,
  });

  const { data: branchAccess } = useQuery({
    queryKey: ['admin', 'user', userId, 'branch-access'],
    queryFn: () => api.get(`/admin/users/${userId}/branch-access`).then((r: any) => r.data.data),
    enabled: activeTab === 'branch-access',
  });

  const { data: activity } = useQuery({
    queryKey: ['admin', 'user', userId, 'activity'],
    queryFn: () => api.get(`/admin/users/${userId}/activity`).then((r: any) => r.data.data),
    enabled: activeTab === 'activity',
  });

  const { data: allRoles } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.get('/roles').then((r: any) => r.data.data),
  });

  const { data: allOrganisations } = useQuery({
    queryKey: ['admin', 'organisations'],
    queryFn: () => api.get('/organisations').then((r: any) => r.data.data),
  });

  const { data: allCountries } = useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: () => api.get('/countries').then((r: any) => r.data.data),
  });

  const { data: allLanguages } = useQuery({
    queryKey: ['admin', 'languages'],
    queryFn: () => api.get('/languages').then((r: any) => r.data.data),
  });

  const { data: allSports } = useQuery({
    queryKey: ['admin', 'sports'],
    queryFn: () => api.get('/sports/all').then((r: any) => r.data.data),
  });

  const { data: allLevels } = useQuery({
    queryKey: ['player-levels'],
    queryFn: () => api.get('/player-levels').then((r: any) => r.data.data),
  });

  const [form, setForm] = useState<Record<string, any>>({});
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<number | string>('');
  const [isCoach, setIsCoach] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put(`/admin/users/${userId}`, { ...data, isCoach }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSaving(false);
      showToast('User updated successfully!');
    },
    onError: (err: any) => { setSaving(false); showToast('Failed to update user: ' + getErrorMessage(err), 'error'); },
  });

  const assignRoleMutation = useMutation({
    mutationFn: (data: { userId: number; roleId: number; scopes?: { scopeType: string; scopeId: number }[] }) => api.post('/user-roles', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] }); showToast('Role assigned!'); },
    onError: (err: any) => { showToast('Failed to assign role: ' + getErrorMessage(err), 'error'); },
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ roleId }: { roleId: number }) => api.delete(`/user-roles/${userId}/${roleId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] }); showToast('Role removed!'); },
    onError: (err: any) => { showToast('Failed to remove role: ' + getErrorMessage(err), 'error'); },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { newPassword: string }) => api.put(`/admin/users/${userId}/password`, data),
    onSuccess: () => { setPasswordMsg('Password changed successfully'); setNewPassword(''); setNewPasswordConfirm(''); showToast('Password changed successfully!'); },
    onError: (err: any) => { setPasswordMsg('Failed to change password'); showToast('Failed to change password: ' + getErrorMessage(err), 'error'); },
  });

  const user = userData;
  const roles = allRoles || [];
  const userRoles = user?.roles || [];
  const countries = allCountries || [];
  const organisations = allOrganisations || [];
  const languages = allLanguages || [];
  const sports = allSports || [];
  const levels = allLevels || [];

  const orgRoleOptions = roles.filter((r: any) => {
    if (selectedOrgId === '') return false;
    if (selectedOrgId === 'none') return r.organisation_id === null && !r.is_system;
    if (selectedOrgId === 'system') return r.is_system;
    return r.organisation_id === Number(selectedOrgId);
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const initForm = () => {
    if (!user) return;
    setForm({
      fullName: user.full_name || '',
      email: user.email || '',
      phoneNumber: user.phone_number || '',
      accountStatus: user.account_status || 'active',
      gender: user.gender || 'male',
      countryId: user.country_id || '',
      languageId: user.language_id || '',
      mainSportId: user.main_sport_id || '',
      mainLevelId: user.main_level_id || '',
    });
    setIsCoach(!!user.is_coach);
  };

  if (user && Object.keys(form).length === 0) initForm();

  const handleChangePassword = () => {
    if (!newPassword || newPassword.length < 6) { setPasswordMsg('Password must be at least 6 characters'); return; }
    if (newPassword !== newPasswordConfirm) { setPasswordMsg('Passwords do not match'); return; }
    changePasswordMutation.mutate({ newPassword });
  };

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'roles', label: 'Roles & Orgs' },
    { key: 'branch-access', label: 'Branch Access' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'academies', label: 'Academies' },
    { key: 'orders', label: 'Orders' },
    { key: 'activity', label: 'Activity Log' },
  ];

  const renderAvatar = (u: any) => (
    <EntityImage
      src={u?.avatar_url}
      name={u?.full_name || u?.email || 'User'}
      className="w-10 h-10 rounded-full text-lg"
    />
  );

  if (userLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-8"><Spinner /></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 bg-black/50 overflow-y-auto">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-5xl mx-4 mb-8">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            {renderAvatar(user)}
            <h2 className="text-lg font-bold text-[var(--color-text)]">{user?.full_name || 'User'}</h2>
            {user?.account_status && (
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                user.account_status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                user.account_status === 'suspended' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'
              }`}>{user.account_status}</span>
            )}
            {(user as any)?.has_activated_selling === 1 && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">Free Selling</span>
            )}
          </div>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>

        <div className="flex border-b overflow-x-auto">
          {tabs.map((tab: any) => {
            const tabPerms: Record<string, string> = {
              bookings: 'users.view-bookings',
              academies: 'users.view-bookings',
              orders: 'users.view-orders',
              activity: 'users.view-activity',
            };
            const neededPerm = tabPerms[tab.key];
            const btn = (
              <button
                onClick={() => { setActiveTab(tab.key); setSelectedBookingId(null); setSelectedOrderId(null); }}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {tab.label}
              </button>
            );
            return neededPerm ? (
              <Can key={tab.key} permission={neededPerm}>{btn}</Can>
            ) : (
              <span key={tab.key}>{btn}</span>
            );
          })}
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {activeTab === 'profile' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Can permission="users.edit.first-name">
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Full Name</label>
                  <input value={form.fullName || ''} onChange={(e: any) => set('fullName', e.target.value)}
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
                </Can>
                <Can permission="users.edit.email">
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Email</label>
                  <input value={form.email || ''} onChange={(e: any) => set('email', e.target.value)}
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
                </Can>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Gender</label>
                  <select value={form.gender || 'male'} onChange={(e: any) => set('gender', e.target.value)}
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Account Status</label>
                  <Can permission="users.edit.status">
                  <div className="flex items-center gap-2">
                    {['active', 'suspended', 'banned'].map((status: any) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => set('accountStatus', status)}
                        className={`px-3 py-1.5 text-xs rounded-[var(--radius-md)] font-medium transition-colors ${
                          form.accountStatus === status
                            ? status === 'active' ? 'bg-[var(--color-success)] text-white'
                            : status === 'suspended' ? 'bg-yellow-500 text-white'
                            : 'bg-[var(--color-error)] text-white'
                            : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border hover:border-[var(--color-primary)]'
                        }`}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </button>
                    ))}
                  </div>
                  </Can>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Country</label>
                  <select value={form.countryId || ''} onChange={(e: any) => set('countryId', e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                    <option value="">Select country...</option>
                    {countries.filter((c: any) => c.is_active).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.isoCode || c.iso_code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Language</label>
                  <select value={form.languageId || ''} onChange={(e: any) => set('languageId', e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                    <option value="">Select language...</option>
                    {languages.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.code} — {l.name} ({l.native_name})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Main Sport</label>
                  <select value={form.mainSportId || ''} onChange={(e: any) => set('mainSportId', e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                    <option value="">None</option>
                    {sports.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.icon && !s.icon.startsWith('/uploads/') ? s.icon + ' ' : ''}{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Level</label>
                  <select value={form.mainLevelId || ''} onChange={(e: any) => set('mainLevelId', e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                    <option value="">None</option>
                    {levels.map((lv: any) => (
                      <option key={lv.id} value={lv.id}>{lv.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 border-t pt-4 mt-2">
                  <Can permission="coaches.assign">
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={isCoach} onChange={(e: any) => setIsCoach(e.target.checked)} />
                        <div className="w-9 h-5 bg-[var(--color-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--color-border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]" />
                      </label>
                      <span className="text-sm font-medium text-[var(--color-text)]">Assign as Coach</span>
                      {user?.coach_status && user.coach_status !== 'none' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          user.coach_status === 'approved' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                          user.coach_status === 'pending' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' :
                          user.coach_status === 'rejected' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                        }`}>{user.coach_status}</span>
                      )}
                    </div>
                  </Can>
                </div>
                <div className="md:col-span-2 flex items-center gap-3 pt-2">
                  <Can permission="users.edit">
                    <Button onClick={() => { setSaving(true); updateMutation.mutate(form); }} loading={saving}>Save Changes</Button>
                  </Can>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium text-[var(--color-text)] mb-3">Change Password</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="block text-xs text-[var(--color-text-muted)] mb-1">New Password</label>
                    <input type="password" value={newPassword} onChange={(e: any) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-muted)] mb-1">Confirm Password</label>
                    <input type="password" value={newPasswordConfirm} onChange={(e: any) => setNewPasswordConfirm(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Can permission="users.change-password">
                      <Button onClick={handleChangePassword} loading={changePasswordMutation.isPending}>Change</Button>
                    </Can>
                    {passwordMsg && <span className={`text-xs ${passwordMsg.includes('success') ? 'text-[var(--color-success-text)]' : 'text-[var(--color-error-text)]'}`}>{passwordMsg}</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roles' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="flex flex-col">
                  <h4 className="font-medium text-[var(--color-text)] mb-3">Current Roles</h4>
                  <div className="space-y-2 flex-1">
                    {userRoles.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No roles assigned</p>}
                    {userRoles.map((ur: any) => (
                      <div key={ur.id} className="flex items-center justify-between bg-[var(--color-bg)] px-3 py-2 rounded-[var(--radius-md)] h-[42px]">
                        <span className="text-sm font-medium text-[var(--color-text)]">{ur.role_name}</span>
                        <Can permission="users.assign-role">
                          <Button variant="ghost" className="text-[var(--color-error)] text-xs"
                            onClick={() => removeRoleMutation.mutate({ roleId: ur.role_id })}>
                            Remove
                          </Button>
                        </Can>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col">
                  <h4 className="font-medium text-[var(--color-text)] mb-3">Organisations</h4>
                  <div className="space-y-2 flex-1">
                    {userRoles.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No organisation roles</p>}
                    {userRoles.map((ur: any) => (
                      <div key={ur.id} className="flex items-center justify-between bg-[var(--color-bg)] px-3 py-2 rounded-[var(--radius-md)] h-[42px]">
                        <span className="text-sm font-medium text-[var(--color-text)]">{ur.organisation_name || (ur.is_system ? 'System' : 'No Organization')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <h4 className="font-medium text-[var(--color-text)] mb-3">Assign Role</h4>
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedOrgId} onChange={(e: any) => { setSelectedOrgId(e.target.value); }}
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[180px]">
                  <option value="">Select organization...</option>
                  <option value="none">No Organization</option>
                  <option value="system">System</option>
                  {organisations.map((o: any) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <Can permission="users.edit.role">
                <select id="roleSelect" className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[200px]">
                  <option value="">Select role...</option>
                  {orgRoleOptions.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.slug})</option>
                  ))}
                </select>
                </Can>
                <Can permission="users.assign-role">
                  <Button onClick={() => {
                    const sel = (document.getElementById('roleSelect') as HTMLSelectElement);
                    if (sel.value) {
                      const payload: { userId: number; roleId: number; scopes?: { scopeType: string; scopeId: number }[] } = { userId, roleId: Number(sel.value) };
                      const orgId = selectedOrgId;
                      if (orgId !== '' && orgId !== 'none' && orgId !== 'system') {
                        payload.scopes = [{ scopeType: 'organisation', scopeId: Number(orgId) }];
                      }
                      assignRoleMutation.mutate(payload);
                      sel.value = '';
                    }
                  }}>Assign</Button>
                </Can>
              </div>
            </div>
          )}

          {activeTab === 'branch-access' && (
            <div>
              {!branchAccess?.length ? <p className="text-sm text-[var(--color-text-muted)]">No branch access requests</p> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[var(--color-text-muted)]">
                      <th className="px-3 py-2 font-medium">Branch</th>
                      <th className="px-3 py-2 font-medium">Organisation</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchAccess.map((a: any) => (
                      <tr key={a.id} className="border-b hover:bg-[var(--color-bg)]/50">
                        <td className="px-3 py-2 font-medium">{a.branch_name}</td>
                        <td className="px-3 py-2">{a.org_name}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            a.status === 'approved' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                            a.status === 'rejected' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' :
                            a.status === 'pending' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                          }`}>{a.status}</span>
                        </td>
                        <td className="px-3 py-2 text-xs">{new Date(a.created_at).toLocaleDateString('en-GB')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'bookings' && (
            <div>
              {selectedBookingId && bookingDetail ? (
                <div>
                  <button onClick={() => setSelectedBookingId(null)}
                    className="text-sm text-[var(--color-primary)] mb-4">← Back to bookings</button>
                  <div className="bg-[var(--color-bg)] p-4 rounded-[var(--radius-md)]">
                    <h4 className="font-medium mb-2">Booking #{bookingDetail.id}</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-[var(--color-text-muted)]">Type:</span> {bookingDetail.booking_type}</div>
                      <div><span className="text-[var(--color-text-muted)]">Resource:</span> {bookingDetail.resource_name || '—'}</div>
                      <div><span className="text-[var(--color-text-muted)]">Org:</span> {bookingDetail.org_name || '—'}</div>
                      <div><span className="text-[var(--color-text-muted)]">Date:</span> {new Date(bookingDetail.booking_date).toLocaleDateString('en-GB')}</div>
                      <div><span className="text-[var(--color-text-muted)]">Time:</span> {bookingDetail.start_time} - {bookingDetail.end_time}</div>
                      <div><span className="text-[var(--color-text-muted)]">Amount:</span> {bookingDetail.total_amount}</div>
                      <div><span className="text-[var(--color-text-muted)]">Status:</span> {bookingDetail.booking_status}</div>
                      <div><span className="text-[var(--color-text-muted)]">Payment:</span> {bookingDetail.payment_status}</div>
                      <div className="col-span-2"><span className="text-[var(--color-text-muted)]">Notes:</span> {bookingDetail.notes || '—'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {!bookings?.length ? <p className="text-sm text-[var(--color-text-muted)]">No bookings found</p> : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-[var(--color-text-muted)]">
                          <th className="px-3 py-2 font-medium">ID</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Resource</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Payment</th>
                          <th className="px-3 py-2 font-medium">Amount</th>
                          <th className="px-3 py-2 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.map((b: any) => (
                          <tr key={b.id} onClick={() => setSelectedBookingId(b.id)}
                            className="border-b hover:bg-[var(--color-bg)]/50 cursor-pointer">
                            <td className="px-3 py-2 font-mono text-xs">#{b.id}</td>
                            <td className="px-3 py-2">{b.booking_type}</td>
                            <td className="px-3 py-2">{b.resource_name || '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                b.booking_status === 'confirmed' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                                b.booking_status === 'cancelled' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                              }`}>{b.booking_status}</span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                b.payment_status === 'paid' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                                b.payment_status === 'pending' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                              }`}>{b.payment_status}</span>
                            </td>
                            <td className="px-3 py-2">{b.total_amount}</td>
                            <td className="px-3 py-2 text-xs">{new Date(b.created_at).toLocaleDateString('en-GB')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'academies' && (
            <div>
              {!academies?.length ? <p className="text-sm text-[var(--color-text-muted)]">No academy enrollments</p> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[var(--color-text-muted)]">
                      <th className="px-3 py-2 font-medium">Academy</th>
                      <th className="px-3 py-2 font-medium">Sport</th>
                      <th className="px-3 py-2 font-medium">Organisation</th>
                      <th className="px-3 py-2 font-medium">Enrolled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {academies.map((a: any) => (
                      <tr key={a.id} className="border-b hover:bg-[var(--color-bg)]/50">
                        <td className="px-3 py-2">{a.academy_name}</td>
                        <td className="px-3 py-2">{a.sport_name || '—'}</td>
                        <td className="px-3 py-2">{a.org_name || '—'}</td>
                        <td className="px-3 py-2 text-xs">{new Date(a.enrolled_at).toLocaleDateString('en-GB')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'orders' && (
            <div>
              {selectedOrderId && orderDetail ? (
                <div>
                  <button onClick={() => setSelectedOrderId(null)}
                    className="text-sm text-[var(--color-primary)] mb-4">← Back to orders</button>
                  <div className="bg-[var(--color-bg)] p-4 rounded-[var(--radius-md)]">
                    <h4 className="font-medium mb-2">Order #{orderDetail.id} — {orderDetail.public_id}</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                      <div><span className="text-[var(--color-text-muted)]">Status:</span> {orderDetail.status}</div>
                      <div><span className="text-[var(--color-text-muted)]">Payment:</span> {orderDetail.payment_status}</div>
                      <div><span className="text-[var(--color-text-muted)]">Subtotal:</span> {orderDetail.subtotal}</div>
                      <div><span className="text-[var(--color-text-muted)]">Total:</span> {orderDetail.total}</div>
                      <div><span className="text-[var(--color-text-muted)]">Shipping:</span> {orderDetail.shipping_cost}</div>
                      <div><span className="text-[var(--color-text-muted)]">Currency:</span> {orderDetail.currency_code}</div>
                    </div>
                    <h5 className="text-sm font-medium mb-2">Items ({orderDetail.items?.length || 0})</h5>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-[var(--color-text-muted)]">
                          <th className="px-2 py-1 font-medium">Product</th>
                          <th className="px-2 py-1 font-medium">Qty</th>
                          <th className="px-2 py-1 font-medium">Price</th>
                          <th className="px-2 py-1 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderDetail.items?.map((item: any) => (
                          <tr key={item.id} className="border-b">
                            <td className="px-2 py-1">{item.product_name || item.product_id}</td>
                            <td className="px-2 py-1">{item.quantity}</td>
                            <td className="px-2 py-1">{item.unit_price}</td>
                            <td className="px-2 py-1">{item.total_price}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <>
                  {!orders?.length ? <p className="text-sm text-[var(--color-text-muted)]">No orders found</p> : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-[var(--color-text-muted)]">
                          <th className="px-3 py-2 font-medium">Order #</th>
                          <th className="px-3 py-2 font-medium">Items</th>
                          <th className="px-3 py-2 font-medium">Total</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o: any) => (
                          <tr key={o.id} onClick={() => setSelectedOrderId(o.id)}
                            className="border-b hover:bg-[var(--color-bg)]/50 cursor-pointer">
                            <td className="px-3 py-2 font-mono text-xs">#{o.id}</td>
                            <td className="px-3 py-2">{o.item_count}</td>
                            <td className="px-3 py-2">{o.total}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                o.status === 'delivered' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                                o.status === 'cancelled' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]'
                              }`}>{o.status}</span>
                            </td>
                            <td className="px-3 py-2 text-xs">{new Date(o.created_at).toLocaleDateString('en-GB')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div>
              {!activity?.length ? <p className="text-sm text-[var(--color-text-muted)]">No activity recorded</p> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[var(--color-text-muted)]">
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">IP</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((a: any) => (
                      <tr key={a.id} className="border-b hover:bg-[var(--color-bg)]/50">
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getActivityColor(a.activity_type)}`}>
                            {a.activity_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">{a.description || a.activity_type}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{a.ip_address || '—'}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{new Date(a.created_at).toLocaleString('en-GB')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
