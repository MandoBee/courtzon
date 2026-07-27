import { useState } from 'react';
import api from '../../../services/api';

const REPORT_TYPES = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'users', label: 'Users' },
  { value: 'organisations', label: 'Organisations' },
];

export function ExportPanel() {
  const [reportType, setReportType] = useState('revenue');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const response = await api.get(`/bi/export/${reportType}?${params.toString()}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Export failed', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-3">Export Report</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm text-[var(--color-text-muted)] mb-1">Report Type</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg)]"
          >
            {REPORT_TYPES.map((rt) => (
              <option key={rt.value} value={rt.value}>{rt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-[var(--color-text-muted)] mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg)]"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--color-text-muted)] mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-text-muted)]">CSV</span>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
