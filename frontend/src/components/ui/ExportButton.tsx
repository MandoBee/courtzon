import { useState } from 'react';

interface ExportButtonProps {
  data: any[];
  filename?: string;
  label?: string;
}

export function ExportButton({ data, filename = 'export', label = 'Export' }: ExportButtonProps) {
  const [open, setOpen] = useState(false);

  const toCSV = () => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const toJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${filename}.json`; a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write('<html><head><title>Export</title><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body>');
    w.document.write('<table><thead><tr>');
    if (data.length) Object.keys(data[0]).forEach(h => w.document.write(`<th>${h}</th>`));
    w.document.write('</tr></thead><tbody>');
    data.forEach(row => {
      w.document.write('<tr>');
      Object.values(row).forEach((v: any) => w.document.write(`<td>${v ?? ''}</td>`));
      w.document.write('</tr>');
    });
    w.document.write('</tbody></table></body></html>');
    w.document.close(); w.print();
    setOpen(false);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="px-3 py-1.5 text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg)]">
        {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg z-50 overflow-hidden">
          <button onClick={toCSV} className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--color-bg)]">CSV</button>
          <button onClick={toJSON} className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--color-bg)]">JSON</button>
          <button onClick={print} className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--color-bg)]">Print</button>
        </div>
      )}
    </div>
  );
}
