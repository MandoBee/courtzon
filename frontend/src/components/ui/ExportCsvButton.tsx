import { useState } from 'react';
import api from '../../services/api';
import { useToast } from './Toast';
import { useCan } from '../../hooks/useCan';

interface ExportCsvButtonProps {
  /** API endpoint that returns a CSV blob (same permission as the host screen). */
  endpoint: string;
  /** Query params forwarded to the export endpoint (respects the screen filters). */
  params?: Record<string, string | number | undefined>;
  /** Base filename, e.g. "settlements" → settlements_YYYY-MM-DD.csv */
  filename?: string;
  label?: string;
  disabled?: boolean;
  /**
   * Optional permission key gating the export control.
   *
   * When provided the control renders ONLY for a user who holds that permission
   * (fail-closed: signed-out / unknown permission → nothing renders). When
   * omitted the component keeps its legacy behaviour (no gate) so unrelated
   * screens are unaffected.
   */
  permission?: string;
}

/**
 * Download a CSV export from a backend endpoint.
 * - Shows a loading state and prevents duplicate clicks.
 * - Shows a toast on failure.
 * - Uses the backend-provided Content-Disposition filename when available.
 */
export function ExportCsvButton({
  endpoint,
  params,
  filename = 'export',
  label = 'Export CSV',
  disabled,
  permission,
}: ExportCsvButtonProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const { can } = useCan();
  // Fail-closed: only an explicit grant unlocks the control.
  const allowed = !permission || can(permission);

  const handleDownload = async () => {
    if (!allowed || loading) return;
    setLoading(true);
    try {
      const response = await api.get(endpoint, {
        params,
        responseType: 'blob',
      });

      // Prefer the server-provided filename (settlements_2026-08-26.csv).
      let fileName = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
      const disposition = (response.headers?.['content-disposition'] || '') as string;
      const match = disposition.match(/filename="?([^";]+)"?/i);
      if (match?.[1]) fileName = match[1];

      const url = window.URL.createObjectURL(new Blob([response.data as BlobPart], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Export downloaded');
    } catch (e: any) {
      showToast(e?.response?.data?.message || e?.message || 'Export failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!allowed) return null;

  return (
    <button
      onClick={handleDownload}
      disabled={disabled || loading}
      className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] text-sm font-medium hover:bg-[var(--color-bg)] disabled:opacity-50"
    >
      {loading ? 'Exporting…' : label}
    </button>
  );
}
