import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import AppSettingsImageUpload from '../../../components/app-settings/AppSettingsImageUpload';

type SettingRow = { setting_key: string; value: unknown };

function toMap(rows: SettingRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    const v = row.value;
    map[row.setting_key] = typeof v === 'string' ? v : v == null ? '' : String(v);
  }
  return map;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]';

function TextField({
  label,
  hint,
  type = 'text',
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text)] mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      {hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

function ImageField({
  label,
  hint,
  assetType,
  value,
  permission,
  previewClassName,
  onChange,
}: {
  label: string;
  hint?: string;
  assetType: 'site-logo' | 'site-logo-dark' | 'favicon' | 'favicon-dark' | 'pwa-192' | 'pwa-512';
  value: string;
  permission: string;
  previewClassName: string;
  onChange: (url: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text)] mb-1">{label}</label>
      {hint && <p className="text-xs text-[var(--color-text-muted)] mb-2">{hint}</p>}
      <AppSettingsImageUpload
        assetType={assetType}
        value={value}
        permission={permission}
        onChange={onChange}
        previewClassName={previewClassName}
      />
    </div>
  );
}

export default function AppSettingsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => api.get('/admin/app-settings').then((r: any) => r.data.data as SettingRow[]),
  });

  useEffect(() => {
    if (!data) return;
    const map = toMap(data);
    setForm(map);
    const mm = data.find((r) => r.setting_key === 'maintenance_mode')?.value;
    setMaintenanceMode(mm === true || mm === 'true' || mm === 1 || mm === '1');
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.put('/admin/app-settings', { settings: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      showToast('App settings saved!');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || err.message || 'Save failed', 'error'),
  });

  const handleSave = () => {
    const settings: Record<string, unknown> = {
      site_name: form.site_name,
      site_tagline: form.site_tagline,
      support_email: form.support_email,
      domain_name: form.domain_name,
      meta_description: form.meta_description,
      favicon_url: form.favicon_url,
      favicon_dark_url: form.favicon_dark_url,
      site_logo_url: form.site_logo_url,
      site_logo_dark_url: form.site_logo_dark_url,
      pwa_icon_192: form.pwa_icon_192,
      pwa_icon_512: form.pwa_icon_512,
      maintenance_mode: maintenanceMode,
    };
    saveMutation.mutate(settings);
  };

  const setField = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (isLoading) return <p className="text-[var(--color-text-muted)]">Loading...</p>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">Branding</h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">
        Platform-wide branding and configuration. Images are validated for size, dimensions, and format before upload.
      </p>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 space-y-6">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">General</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Can permission="app-settings.edit.site-name">
              <TextField
                label="Site Name"
                value={form.site_name ?? ''}
                onChange={(v) => setField('site_name', v)}
              />
            </Can>
            <Can permission="app-settings.edit.site-tagline">
              <TextField
                label="Site Tagline"
                value={form.site_tagline ?? ''}
                onChange={(v) => setField('site_tagline', v)}
              />
            </Can>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Can permission="app-settings.edit.domain-name">
              <TextField
                label="Domain Name"
                hint="e.g. courtzon.com"
                value={form.domain_name ?? ''}
                onChange={(v) => setField('domain_name', v)}
              />
            </Can>
            <Can permission="app-settings.edit.support-email">
              <TextField
                label="Support Email"
                type="email"
                value={form.support_email ?? ''}
                onChange={(v) => setField('support_email', v)}
              />
            </Can>
          </div>

          <Can permission="app-settings.edit.meta-description">
            <TextField
              label="Meta Description"
              value={form.meta_description ?? ''}
              onChange={(v) => setField('meta_description', v)}
            />
          </Can>
        </section>

        <section className="space-y-4 border-t border-[var(--color-border)] pt-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Branding images</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Can permission="app-settings.edit.site-logo">
              <ImageField
                label="Site Logo (Light Mode)"
                hint="Shown on light backgrounds — use dark text/icon."
                assetType="site-logo"
                value={form.site_logo_url ?? ''}
                permission="app-settings.edit.site-logo"
                previewClassName="w-full max-w-[180px] h-16 bg-[var(--color-bg)]"
                onChange={(url) => setField('site_logo_url', url)}
              />
            </Can>
            <Can permission="app-settings.edit.site-logo-dark">
              <ImageField
                label="Site Logo (Dark Mode)"
                hint="Shown on dark backgrounds — use light text/icon."
                assetType="site-logo-dark"
                value={form.site_logo_dark_url ?? ''}
                permission="app-settings.edit.site-logo-dark"
                previewClassName="w-full max-w-[180px] h-16 bg-[#121212]"
                onChange={(url) => setField('site_logo_dark_url', url)}
              />
            </Can>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Can permission="app-settings.edit.favicon">
              <ImageField
                label="Favicon (Light Mode)"
                hint="Browser tab icon on light theme — use a dark icon."
                assetType="favicon"
                value={form.favicon_url ?? ''}
                permission="app-settings.edit.favicon"
                previewClassName="w-16 h-16 bg-[var(--color-bg)]"
                onChange={(url) => setField('favicon_url', url)}
              />
            </Can>
            <Can permission="app-settings.edit.favicon-dark">
              <ImageField
                label="Favicon (Dark Mode)"
                hint="Browser tab icon on dark theme — use a light icon."
                assetType="favicon-dark"
                value={form.favicon_dark_url ?? ''}
                permission="app-settings.edit.favicon-dark"
                previewClassName="w-16 h-16 bg-[#121212]"
                onChange={(url) => setField('favicon_dark_url', url)}
              />
            </Can>
          </div>

          <Can permission="app-settings.edit.pwa-images">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ImageField
                label="PWA Icon (192×192)"
                assetType="pwa-192"
                value={form.pwa_icon_192 ?? ''}
                permission="app-settings.edit.pwa-images"
                previewClassName="w-24 h-24"
                onChange={(url) => setField('pwa_icon_192', url)}
              />
              <ImageField
                label="PWA Icon (512×512)"
                assetType="pwa-512"
                value={form.pwa_icon_512 ?? ''}
                permission="app-settings.edit.pwa-images"
                previewClassName="w-28 h-28"
                onChange={(url) => setField('pwa_icon_512', url)}
              />
            </div>
          </Can>
        </section>

        <Can permission="app-settings.edit.maintenance-mode">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)] border-t border-[var(--color-border)] pt-5">
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
              className="rounded border-[var(--color-border)]"
            />
            Maintenance mode
          </label>
        </Can>

        <Can permission="app-settings.edit">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save settings'}
          </button>
        </Can>
      </div>
    </div>
  );
}
